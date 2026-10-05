import * as THREE from 'three';
import { damp, dampAngle, clamp, lerp } from '../core/math.js';
import { RAY_OPAQUE } from '../world/World.js';
import { Noise } from '../core/Noise.js';
import { T_OPAQUE, BLOCKS } from '../world/Blocks.js';

/** Blocks a lens can't sit in or see through: opaque blocks and foliage. */
const VIEW_BLOCK = (id) => T_OPAQUE[id] === 1 || BLOCKS[id]?.name.includes('leaves');
/** What the follow camera keeps clear of: anything solid you could see inside (walls, glass, leaves, fences). */
const CAM_BLOCK = (id) => !!id && (RAY_OPAQUE(id) || VIEW_BLOCK(id));
const CAM_R = 0.3; // radius of the camera's collision probe
const LENS_R = 0.16; // half-size of the lens box — larger than the near plane even at FOV 100 on ultrawide
const PROBES = [
  [0, 0],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

/**
 * Third-person orbit camera with collision, lock-on framing, shake and cinematic override.
 */
export class CameraRig {
  constructor(game) {
    this.game = game;
    this.camera = game.renderer.camera;
    this.yaw = Math.PI;
    this.pitch = 0.25;
    this.dist = 5.2;
    this.targetDist = 5.2;
    this.minDist = 2.2;
    this.maxDist = 9;
    this.shoulder = 0.45;
    this.height = 1.55;
    this.focus = new THREE.Vector3();
    this.smoothFocus = new THREE.Vector3();
    this.lock = null;
    this.trauma = 0;
    this.noise = new Noise(9);
    this.t = 0;
    this.mode = 'follow'; // follow | cinematic | fixed
    this.cine = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 55 };
    this.blend = 0; // 0 follow, 1 cinematic
    this.aim = 0;
    this.collDist = 5.2;
    this.lookAhead = new THREE.Vector3();
    this.autoCenter = 0;
    this.pitchMin = -1.1;
    this.pitchMax = 1.35;
    this._right = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this._basis = { f: new THREE.Vector3(), r: new THREE.Vector3() };
    this._tmp = new THREE.Vector3();
    this._pos = new THREE.Vector3();
    this._up = new THREE.Vector3();
    this._probe = new THREE.Vector3();
    this.head = new THREE.Vector3();
    this.pivot = new THREE.Vector3();
    this._hidPlayer = false;
  }

  /** Point is in open air (not inside a solid block or foliage). */
  clear(p) {
    const w = this.game.world;
    return !w || !CAM_BLOCK(w.get(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)));
  }

  /** A box around the lens (bigger than the near plane) touches no block. */
  clearBox(p) {
    const w = this.game.world;
    if (!w) return true;
    const r = LENS_R;
    for (const dx of [-r, r])
      for (const dy of [-r, r])
        for (const dz of [-r, r])
          if (CAM_BLOCK(w.get(Math.floor(p.x + dx), Math.floor(p.y + dy), Math.floor(p.z + dz))))
            return false;
    return true;
  }

  snapBehind(entity) {
    this.yaw = entity.yaw + Math.PI;
    this.pitch = 0.22;
    this.smoothFocus.set(entity.pos.x, entity.pos.y + this.height, entity.pos.z);
  }

  addShake(amount) {
    this.trauma = Math.min(1, this.trauma + amount * (this.game.settings?.cameraShake ?? 1));
  }

  update(dt, target, input) {
    this.t += dt;
    const g = this.game;
    if (input && this.mode === 'follow') {
      const look = input.lookDelta(dt);
      this.yaw -= look.x;
      this.pitch = clamp(this.pitch + look.y, this.pitchMin, this.pitchMax);
      if (input.wheel)
        this.targetDist = clamp(this.targetDist + input.wheel * 0.6, this.minDist, this.maxDist);
      if (look.x !== 0 || look.y !== 0) this.autoCenter = 0;
    }
    // lock-on framing
    if (this.lock && (!this.lock.alive || this.lock.removed)) this.lock = null;
    if (this.lock && target) {
      const dx = this.lock.pos.x - target.pos.x,
        dz = this.lock.pos.z - target.pos.z;
      const want = Math.atan2(dx, dz) + Math.PI;
      this.yaw = dampAngle(this.yaw, want, 6, dt);
      this.pitch = damp(this.pitch, 0.3, 3, dt);
    }
    if (target) {
      const riding = target.mount;
      const baseH = riding ? 2.4 : this.height;
      const tp = riding ? riding.pos : target.pos;
      const tv = riding ? riding.vel : target.vel;
      this.focus.set(tp.x, (target.model ? target.visualY : tp.y) + baseH, tp.z);
      this.head.copy(this.focus);
      // look ahead in movement direction — but never into a wall
      this.lookAhead.x = damp(this.lookAhead.x, tv.x * 0.18, 3, dt);
      this.lookAhead.z = damp(this.lookAhead.z, tv.z * 0.18, 3, dt);
      const la = Math.hypot(this.lookAhead.x, this.lookAhead.z);
      if (la > 0.01 && g.world) {
        const r = g.world.raycast(
          this.focus.x,
          this.focus.y,
          this.focus.z,
          this.lookAhead.x,
          0,
          this.lookAhead.z,
          la + CAM_R,
          CAM_BLOCK,
        );
        if (r.hit) this.lookAhead.multiplyScalar(Math.max(0, r.t - CAM_R) / la);
      }
      this.focus.add(this.lookAhead);
      const fy = damp(this.smoothFocus.y, this.focus.y, target.grounded ? 10 : 4, dt);
      this.smoothFocus.x = damp(this.smoothFocus.x, this.focus.x, 16, dt);
      this.smoothFocus.z = damp(this.smoothFocus.z, this.focus.z, 16, dt);
      this.smoothFocus.y = fy;
      if (Math.abs(this.smoothFocus.y - this.focus.y) > 6) this.smoothFocus.copy(this.focus);
      // auto-center behind a mounted/sprinting player when no mouse input
      this.autoCenter += dt;
      if (riding && this.autoCenter > 1.5 && riding.vel.lengthSq() > 4)
        this.yaw = dampAngle(this.yaw, riding.yaw + Math.PI, 1.5, dt);
    }
    const aimDist = lerp(this.targetDist * (this.game.player?.mount ? 1.35 : 1), 2.2, this.aim);
    this.dist = damp(this.dist, aimDist, 6, dt);
    const shoulder = lerp(this.shoulder, 0.75, this.aim);

    // desired camera position
    const cp = Math.cos(this.pitch),
      sp = Math.sin(this.pitch);
    const dir = this._tmp.set(Math.sin(this.yaw) * cp, sp, Math.cos(this.yaw) * cp);
    const right = this._right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const w = g.world;
    // the over-the-shoulder pivot must stay in open air: against a wall the shoulder offset shrinks
    let shoulderEff = shoulder;
    const base = this.smoothFocus;
    if (w && this.mode !== 'cinematic') {
      if (this.clear(base)) {
        const r = w.raycast(
          base.x,
          base.y,
          base.z,
          right.x,
          0,
          right.z,
          shoulder + CAM_R,
          CAM_BLOCK,
        );
        if (r.hit) shoulderEff = Math.max(0, r.t - CAM_R);
      } else shoulderEff = 0;
    }
    const pivot = this.pivot
      .copy(this.clear(base) || !w ? base : this.head)
      .addScaledVector(right, shoulderEff);
    // collision: a thick probe (centre + 4 rays toward the corners of the lens) instead of one thin ray
    let d = this.dist;
    if (w && this.mode !== 'cinematic') {
      const up = this._up.crossVectors(right, dir).normalize();
      for (const [ox, oy] of PROBES) {
        const tx = pivot.x + dir.x * d + right.x * ox * CAM_R + up.x * oy * CAM_R;
        const ty = pivot.y + dir.y * d + up.y * oy * CAM_R;
        const tz = pivot.z + dir.z * d + right.z * ox * CAM_R + up.z * oy * CAM_R;
        const vx = tx - pivot.x,
          vy = ty - pivot.y,
          vz = tz - pivot.z;
        const len = Math.hypot(vx, vy, vz);
        const r = w.raycast(pivot.x, pivot.y, pivot.z, vx, vy, vz, len, CAM_BLOCK);
        if (r.hit) d = Math.min(d, (r.t / len) * d - 0.15);
      }
      d = Math.max(0.35, d);
      // final guard: the lens itself (a small box) must not overlap any block — step closer until it doesn't
      while (d > 0 && !this.clearBox(this._probe.copy(pivot).addScaledVector(dir, d)))
        d = Math.max(0, d - 0.1);
    }
    this.collDist = d < this.collDist ? d : damp(this.collDist, d, 4, dt);
    // the lens box is checked where the camera actually is (it eases back out after a wall)
    // in the tightest corners the lens may come all the way in to the (open-air) pivot — the hero is hidden then
    if (w && this.mode !== 'cinematic')
      while (
        this.collDist > 0 &&
        !this.clearBox(this._probe.copy(pivot).addScaledVector(dir, this.collDist))
      )
        this.collDist = Math.max(0, this.collDist - 0.1);
    const pos = this._pos.copy(pivot).addScaledVector(dir, this.collDist);
    // with the lens almost inside the hero, hide him rather than fill the screen with the back of his head
    const pl = g.player;
    const tooClose = this.mode !== 'cinematic' && this.collDist < 0.75 && !pl?.mount;
    if (pl?.model && tooClose !== !!this._hidPlayer) {
      pl.model.root.visible = !tooClose;
      this._hidPlayer = tooClose;
    }
    const look = this._look.copy(pivot).addScaledVector(dir, -4);

    // cinematic blend
    this.blend = damp(
      this.blend,
      this.mode === 'cinematic' ? 1 : 0,
      this.mode === 'cinematic' ? 30 : 3.5,
      dt,
    );
    if (this.mode === 'cinematic' && this.cutBlend) this.blend = 1;
    if (this.blend > 0.001) {
      pos.lerp(this.cine.pos, this.blend);
      look.lerp(this.cine.look, this.blend);
      // never film from inside a tree or a wall — in a cutscene, or while gliding back behind the hero
      // after one: slide the lens toward its anchor (the subject / the hero's shoulder) until it's clear
      if (w && this.blend > 0.5) {
        // a cutscene shot is the director's choice — only if the lens itself sits inside a block (a tree,
        // a hillside) walk it toward what it's filming until it's in open air. (The look point may well be
        // inside the ground, so never ray-cast *from* it.)
        if (!this.clear(pos)) {
          const dx = look.x - pos.x,
            dy = look.y - pos.y,
            dz = look.z - pos.z;
          const dl = Math.hypot(dx, dy, dz);
          for (let t = 0.25; t < dl; t += 0.25) {
            this._probe.set(pos.x + (dx / dl) * t, pos.y + (dy / dl) * t, pos.z + (dz / dl) * t);
            if (this.clear(this._probe)) {
              pos.copy(this._probe);
              break;
            }
          }
        }
      } else if (w && this.clear(pivot)) {
        // gliding back behind the hero after a cutscene: keep the line from his shoulder to the lens clear
        const dx = pos.x - pivot.x,
          dy = pos.y - pivot.y,
          dz = pos.z - pivot.z;
        const dl = Math.hypot(dx, dy, dz);
        if (dl > 0.4) {
          const r = w.raycast(pivot.x, pivot.y, pivot.z, dx, dy, dz, dl, CAM_BLOCK);
          let t = r.hit ? Math.max(0, r.t - 0.3) : dl;
          while (
            t > 0 &&
            !this.clearBox(
              this._probe.set(
                pivot.x + (dx / dl) * t,
                pivot.y + (dy / dl) * t,
                pivot.z + (dz / dl) * t,
              ),
            )
          )
            t = Math.max(0, t - 0.1);
          if (t < dl)
            pos.set(pivot.x + (dx / dl) * t, pivot.y + (dy / dl) * t, pivot.z + (dz / dl) * t);
        }
      }
    }
    // shake
    this.trauma = Math.max(0, this.trauma - dt * 1.4);
    const sh = this.trauma * this.trauma;
    if (sh > 0) {
      const n = this.noise;
      pos.x += n.noise2(this.t * 25, 1) * sh * 0.35;
      pos.y += n.noise2(this.t * 25, 7) * sh * 0.35;
      pos.z += n.noise2(this.t * 25, 13) * sh * 0.35;
    }
    this.camera.position.copy(pos);
    this.camera.lookAt(look);
    if (sh > 0) this.camera.rotation.z += this.noise.noise2(this.t * 18, 21) * sh * 0.05;
    const fovTarget =
      this.blend > 0.5
        ? this.cine.fov
        : (g.settings?.fov ?? 70) + (g.player?.sprinting ? 6 : 0) - this.aim * 12;
    g.renderer.baseFov = damp(g.renderer.baseFov, fovTarget, 5, dt);
    this.camera.updateMatrixWorld();
  }

  /** Camera-relative basis for movement input. */
  basis() {
    this._basis.f.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this._basis.r.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    return this._basis;
  }
}
