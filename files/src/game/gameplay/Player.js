import * as THREE from 'three';
import { Entity } from './Entity.js';
import { CharacterModel } from '../actors/CharacterModel.js';
import { damp, dampAngle } from '../core/math.js';
import { canHit } from './rules.js';
export class Player extends Entity {
  constructor(game, pos) {
    super(game, { pos: new THREE.Vector3(...pos), hp: 20 });
    this.setModel(new CharacterModel());
    this.cooldown = 0;
    this.stepTimer = 0;
    this.onVoid = () => game.respawn();
    this.onDeath = () => game.respawn();
    this.onLand = (h) => {
      if (h > 7) this.takeDamage({ amount: Math.floor(h - 5) });
    };
  }
  update(dt) {
    super.update(dt);
    this.cooldown = Math.max(0, this.cooldown - dt);
    const g = this.game,
      i = g.input,
      m = i.moveAxis(),
      { f, r } = g.camera.basis();
    this.sprinting = i.held('sprint') && !i.held('crouch');
    this.crouch = i.held('crouch');
    const speed = this.crouch ? 2 : this.sprinting ? 6.5 : 4.3;
    const wish = f.multiplyScalar(m.y).addScaledVector(r, m.x);
    this.vel.x = damp(this.vel.x, wish.x * speed, 14, dt);
    this.vel.z = damp(this.vel.z, wish.z * speed, 14, dt);
    if (wish.lengthSq() > 0.01) this.yaw = dampAngle(this.yaw, Math.atan2(wish.x, wish.z), 15, dt);
    if (i.pressed('jump') && (this.grounded || this.inWater || this.onLadder)) {
      this.vel.y = this.inWater ? 6 : 9.4;
      g.audio.sfx('jump');
    }
    this.climbing = this.onLadder && Math.abs(m.y) > 0.1;
    if (this.climbing) this.vel.y = m.y * 3;
    this.integrate(dt, { wishStep: !this.crouch });
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, 2, g.world.sx - 2);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, 2, g.world.sz - 2);
    if (this.hazard > 0 && this.invuln <= 0) {
      this.takeDamage({ amount: 2 });
      this.invuln = 1;
    }
    if (i.pressed('combat')) g.mode = 'combat';
    if (i.pressed('mine')) g.mode = 'mine';
    if (i.pressed('build')) g.mode = 'build';
    if (i.pressed('attack') && this.cooldown === 0) {
      this.cooldown = 0.38;
      this.model.animator.play('attack');
      g.audio.sfx('swing');
      if (g.mode === 'combat' && canHit(this, g.enemy) && this.canSee(g.enemy)) {
        g.enemy.takeDamage({ amount: 4, dir: this.forward(), knockback: 0.7 });
        g.particles.hit(g.enemy.center, 0xffd78c);
        g.audio.sfx('hit');
      } else if (g.mode !== 'combat') g.editBlock(false);
    }
    if (i.pressed('place') && g.mode === 'build' && this.cooldown === 0) {
      this.cooldown = 0.2;
      g.editBlock(true);
    }
    if (i.pressed('respawn')) g.respawn();
    if (i.pressed('interact')) g.interact();
    this.stepTimer -= dt;
    if (this.grounded && wish.lengthSq() > 0.05 && this.stepTimer <= 0) {
      g.audio.sfx('step');
      this.stepTimer = this.sprinting ? 0.27 : 0.4;
    }
    Object.assign(this.model.animator.params, {
      speed: Math.hypot(this.vel.x, this.vel.z),
      grounded: this.grounded,
      vy: this.vel.y,
      crouch: this.crouch,
      swimming: this.inWater,
      climbing: this.climbing,
    });
    this.model.weapon.visible = g.mode === 'combat';
    this.syncModel(dt);
  }
  takeDamage(info) {
    const n = super.takeDamage(info);
    if (n) {
      this.game.renderer.effects.hurt = 0.8;
      this.game.camera.addShake(0.2);
      this.game.audio.sfx('hurt');
    }
    return n;
  }
}
