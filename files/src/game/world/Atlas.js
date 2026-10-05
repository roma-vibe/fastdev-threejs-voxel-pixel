import * as THREE from 'three';
import { Tex } from './TexturePainter.js';
import { BLOCKS, TEXTURES, mergeEnv } from './Blocks.js';
import { hashString } from '../core/Rng.js';

const TILE = 16;
const PAD = 8;
const CELL = TILE + PAD * 2;

/**
 * Builds the block texture atlas (albedo + emissive) for a level's environment tints.
 * Each 16px tile sits inside a 32px cell whose border repeats the tile (wrap) to avoid mip bleeding.
 */
export class Atlas {
  constructor(envTints) {
    this.env = mergeEnv(envTints);
    const keys = new Set();
    for (const b of BLOCKS) for (const k of Object.values(b.tex)) if (k) keys.add(k);
    for (const k of Object.keys(TEXTURES)) keys.add(k);
    this.keys = [...keys].filter((k) => TEXTURES[k]);
    const cols = 16;
    const rows = Math.ceil(this.keys.length / cols);
    const pot = (n) => 2 ** Math.ceil(Math.log2(n));
    this.width = pot(cols * CELL);
    this.height = pot(rows * CELL);
    this.cols = cols;
    this.uv = {}; // key -> [u0, v0, u1, v1]
    this.tiles = {}; // key -> Tex (kept for particles / item icons)

    const albedo = document.createElement('canvas');
    albedo.width = this.width;
    albedo.height = this.height;
    const emissive = document.createElement('canvas');
    emissive.width = this.width;
    emissive.height = this.height;
    const ca = albedo.getContext('2d');
    const ce = emissive.getContext('2d');
    ce.fillStyle = '#000';
    ce.fillRect(0, 0, this.width, this.height);

    const tmp = document.createElement('canvas');
    tmp.width = CELL;
    tmp.height = CELL;
    const ct = tmp.getContext('2d');

    this.keys.forEach((key, i) => {
      const t = new Tex(TILE, hashString(key) ^ 0x9e3779b9);
      TEXTURES[key](t, this.env);
      this.tiles[key] = t;
      const cx = (i % cols) * CELL,
        cy = Math.floor(i / cols) * CELL;
      // albedo with wrap padding
      const img = t.toImageData();
      const padded = ct.createImageData(CELL, CELL);
      const em = ct.createImageData(CELL, CELL);
      for (let y = 0; y < CELL; y++)
        for (let x = 0; x < CELL; x++) {
          const sx = (((x - PAD) % TILE) + TILE) % TILE,
            sy = (((y - PAD) % TILE) + TILE) % TILE;
          const si = (sy * TILE + sx) * 4,
            di = (y * CELL + x) * 4;
          padded.data[di] = img.data[si];
          padded.data[di + 1] = img.data[si + 1];
          padded.data[di + 2] = img.data[si + 2];
          padded.data[di + 3] = img.data[si + 3];
          const g = t.e[sy * TILE + sx] / 255;
          em.data[di] = img.data[si] * g;
          em.data[di + 1] = img.data[si + 1] * g;
          em.data[di + 2] = img.data[si + 2] * g;
          em.data[di + 3] = 255;
        }
      ct.putImageData(padded, 0, 0);
      ca.drawImage(tmp, cx, cy);
      ct.putImageData(em, 0, 0);
      ce.drawImage(tmp, cx, cy);
      const u0 = (cx + PAD) / this.width,
        v0 = 1 - (cy + PAD + TILE) / this.height;
      const u1 = (cx + PAD + TILE) / this.width,
        v1 = 1 - (cy + PAD) / this.height;
      this.uv[key] = [u0, v0, u1, v1];
    });

    this.canvas = albedo;
    this.emissiveCanvas = emissive;
    this.texture = makeTex(albedo);
    this.emissiveTexture = makeTex(emissive);
  }

  /** Average colour of a tile (for particles). */
  avgColor(key) {
    const t = this.tiles[key];
    if (!t) return 0x888888;
    let r = 0,
      g = 0,
      b = 0,
      n = 0;
    for (let i = 0; i < t.d.length; i += 4)
      if (t.d[i + 3] > 20) {
        r += t.d[i];
        g += t.d[i + 1];
        b += t.d[i + 2];
        n++;
      }
    if (!n) return 0x888888;
    return ((r / n) << 16) | ((g / n) << 8) | (b / n);
  }

  dispose() {
    this.texture.dispose();
    this.emissiveTexture.dispose();
  }
}

function makeTex(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

/** Stand-alone repeating textures for water & lava shaders. */
export function makeLiquidTexture(kind) {
  const S = 32;
  const t = new Tex(S, kind === 'lava' ? 77 : 55);
  if (kind === 'lava') {
    const f = t.fbm([
      [4, 0.5],
      [8, 0.3],
      [16, 0.2],
    ]);
    const pal = [0x8a1a02, 0xb02a04, 0xd4480a, 0xf06a12, 0xff9a2a, 0xffc85a];
    t.paintField(pal, f, 0.15);
  } else {
    const f = t.fbm([
      [4, 0.5],
      [8, 0.3],
      [16, 0.2],
    ]);
    const pal = [0x9aa0b0, 0xb0b6c4, 0xc4cad6, 0xd8dde6, 0xeef2f7];
    t.paintField(pal, f, 0.2);
  }
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  c.getContext('2d').putImageData(t.toImageData(), 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestMipmapLinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
