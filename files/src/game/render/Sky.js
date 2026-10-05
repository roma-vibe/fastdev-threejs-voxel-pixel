import * as THREE from 'three';
import { Rng } from '../core/Rng.js';

const skyVert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
  gl_Position.z = gl_Position.w; // far plane
}`;

const skyFrag = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uBottom;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uMoonDir;
uniform float uStars;
uniform float uTime;
uniform float uSunSize;
uniform float uGlow;
uniform vec3 uGlowColor;
uniform float uAurora;
uniform vec3 uAuroraColor;
varying vec3 vDir;

float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }

float squareDisk(vec3 d, vec3 c, float size) {
  vec3 up = abs(c.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 r = normalize(cross(up, c));
  vec3 u = cross(c, r);
  float fw = dot(d, c);
  if (fw < 0.0) return 0.0;
  vec2 q = vec2(dot(d, r), dot(d, u)) / fw;
  return step(max(abs(q.x), abs(q.y)), size);
}

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = h > 0.0 ? mix(uHorizon, uTop, pow(smoothstep(0.0, 0.55, h), 0.8)) : mix(uHorizon, uBottom, smoothstep(0.0, -0.25, h));
  // sun glow near horizon
  float sd = max(dot(d, uSunDir), 0.0);
  col += uGlowColor * pow(sd, 6.0) * uGlow * (1.0 - smoothstep(0.0, 0.6, abs(h)) * 0.5);
  col += uSunColor * pow(sd, 64.0) * 0.6;
  // stars
  if (uStars > 0.0 && h > 0.0) {
    vec3 sp = floor(d * 180.0);
    float s = hash(sp);
    float tw = 0.6 + 0.4 * sin(uTime * 2.0 + s * 50.0);
    col += vec3(step(0.9975, s) * uStars * tw * smoothstep(0.0, 0.25, h));
  }
  // aurora / magic ribbons
  if (uAurora > 0.0 && h > 0.05) {
    float a = sin(d.x * 6.0 + uTime * 0.2) * 0.5 + sin(d.z * 9.0 - uTime * 0.13) * 0.5;
    float band = smoothstep(0.25, 0.0, abs(h - 0.35 - a * 0.12));
    col += uAuroraColor * band * uAurora * (0.6 + 0.4 * sin(d.x * 30.0 + uTime));
  }
  // square, pixel-style sun & moon
  float sun = squareDisk(d, uSunDir, uSunSize);
  col = mix(col, uSunColor * 1.6 + 0.4, sun * step(-0.05, uSunDir.y));
  float moon = squareDisk(d, uMoonDir, uSunSize * 0.8);
  vec3 mcol = vec3(0.86, 0.9, 1.0) * 1.2;
  col = mix(col, mcol, moon * step(-0.05, uMoonDir.y) * 0.95);
  gl_FragColor = vec4(col, 1.0);
}`;

export class Sky {
  constructor() {
    this.uniforms = {
      uTop: { value: new THREE.Color(0x3a78d8) },
      uHorizon: { value: new THREE.Color(0xa8cdf0) },
      uBottom: { value: new THREE.Color(0x6a8ab0) },
      uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.2).normalize() },
      uSunColor: { value: new THREE.Color(0xfff2d0) },
      uMoonDir: { value: new THREE.Vector3(-0.3, -0.8, -0.2).normalize() },
      uStars: { value: 0 },
      uTime: { value: 0 },
      uSunSize: { value: 0.06 },
      uGlow: { value: 0.6 },
      uGlowColor: { value: new THREE.Color(0xffa060) },
      uAurora: { value: 0 },
      uAuroraColor: { value: new THREE.Color(0x40ffc0) },
    };
    const geo = new THREE.SphereGeometry(1000, 32, 16);
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: skyVert,
      fragmentShader: skyFrag,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
  }
  update(dt, camera) {
    this.uniforms.uTime.value += dt;
    this.mesh.position.copy(camera.position);
  }
}

/** Blocky voxel clouds: a tiled block pattern that drifts with the wind. */
export class Clouds {
  constructor({ height = 110, color = 0xffffff, opacity = 0.82, seed = 3, coverage = 0.46 } = {}) {
    const N = 48;
    const CELL = 12;
    const TH = 4;
    const rng = new Rng(seed);
    // blobby pattern via smoothed random grid
    const g = new Float32Array(N * N);
    for (let i = 0; i < g.length; i++) g[i] = rng.next();
    const smooth = (x, z) => {
      let s = 0;
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++)
          s += g[((z + dz + N) % N) * N + ((x + dx + N) % N)] * (dx === 0 && dz === 0 ? 2 : 1);
      return s / 10;
    };
    const on = new Uint8Array(N * N);
    for (let z = 0; z < N; z++)
      for (let x = 0; x < N; x++) on[z * N + x] = smooth(x, z) > 1 - coverage - 0.02 ? 1 : 0;
    const pos = [],
      nrm = [],
      col = [];
    const face = (verts, n, shade) => {
      const [a, b, c, d] = verts;
      for (const v of [a, b, c, a, c, d]) {
        pos.push(...v);
        nrm.push(...n);
        col.push(shade, shade, shade);
      }
    };
    const at = (x, z) => on[((z + N) % N) * N + ((x + N) % N)];
    for (let z = 0; z < N; z++)
      for (let x = 0; x < N; x++) {
        if (!at(x, z)) continue;
        const x0 = x * CELL,
          x1 = x0 + CELL,
          z0 = z * CELL,
          z1 = z0 + CELL,
          y0 = 0,
          y1 = TH;
        face(
          [
            [x0, y1, z0],
            [x0, y1, z1],
            [x1, y1, z1],
            [x1, y1, z0],
          ],
          [0, 1, 0],
          1,
        );
        face(
          [
            [x0, y0, z0],
            [x1, y0, z0],
            [x1, y0, z1],
            [x0, y0, z1],
          ],
          [0, -1, 0],
          0.72,
        );
        if (!at(x + 1, z))
          face(
            [
              [x1, y0, z0],
              [x1, y1, z0],
              [x1, y1, z1],
              [x1, y0, z1],
            ],
            [1, 0, 0],
            0.88,
          );
        if (!at(x - 1, z))
          face(
            [
              [x0, y0, z1],
              [x0, y1, z1],
              [x0, y1, z0],
              [x0, y0, z0],
            ],
            [-1, 0, 0],
            0.88,
          );
        if (!at(x, z + 1))
          face(
            [
              [x1, y0, z1],
              [x1, y1, z1],
              [x0, y1, z1],
              [x0, y0, z1],
            ],
            [0, 0, 1],
            0.8,
          );
        if (!at(x, z - 1))
          face(
            [
              [x0, y0, z0],
              [x0, y1, z0],
              [x1, y1, z0],
              [x1, y0, z0],
            ],
            [0, 0, -1],
            0.8,
          );
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    this.material = new THREE.MeshBasicMaterial({
      color,
      vertexColors: true,
      transparent: true,
      opacity,
      depthWrite: false,
      fog: true,
    });
    this.group = new THREE.Group();
    this.size = N * CELL;
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++) {
        const m = new THREE.Mesh(geo, this.material);
        m.position.set(i * this.size, 0, j * this.size);
        m.frustumCulled = false;
        m.renderOrder = 1;
        this.group.add(m);
      }
    this.group.position.y = height;
    this.offset = 0;
    this.speed = 1.2;
  }
  update(dt, camera) {
    this.offset = (this.offset + dt * this.speed) % this.size;
    const S = this.size;
    this.group.position.x = Math.floor(camera.position.x / S) * S + this.offset - S / 2;
    this.group.position.z = Math.floor(camera.position.z / S) * S - S / 2;
  }
  setColor(c, opacity) {
    this.material.color.set(c);
    if (opacity != null) this.material.opacity = opacity;
  }
}
