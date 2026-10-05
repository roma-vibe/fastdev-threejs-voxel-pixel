import * as THREE from 'three';
import { Entity } from './Entity.js';
import { CharacterModel } from '../actors/CharacterModel.js';
import { canHit } from './rules.js';
export class Enemy extends Entity {
  constructor(game, pos, defeated = false) {
    super(game, { pos: new THREE.Vector3(...pos), hp: 12 });
    this.home = this.pos.clone();
    this.cooldown = 1;
    this.alive = !defeated;
    if (this.alive) this.setModel(new CharacterModel(true));
  }
  update(dt) {
    if (!this.alive) return;
    super.update(dt);
    this.cooldown -= dt;
    const p = this.game.player,
      d = this.flatDistTo(p),
      active = d < 11 && p.pos.distanceTo(this.home) < 16;
    const target = active ? p.pos : this.home;
    this.faceTowards(target, dt);
    const speed = this.pos.distanceTo(target) > 1.8 ? 2.3 : 0;
    this.vel.x = Math.sin(this.yaw) * speed;
    this.vel.z = Math.cos(this.yaw) * speed;
    this.integrate(dt, { wishStep: true });
    if (active && canHit(this, p, 2) && this.cooldown <= 0) {
      this.cooldown = 1.1;
      this.model.animator.play('attack');
      if (p.invuln <= 0 && this.canSee(p)) {
        p.takeDamage({ amount: 2, dir: this.forward(), knockback: 0.35 });
        p.invuln = 0.6;
      }
    }
    Object.assign(this.model.animator.params, {
      speed,
      grounded: this.grounded,
      vy: this.vel.y,
      combat: active,
    });
    this.syncModel(dt);
  }
  onDeath() {
    this.game.progress.enemyDefeated = true;
    this.game.particles.poof(this.center);
    this.remove();
    this.game.notify('Training guardian defeated');
    this.game.save();
  }
}
