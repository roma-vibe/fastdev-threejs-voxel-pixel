import * as THREE from 'three';
import { buildRig, bipedSpec } from './Rig.js';
import { SkinPainter } from './SkinPainter.js';
import { Animator } from './Animator.js';
export class CharacterModel {
  constructor(enemy = false) {
    const p = new SkinPainter(128, 64, enemy ? 8 : 17);
    const skin = enemy ? [0x7c9987, 0x6f8b7b, 0x9bac8c] : [0xca956e, 0xb88763, 0xdfac81];
    p.noisePart('head', skin);
    p.band('head', 0, 2, enemy ? 0x33433e : 0x44352c);
    for (const part of ['body', 'armR', 'armL'])
      p.noisePart(part, enemy ? [0x7e5148, 0x70443e, 0x916259] : [0x32707b, 0x285b66, 0x438894]);
    for (const part of ['legR', 'legL']) {
      p.noisePart(part, [0x353b48, 0x454c58]);
      p.band(part, 9, 12, 0x4e3829);
    }
    for (const x of [1, 5]) {
      p.facePx('head', 'front', x, 4, 0xffffff);
      p.facePx('head', 'front', x + 1, 4, enemy ? 0xc4754d : 0x233e4c);
    }
    p.facePx('head', 'front', 3, 6, 0x744b38);
    p.facePx('head', 'front', 4, 6, 0x744b38);
    p.setLidColor(skin[0]);
    this.rig = buildRig(bipedSpec({ noOuter: true }), p.finish());
    this.root = new THREE.Group();
    this.root.add(this.rig.mesh);
    this.animator = new Animator(this.rig);
    this.flashAlpha = 0;
    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.75, 0.06),
      new THREE.MeshLambertMaterial({ color: enemy ? 0x8a7b60 : 0xd3e1df }),
    );
    blade.position.set(0, -0.18, 0.28);
    blade.rotation.x = Math.PI / 2;
    blade.castShadow = true;
    this.rig.bones.handR.add(blade);
    this.weapon = blade;
  }
  flash(color, alpha) {
    this.rig.material.userData.u.uFlash.value.set(...new THREE.Color(color).toArray(), alpha);
    this.flashAlpha = alpha;
    this.animator.play('hurt');
  }
  update(dt) {
    this.animator.update(dt, this.root);
    this.flashAlpha = Math.max(0, this.flashAlpha - dt * 4);
    this.rig.material.userData.u.uFlash.value.w = this.flashAlpha;
  }
  dispose() {
    this.root.removeFromParent();
    this.animator.stopAll(0);
    this.rig.mesh.geometry.dispose();
    this.rig.skeleton.dispose();
    this.rig.material.map.dispose();
    this.rig.material.emissiveMap.dispose();
    this.rig.material.dispose();
    this.weapon.geometry.dispose();
    this.weapon.material.dispose();
  }
}
