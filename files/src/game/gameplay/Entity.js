import * as THREE from 'three';
import { T_CLIMB, T_LIQUID, T_DAMAGE, BLOCKS, SHAPE } from '../world/Blocks.js';
import { damp, dampAngle, clamp } from '../core/math.js';

let NEXT_ID = 1;
const boxes = [];

/**
 * Base game object with voxel physics, health and an optional CharacterModel.
 */
export class Entity {
  constructor(game, opts = {}) {
    this.game = game;
    this.id = NEXT_ID++;
    this.name = opts.name ?? 'entity';
    this.pos = new THREE.Vector3().copy(opts.pos ?? new THREE.Vector3());
    this.vel = new THREE.Vector3();
    this.yaw = opts.yaw ?? 0;
    this.radius = opts.radius ?? 0.3;
    this.height = opts.height ?? 1.8;
    this.gravity = opts.gravity ?? 28;
    this.grounded = false;
    this.inWater = false;
    this.inLava = false;
    this.onLadder = false;
    this.hp = this.maxHp = opts.hp ?? 20;
    this.team = opts.team ?? 'neutral';
    this.alive = true;
    this.invuln = 0;
    this.physics = opts.physics ?? true;
    this.stepHeight = opts.stepHeight ?? 0.6;
    this.autoStep = opts.autoStep ?? 1.05;
    this.model = null;
    this.visualY = this.pos.y;
    this.tags = new Set(opts.tags ?? []);
    this.fallStart = null;
    this.hitWall = false;
    this.knock = new THREE.Vector3();
    this.removed = false;
    this.targetable = opts.targetable ?? true;
    this.solidToOthers = opts.solidToOthers ?? true;
    this.mass = opts.mass ?? 1;
    this.lastDamageTime = -99;
    this.poise = opts.poise ?? 10;
    this.poiseDmg = 0;
    this.statuses = {};
  }

  setModel(model) {
    this.model = model;
    if (model) {
      this.game.scene.add(model.root);
      model.root.position.copy(this.pos);
      model.root.rotation.y = this.yaw;
    }
  }

  get center() {
    return _c.set(this.pos.x, this.pos.y + this.height * 0.55, this.pos.z);
  }
  centerTo(out) {
    return out.set(this.pos.x, this.pos.y + this.height * 0.55, this.pos.z);
  }
  /** True when no opaque block lies between the centres of this entity and `other`. */
  canSee(other) {
    return this.game.world.lineOfSight(this.centerTo(_from), other.centerTo(_to));
  }
  headTo(out) {
    return out.set(this.pos.x, this.pos.y + this.height * 0.92, this.pos.z);
  }
  forward(out = new THREE.Vector3()) {
    return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }
  distTo(e) {
    return Math.hypot(e.pos.x - this.pos.x, e.pos.y - this.pos.y, e.pos.z - this.pos.z);
  }
  flatDistTo(e) {
    return Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z);
  }
  yawTo(p) {
    return Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
  }
  faceTowards(p, dt, rate = 10) {
    this.yaw = dampAngle(this.yaw, this.yawTo(p), rate, dt);
  }

  /* ---------------- physics ---------------- */
  collide(minx, miny, minz, maxx, maxy, maxz) {
    const w = this.game.world;
    boxes.length = 0;
    for (let y = Math.floor(miny); y <= Math.floor(maxy); y++)
      for (let z = Math.floor(minz); z <= Math.floor(maxz); z++)
        for (let x = Math.floor(minx); x <= Math.floor(maxx); x++) w.collisionBoxes(x, y, z, boxes);
    return boxes;
  }

  moveAxis(axis, d) {
    if (d === 0) return 0;
    const r = this.radius,
      h = this.height,
      p = this.pos;
    const eps = 1e-4;
    let minx = p.x - r,
      maxx = p.x + r,
      miny = p.y,
      maxy = p.y + h,
      minz = p.z - r,
      maxz = p.z + r;
    if (axis === 0) d > 0 ? (maxx += d) : (minx += d);
    else if (axis === 1) d > 0 ? (maxy += d) : (miny += d);
    else d > 0 ? (maxz += d) : (minz += d);
    const list = this.collide(minx, miny, minz, maxx, maxy, maxz);
    let move = d;
    for (const b of list) {
      if (axis === 0) {
        if (
          b[4] <= p.y + eps ||
          b[1] >= p.y + h - eps ||
          b[5] <= p.z - r + eps ||
          b[2] >= p.z + r - eps
        )
          continue;
        if (d > 0 && b[0] >= p.x + r - eps) move = Math.min(move, b[0] - (p.x + r) - eps);
        if (d < 0 && b[3] <= p.x - r + eps) move = Math.max(move, b[3] - (p.x - r) + eps);
      } else if (axis === 1) {
        if (
          b[3] <= p.x - r + eps ||
          b[0] >= p.x + r - eps ||
          b[5] <= p.z - r + eps ||
          b[2] >= p.z + r - eps
        )
          continue;
        if (d > 0 && b[1] >= p.y + h - eps) move = Math.min(move, b[1] - (p.y + h) - eps);
        if (d < 0 && b[4] <= p.y + eps) move = Math.max(move, b[4] - p.y + eps);
      } else {
        if (
          b[3] <= p.x - r + eps ||
          b[0] >= p.x + r - eps ||
          b[4] <= p.y + eps ||
          b[1] >= p.y + h - eps
        )
          continue;
        if (d > 0 && b[2] >= p.z + r - eps) move = Math.min(move, b[2] - (p.z + r) - eps);
        if (d < 0 && b[5] <= p.z - r + eps) move = Math.max(move, b[5] - (p.z - r) + eps);
      }
    }
    if (axis === 0) p.x += move;
    else if (axis === 1) p.y += move;
    else p.z += move;
    return move;
  }

  /** True if the entity's box at an offset would overlap any solid. */
  overlapsAt(dx, dy, dz) {
    const r = this.radius - 0.001,
      p = this.pos;
    const list = this.collide(
      p.x + dx - r,
      p.y + dy + 0.001,
      p.z + dz - r,
      p.x + dx + r,
      p.y + dy + this.height - 0.001,
      p.z + dz + r,
    );
    for (const b of list)
      if (
        b[0] < p.x + dx + r &&
        b[3] > p.x + dx - r &&
        b[1] < p.y + dy + this.height - 0.001 &&
        b[4] > p.y + dy + 0.001 &&
        b[2] < p.z + dz + r &&
        b[5] > p.z + dz - r
      )
        return true;
    return false;
  }

  sampleEnvironment() {
    const w = this.game.world;
    const p = this.pos;
    const feet = w.get(Math.floor(p.x), Math.floor(p.y + 0.1), Math.floor(p.z));
    const body = w.get(Math.floor(p.x), Math.floor(p.y + this.height * 0.5), Math.floor(p.z));
    const head = w.get(Math.floor(p.x), Math.floor(p.y + this.height * 0.85), Math.floor(p.z));
    this.inWater = T_LIQUID[body] === 1 || T_LIQUID[feet] === 1;
    this.headUnderwater = T_LIQUID[head] === 1;
    this.inLava = T_LIQUID[feet] === 2 || T_LIQUID[body] === 2;
    this.onLadder = T_CLIMB[feet] === 1 || T_CLIMB[body] === 1;
    const under = w.get(Math.floor(p.x), Math.floor(p.y - 0.05), Math.floor(p.z));
    this.groundBlock = this.grounded ? under : 0;
    this.hazard = Math.max(
      T_DAMAGE[feet],
      T_DAMAGE[body],
      this.grounded ? (BLOCKS[under].name === 'magma' ? 1 : 0) : 0,
    );
  }

  /**
   * Integrate velocity with collisions. wishStep: allow auto step-up of one block (player/NPC walking).
   */
  integrate(dt, { wishStep = false } = {}) {
    this.sampleEnvironment();
    if (!this.physics) {
      this.pos.addScaledVector(this.vel, dt);
      return;
    }
    // gravity & liquids
    if (this.onLadder && this.climbing) {
      /* climbing handled by controller */
    } else if (this.inWater) {
      this.vel.y -= this.gravity * 0.25 * dt;
      this.vel.y = Math.max(this.vel.y, -3);
      this.vel.multiplyScalar(Math.max(0, 1 - 2.5 * dt));
    } else if (this.inLava) {
      this.vel.y -= this.gravity * 0.3 * dt;
      this.vel.multiplyScalar(Math.max(0, 1 - 4 * dt));
    } else this.vel.y -= this.gravity * dt;
    this.vel.y = Math.max(this.vel.y, -42);

    // knockback impulse decays
    const kx = this.knock.x * dt,
      kz = this.knock.z * dt;
    this.knock.multiplyScalar(Math.max(0, 1 - 7 * dt));

    const wasGrounded = this.grounded;
    const dy = this.vel.y * dt;
    const my = this.moveAxis(1, dy);
    this.grounded = dy < 0 && my > dy + 1e-5;
    if (my !== dy) this.vel.y = 0;

    const dx = this.vel.x * dt + kx,
      dz = this.vel.z * dt + kz;
    const mx = this.moveAxis(0, dx);
    const mz = this.moveAxis(2, dz);
    this.hitWall = Math.abs(mx - dx) > 1e-4 || Math.abs(mz - dz) > 1e-4;
    // step-up
    const canStep = (wasGrounded || this.grounded) && this.hitWall;
    if (canStep) {
      const maxStep = wishStep ? this.autoStep : this.stepHeight;
      const rx = dx - mx,
        rz = dz - mz;
      for (const s of [0.5, maxStep]) {
        if (s > maxStep) break;
        if (!this.overlapsAt(rx, s, rz) && !this.overlapsAt(0, s, 0)) {
          // check there is ground to stand on after stepping
          this.pos.y += s;
          const ax = this.moveAxis(0, rx);
          const az = this.moveAxis(2, rz);
          if (Math.abs(ax) + Math.abs(az) > 1e-3) {
            this.moveAxis(1, -s - 0.05);
            this.grounded = true;
            this.vel.y = 0;
            this.hitWall = false;
            break;
          } else this.pos.y -= s;
        }
      }
    }
    if (this.hitWall) {
      if (Math.abs(mx - dx) > 1e-4) this.vel.x = 0;
      if (Math.abs(mz - dz) > 1e-4) this.vel.z = 0;
    }
    // fall tracking
    if (!this.grounded && !this.inWater && !this.onLadder) {
      if (this.fallStart == null || this.pos.y > this.fallStart) this.fallStart = this.pos.y;
    } else {
      if (this.fallStart != null && this.grounded && !wasGrounded)
        this.onLand?.(this.fallStart - this.pos.y);
      this.fallStart = null;
    }
    // void
    if (this.pos.y < -20) this.onVoid?.();
  }

  /** Push apart overlapping entities (soft). */
  separate(others, dt) {
    for (const o of others) {
      if (o === this || !o.alive || !o.solidToOthers || !this.solidToOthers) continue;
      const dx = this.pos.x - o.pos.x,
        dz = this.pos.z - o.pos.z;
      const min = this.radius + o.radius;
      if (Math.abs(dx) > min || Math.abs(dz) > min) continue;
      if (Math.abs(this.pos.y - o.pos.y) > Math.max(this.height, o.height)) continue;
      const d = Math.hypot(dx, dz);
      if (d < min && d > 1e-4) {
        const push = ((min - d) / d) * 6 * dt * (o.mass / (this.mass + o.mass));
        this.moveAxis(0, dx * push);
        this.moveAxis(2, dz * push);
      }
    }
  }

  /* ---------------- health ---------------- */
  takeDamage(info) {
    if (!this.alive || this.invuln > 0) return 0;
    const amount = info.amount;
    this.hp = Math.max(0, this.hp - amount);
    this.lastDamageTime = this.game.time;
    if (info.knockback && info.dir) {
      this.knock.x += (info.dir.x * info.knockback * 6) / this.mass;
      this.knock.z += (info.dir.z * info.knockback * 6) / this.mass;
      if (this.grounded && info.lift !== 0)
        this.vel.y = Math.max(this.vel.y, (info.lift ?? 3) / this.mass);
    }
    this.model?.flash(0xff4040, 0.75);
    if (this.hp <= 0) this.die(info);
    return amount;
  }

  heal(n) {
    this.hp = Math.min(this.maxHp, this.hp + n);
  }

  die(info) {
    if (!this.alive) return;
    this.alive = false;
    this.onDeath?.(info);
  }

  /** Sync model transform with smoothing of step-ups. */
  syncModel(dt) {
    if (!this.model) return;
    const dy = this.pos.y - this.visualY;
    if (Math.abs(dy) > 1.2 || dy < 0) this.visualY = this.pos.y;
    else this.visualY = damp(this.visualY, this.pos.y, 18, dt);
    this.model.root.position.set(this.pos.x, this.visualY, this.pos.z);
    this.model.root.rotation.y = this.yaw;
    // local velocity for secondary motion
    const s = Math.sin(-this.yaw),
      c = Math.cos(-this.yaw);
    const local = this.model.animator.localVel;
    local.x = this.vel.x * c + this.vel.z * s;
    local.y = this.vel.y;
    local.z = -this.vel.x * s + this.vel.z * c;
    this.model.update(dt);
  }

  update(dt) {
    if (this.invuln > 0) this.invuln -= dt;
  }

  remove() {
    this.removed = true;
    this.model?.dispose();
    this.model = null;
    this.onRemove?.();
  }
}

const _c = new THREE.Vector3();
const _from = new THREE.Vector3();
const _to = new THREE.Vector3();
void SHAPE;
void clamp;
