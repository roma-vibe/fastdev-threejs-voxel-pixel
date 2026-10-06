import * as THREE from 'three';
import { buildRig, bipedSpec } from './Rig.js';
import { SkinPainter } from './SkinPainter.js';
import { Animator } from './Animator.js';
export class CharacterModel {
  constructor(enemy = false) {
    const p = new SkinPainter(128, 64, enemy ? 8 : 17);
    if (enemy) paintGuardian(p);
    else paintExplorer(p);
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

/** The player: auburn hair, ochre tunic with a belt, olive trousers and boots. */
function paintExplorer(p) {
  const skin = [0xc99169, 0xb98260, 0xd8a47c],
    hair = [0x7a3420, 0x6a2c1a, 0x8a4228];
  p.noisePart('head', skin);
  p.noisePart('head', hair, { faces: ['top'] });
  p.band('head', 0, 2, hair[0], ['front']);
  p.band('head', 0, 5, hair[1], ['back', 'left', 'right']);
  for (const part of ['body', 'armR', 'armL']) p.noisePart(part, [0xb7832f, 0xa77428, 0xc8933a]);
  p.band('body', 7, 9, 0x3d2b1d);
  for (const part of ['armR', 'armL']) {
    p.band(part, 10, 12, skin[0]);
    p.fillPart(part, skin[0], ['bottom']);
  }
  for (const part of ['legR', 'legL']) {
    p.noisePart(part, [0x4e5a30, 0x5b6838]);
    p.band(part, 9, 12, 0x2f2620);
    p.fillPart(part, 0x2f2620, ['bottom']);
  }
  for (const x of [1, 2, 5, 6]) {
    p.facePx('head', 'front', x, 3, hair[1]);
    p.facePx('head', 'front', x, 4, 0x2b1d14);
  }
  p.facePx('head', 'front', 3, 6, 0x9a5e4c);
  p.facePx('head', 'front', 4, 6, 0x9a5e4c);
  p.setLidColor(skin[0]);
}

/** The training guardian: a steel helmet with a dark visor, a rust tabard and steel greaves. */
function paintGuardian(p) {
  const steel = [0x8b9198, 0x7b8188, 0x9ba1a8],
    visor = 0x23272d;
  p.noisePart('head', steel);
  p.band('head', 3, 6, visor, ['front']);
  for (const x of [1, 2, 5, 6]) p.facePx('head', 'front', x, 4, 0xff8a3a, true, 0.9);
  p.noisePart('body', [0x7e5148, 0x70443e, 0x916259]);
  for (const part of ['armR', 'armL']) p.noisePart(part, steel);
  for (const part of ['legR', 'legL']) {
    p.noisePart(part, [0x50555c, 0x5d636a]);
    p.band(part, 9, 12, 0x3a3d42);
  }
  p.setLidColor(visor);
}
