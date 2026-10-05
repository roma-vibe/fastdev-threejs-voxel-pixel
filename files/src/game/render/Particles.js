import * as THREE from 'three';
import { rand } from '../core/math.js';

/**
 * CPU-simulated pixel particles rendered as square GL points (blocky pixel style).
 * Two pools: normal blending (dust, debris, smoke) and additive (sparks, magic, fire).
 */
const VERT = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
varying vec3 vColor;
varying float vAlpha;
varying float vFog;
uniform float uScale;
uniform float uFogNear;
uniform float uFogFar;
void main() {
  vColor = aColor;
  vAlpha = aAlpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
  vFog = smoothstep(uFogNear, uFogFar, -mv.z);
}`;
const FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
varying float vFog;
uniform vec3 uFogColor;
uniform float uAdditive;
void main() {
  if (vAlpha <= 0.01) discard;
  vec3 c = mix(vColor, uFogColor, vFog * (1.0 - uAdditive));
  float a = vAlpha * (1.0 - vFog * uAdditive);
  gl_FragColor = vec4(c, a);
}`;

class Pool {
  constructor(max, additive) {
    this.max = max;
    this.n = 0;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.col2 = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.size0 = new Float32Array(max);
    this.size1 = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.life = new Float32Array(max);
    this.life0 = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.a0 = new Float32Array(max);
    this.collide = new Uint8Array(max);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute(
      'position',
      new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage),
    );
    this.geo.setAttribute(
      'aColor',
      new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage),
    );
    this.geo.setAttribute(
      'aSize',
      new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage),
    );
    this.geo.setAttribute(
      'aAlpha',
      new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage),
    );
    this.uniforms = {
      uScale: { value: 400 },
      uFogNear: { value: 50 },
      uFogFar: { value: 200 },
      uFogColor: { value: new THREE.Color() },
      uAdditive: { value: additive ? 1 : 0 },
    };
    this.mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.geo.setDrawRange(0, 0);
    this.points.visible = false;
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 5 : 4;
  }

  spawn(o) {
    if (this.n >= this.max) return;
    const i = this.n++;
    const i3 = i * 3;
    this.pos[i3] = o.x;
    this.pos[i3 + 1] = o.y;
    this.pos[i3 + 2] = o.z;
    this.vel[i3] = o.vx;
    this.vel[i3 + 1] = o.vy;
    this.vel[i3 + 2] = o.vz;
    this.col.set(o.c, i * 3);
    this.col2.set(o.c2 || o.c, i * 3);
    this.size0[i] = o.size;
    this.size1[i] = o.sizeEnd ?? o.size;
    this.size[i] = o.size;
    this.a0[i] = o.alpha ?? 1;
    this.alpha[i] = this.a0[i];
    this.life[i] = this.life0[i] = o.life;
    this.grav[i] = o.gravity ?? 0;
    this.drag[i] = o.drag ?? 0;
    this.collide[i] = o.collide ? 1 : 0;
  }

  update(dt, world) {
    if (!this.n) return;
    let w = 0;
    for (let i = 0; i < this.n; i++) {
      const l = this.life[i] - dt;
      if (l <= 0) continue;
      const i3 = i * 3;
      let vx = this.vel[i3],
        vy = this.vel[i3 + 1],
        vz = this.vel[i3 + 2];
      vy -= this.grav[i] * dt;
      const d = Math.max(0, 1 - this.drag[i] * dt);
      vx *= d;
      vy *= d;
      vz *= d;
      let x = this.pos[i3] + vx * dt,
        y = this.pos[i3 + 1] + vy * dt,
        z = this.pos[i3 + 2] + vz * dt;
      if (this.collide[i] && world && world.isSolid(Math.floor(x), Math.floor(y), Math.floor(z))) {
        y = Math.floor(y) + 1.01;
        vy = 0;
        vx *= 0.5;
        vz *= 0.5;
      }
      const t = 1 - l / this.life0[i];
      const o = w * 3;
      this.pos[o] = x;
      this.pos[o + 1] = y;
      this.pos[o + 2] = z;
      this.vel[o] = vx;
      this.vel[o + 1] = vy;
      this.vel[o + 2] = vz;
      for (let k = 0; k < 3; k++)
        this.col[o + k] =
          this.col[i3 + k] + (this.col2[i3 + k] - this.col[i3 + k]) * Math.min(1, dt * 4);
      this.col2[o] = this.col2[i3];
      this.col2[o + 1] = this.col2[i3 + 1];
      this.col2[o + 2] = this.col2[i3 + 2];
      this.size0[w] = this.size0[i];
      this.size1[w] = this.size1[i];
      this.size[w] = this.size0[i] + (this.size1[i] - this.size0[i]) * t;
      this.a0[w] = this.a0[i];
      this.alpha[w] = this.a0[i] * (t < 0.1 ? t / 0.1 : 1 - Math.max(0, (t - 0.6) / 0.4));
      this.life[w] = l;
      this.life0[w] = this.life0[i];
      this.grav[w] = this.grav[i];
      this.drag[w] = this.drag[i];
      this.collide[w] = this.collide[i];
      w++;
    }
    this.n = w;
    this.geo.setDrawRange(0, this.n);
    this.points.visible = this.n > 0;
    if (!this.n) return;
    for (const k of ['position', 'aColor', 'aSize', 'aAlpha']) {
      const attribute = this.geo.attributes[k];
      // A pool can be simulated several times before it is rendered. Replace stale ranges.
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(0, this.n * attribute.itemSize);
      attribute.needsUpdate = true;
    }
  }
}

const tmpC = new THREE.Color();
function rgb(hex) {
  tmpC.set(hex);
  return [tmpC.r, tmpC.g, tmpC.b];
}

export class Particles {
  constructor(scene) {
    this.normal = new Pool(6000, false);
    this.add = new Pool(6000, true);
    scene.add(this.normal.points, this.add.points);
    this.density = 1;
    this.world = null;
  }

  setFog(fog, height) {
    for (const p of [this.normal, this.add]) {
      p.uniforms.uFogNear.value = fog.near;
      p.uniforms.uFogFar.value = fog.far;
      p.uniforms.uFogColor.value.copy(fog.color);
      p.uniforms.uScale.value = height * 0.55;
    }
  }

  /**
   * Generic emitter.
   * o: { pos, count, spread, vel:[x,y,z], velSpread, colors:[hex], color2, size, sizeEnd, life:[a,b], gravity, drag, additive, collide, alpha }
   */
  emit(o) {
    const pool = o.additive ? this.add : this.normal;
    const n = Math.max(1, Math.round((o.count ?? 10) * this.density));
    const sp = o.spread ?? 0.3;
    const vs = o.velSpread ?? 1;
    const v = o.vel ?? [0, 0, 0];
    const cols = (o.colors ?? [o.color ?? 0xffffff]).map(rgb);
    const c2 = o.color2 != null ? rgb(o.color2) : null;
    for (let i = 0; i < n; i++) {
      const c = cols[Math.floor(Math.random() * cols.length)];
      const dir = o.radial ? randomDir() : null;
      pool.spawn({
        x: o.pos.x + rand(-sp, sp),
        y: o.pos.y + rand(-sp, sp) * (o.spreadY ?? 1),
        z: o.pos.z + rand(-sp, sp),
        vx: v[0] + (dir ? dir[0] * vs : rand(-vs, vs)),
        vy: v[1] + (dir ? dir[1] * vs : rand(-vs, vs) * (o.velSpreadY ?? 1)),
        vz: v[2] + (dir ? dir[2] * vs : rand(-vs, vs)),
        c,
        c2: c2 ?? c,
        size: (o.size ?? 0.1) * rand(0.7, 1.3),
        sizeEnd: o.sizeEnd != null ? o.sizeEnd * rand(0.7, 1.3) : undefined,
        life: Array.isArray(o.life) ? rand(o.life[0], o.life[1]) : (o.life ?? 1),
        gravity: o.gravity ?? 0,
        drag: o.drag ?? 0,
        alpha: o.alpha ?? 1,
        collide: o.collide,
      });
    }
  }

  /* ---------- presets ---------- */
  hit(pos, color = 0xffffff) {
    this.emit({
      pos,
      count: 14,
      spread: 0.1,
      velSpread: 4.5,
      radial: true,
      colors: [0xffffff, color],
      size: 0.09,
      sizeEnd: 0.02,
      life: [0.15, 0.35],
      drag: 4,
      additive: true,
    });
    this.emit({
      pos,
      count: 6,
      spread: 0.15,
      velSpread: 2,
      colors: [0x9a2020, 0x6a1010],
      size: 0.1,
      life: [0.3, 0.6],
      gravity: 12,
      collide: true,
    });
  }
  crit(pos, color = 0xffd23a) {
    this.emit({
      pos,
      count: 24,
      spread: 0.15,
      velSpread: 6,
      radial: true,
      colors: [0xffffff, color, 0xfff0a0],
      size: 0.12,
      sizeEnd: 0.02,
      life: [0.2, 0.45],
      drag: 3.5,
      additive: true,
    });
  }
  blockDust(pos, color, count = 16) {
    this.emit({
      pos,
      count,
      spread: 0.4,
      velSpread: 2.2,
      colors: [color],
      vel: [0, 2, 0],
      size: 0.11,
      sizeEnd: 0.05,
      life: [0.4, 0.9],
      gravity: 14,
      collide: true,
    });
  }
  dust(pos, color = 0xb8a890, count = 8) {
    this.emit({
      pos,
      count,
      spread: 0.3,
      spreadY: 0.1,
      velSpread: 0.8,
      velSpreadY: 0.4,
      vel: [0, 0.5, 0],
      colors: [color],
      size: 0.16,
      sizeEnd: 0.3,
      life: [0.4, 0.8],
      drag: 2,
      alpha: 0.55,
    });
  }
  poof(pos) {
    this.emit({
      pos,
      count: 26,
      spread: 0.45,
      velSpread: 1.2,
      vel: [0, 1.2, 0],
      colors: [0xe8e8e8, 0xc8c8c8, 0xa0a0a0],
      size: 0.28,
      sizeEnd: 0.1,
      life: [0.6, 1.1],
      drag: 1.5,
      alpha: 0.85,
    });
  }
  smoke(pos, count = 3, color = 0x3a3a3a) {
    this.emit({
      pos,
      count,
      spread: 0.25,
      velSpread: 0.3,
      vel: [0, 1.4, 0],
      colors: [color, 0x4a4a4a],
      size: 0.35,
      sizeEnd: 0.9,
      life: [1.4, 2.4],
      drag: 0.4,
      alpha: 0.45,
    });
  }
  fire(pos, count = 3) {
    this.emit({
      pos,
      count,
      spread: 0.25,
      velSpread: 0.3,
      vel: [0, 1.6, 0],
      colors: [0xffd24a, 0xff8a1a, 0xff5a10],
      color2: 0x6a1a08,
      size: 0.2,
      sizeEnd: 0.03,
      life: [0.4, 0.8],
      drag: 0.5,
      additive: true,
    });
  }
  embers(pos, count = 2) {
    this.emit({
      pos,
      count,
      spread: 0.6,
      velSpread: 0.6,
      vel: [0, 2.2, 0],
      colors: [0xffb04a, 0xff7a1a],
      size: 0.06,
      life: [1.5, 3],
      drag: 0.2,
      additive: true,
    });
  }
  soul(pos, count = 2, color = 0x60ffd0) {
    this.emit({
      pos,
      count,
      spread: 0.3,
      velSpread: 0.25,
      vel: [0, 0.9, 0],
      colors: [color, 0xffffff],
      size: 0.09,
      sizeEnd: 0.02,
      life: [0.8, 1.6],
      drag: 0.3,
      additive: true,
    });
  }
  aura(pos, color, count = 20, speed = 3) {
    this.emit({
      pos,
      count,
      spread: 0.2,
      velSpread: speed,
      radial: true,
      colors: [color, 0xffffff],
      size: 0.12,
      sizeEnd: 0.02,
      life: [0.3, 0.8],
      drag: 2.5,
      additive: true,
    });
  }
  sparkle(pos, color = 0xffffff, count = 4) {
    this.emit({
      pos,
      count,
      spread: 0.4,
      velSpread: 0.3,
      vel: [0, 0.6, 0],
      colors: [color, 0xffffff],
      size: 0.08,
      sizeEnd: 0.0,
      life: [0.5, 1.0],
      additive: true,
    });
  }
  heal(pos) {
    this.emit({
      pos,
      count: 18,
      spread: 0.5,
      spreadY: 1,
      velSpread: 0.3,
      vel: [0, 1.6, 0],
      colors: [0x8aff6a, 0xffffff, 0xffe06a],
      size: 0.09,
      sizeEnd: 0.02,
      life: [0.6, 1.2],
      additive: true,
    });
  }
  splash(pos) {
    this.emit({
      pos,
      count: 24,
      spread: 0.4,
      velSpread: 2,
      vel: [0, 4, 0],
      colors: [0x9ac8ff, 0xffffff, 0x5a8ad0],
      size: 0.08,
      life: [0.4, 0.9],
      gravity: 14,
    });
  }
  explosion(pos, scale = 1) {
    this.emit({
      pos,
      count: 60 * scale,
      spread: 0.6 * scale,
      velSpread: 7 * scale,
      radial: true,
      colors: [0xfff0a0, 0xffa030, 0xff5a10],
      color2: 0x3a1a0a,
      size: 0.35,
      sizeEnd: 0.05,
      life: [0.3, 0.8],
      drag: 3,
      additive: true,
    });
    this.emit({
      pos,
      count: 30 * scale,
      spread: 0.8 * scale,
      velSpread: 3 * scale,
      radial: true,
      vel: [0, 1.5, 0],
      colors: [0x2a2a2a, 0x4a4a4a, 0x6a6a6a],
      size: 0.6 * scale,
      sizeEnd: 1.4 * scale,
      life: [1, 2],
      drag: 1.5,
      alpha: 0.6,
    });
  }
  ringBurst(pos, color, radius = 3, count = 60) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const dx = Math.cos(a),
        dz = Math.sin(a);
      this.add.spawn({
        x: pos.x + dx * 0.3,
        y: pos.y + 0.1,
        z: pos.z + dz * 0.3,
        vx: dx * radius * 3,
        vy: rand(0.5, 2),
        vz: dz * radius * 3,
        c: rgb(color),
        size: 0.16,
        sizeEnd: 0.02,
        life: rand(0.3, 0.5),
        drag: 4,
        gravity: 2,
      });
    }
  }

  update(dt) {
    this.normal.update(dt, this.world);
    this.add.update(dt, this.world);
  }

  dispose() {
    for (const p of [this.normal, this.add]) {
      p.points.removeFromParent();
      p.points.geometry.dispose();
      p.points.material.dispose();
    }
  }
  clear() {
    for (const pool of [this.normal, this.add]) {
      pool.n = 0;
      pool.geo.setDrawRange(0, 0);
      pool.points.visible = false;
      for (const attribute of Object.values(pool.geo.attributes)) attribute.clearUpdateRanges();
    }
  }
}

function randomDir() {
  const u = Math.random() * 2 - 1,
    a = Math.random() * Math.PI * 2;
  const r = Math.sqrt(1 - u * u);
  return [r * Math.cos(a), u, r * Math.sin(a)];
}
