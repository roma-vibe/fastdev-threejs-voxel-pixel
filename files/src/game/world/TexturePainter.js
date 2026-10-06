import { Rng } from '../core/Rng.js';
import { hexToRgb, clamp } from '../core/math.js';

/**
 * 16x16 (or NxN) procedural pixel-art canvas with an emissive mask channel.
 * All painters are deterministic given the rng seed.
 */
export class Tex {
  constructor(size = 16, seed = 1) {
    this.s = size;
    this.rng = new Rng(seed);
    this.d = new Uint8ClampedArray(size * size * 4);
    this.e = new Uint8ClampedArray(size * size); // emissive mask 0..255
  }
  idx(x, y) {
    const s = this.s;
    x = ((x % s) + s) % s;
    y = ((y % s) + s) % s;
    return y * s + x;
  }
  set(x, y, hex, a = 255) {
    const i = this.idx(x, y) * 4;
    const [r, g, b] = hexToRgb(hex);
    this.d[i] = r;
    this.d[i + 1] = g;
    this.d[i + 2] = b;
    this.d[i + 3] = a;
    return this;
  }
  setRGB(x, y, r, g, b, a = 255) {
    const i = this.idx(x, y) * 4;
    this.d[i] = r;
    this.d[i + 1] = g;
    this.d[i + 2] = b;
    this.d[i + 3] = a;
  }
  get(x, y) {
    const i = this.idx(x, y) * 4;
    return [this.d[i], this.d[i + 1], this.d[i + 2], this.d[i + 3]];
  }
  alpha(x, y, a) {
    this.d[this.idx(x, y) * 4 + 3] = a;
  }
  glow(x, y, v = 255) {
    this.e[this.idx(x, y)] = v;
  }
  mul(x, y, f) {
    const i = this.idx(x, y) * 4;
    this.d[i] *= f;
    this.d[i + 1] *= f;
    this.d[i + 2] *= f;
  }
  tint(x, y, hex, t) {
    const i = this.idx(x, y) * 4;
    const [r, g, b] = hexToRgb(hex);
    this.d[i] += (r - this.d[i]) * t;
    this.d[i + 1] += (g - this.d[i + 1]) * t;
    this.d[i + 2] += (b - this.d[i + 2]) * t;
  }
  fill(hex, a = 255) {
    for (let y = 0; y < this.s; y++) for (let x = 0; x < this.s; x++) this.set(x, y, hex, a);
    return this;
  }
  rect(x0, y0, w, h, hex, a = 255) {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, hex, a);
    return this;
  }
  each(fn) {
    for (let y = 0; y < this.s; y++) for (let x = 0; x < this.s; x++) fn(x, y);
    return this;
  }
  /** Tileable smooth value noise field in [0,1]. */
  field(cells = 4, seedSalt = 0) {
    const r = this.rng.fork(seedSalt + ':' + cells);
    const g = new Float32Array(cells * cells);
    for (let i = 0; i < g.length; i++) g[i] = r.next();
    const s = this.s;
    const out = new Float32Array(s * s);
    for (let y = 0; y < s; y++)
      for (let x = 0; x < s; x++) {
        const fx = (x / s) * cells,
          fy = (y / s) * cells;
        const x0 = Math.floor(fx),
          y0 = Math.floor(fy);
        const tx = fx - x0,
          ty = fy - y0;
        const sx = tx * tx * (3 - 2 * tx),
          sy = ty * ty * (3 - 2 * ty);
        const a = g[(y0 % cells) * cells + (x0 % cells)];
        const b = g[(y0 % cells) * cells + ((x0 + 1) % cells)];
        const c = g[((y0 + 1) % cells) * cells + (x0 % cells)];
        const d = g[((y0 + 1) % cells) * cells + ((x0 + 1) % cells)];
        out[y * s + x] = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
      }
    return out;
  }
  /** Multi-octave field mix. */
  fbm(
    weights = [
      [2, 0.5],
      [4, 0.3],
      [8, 0.2],
    ],
    salt = 0,
  ) {
    const s = this.s;
    const out = new Float32Array(s * s);
    let tot = 0;
    for (const [c, w] of weights) {
      const f = this.field(c, salt);
      for (let i = 0; i < out.length; i++) out[i] += f[i] * w;
      tot += w;
    }
    for (let i = 0; i < out.length; i++) out[i] /= tot;
    return out;
  }
  /** Paint from palette using a field + per-pixel jitter. */
  paintField(pal, field, jitter = 0.18, bias = 0) {
    const s = this.s;
    for (let y = 0; y < s; y++)
      for (let x = 0; x < s; x++) {
        let t = field[y * s + x] + (this.rng.next() - 0.5) * jitter + bias;
        t = clamp(t, 0, 0.999);
        this.set(x, y, pal[Math.floor(t * pal.length)]);
      }
    return this;
  }
  noise(
    pal,
    cells = [
      [2, 0.4],
      [4, 0.35],
      [16, 0.25],
    ],
    jitter = 0.2,
    salt = 0,
  ) {
    return this.paintField(pal, this.fbm(cells, salt), jitter);
  }
  speck(hex, p, a = 255) {
    this.each((x, y) => {
      if (this.rng.next() < p) this.set(x, y, hex, a);
    });
    return this;
  }
  /** Toroidal voronoi: returns {cell, d1, d2} per pixel. */
  voronoi(n) {
    const s = this.s;
    const pts = [];
    for (let i = 0; i < n; i++)
      pts.push([this.rng.next() * s, this.rng.next() * s, this.rng.next()]);
    const cell = new Int16Array(s * s),
      d1 = new Float32Array(s * s),
      d2 = new Float32Array(s * s);
    for (let y = 0; y < s; y++)
      for (let x = 0; x < s; x++) {
        let b1 = 1e9,
          b2 = 1e9,
          bi = 0;
        pts.forEach((p, i) => {
          let dx = Math.abs(x + 0.5 - p[0]),
            dy = Math.abs(y + 0.5 - p[1]);
          dx = Math.min(dx, s - dx);
          dy = Math.min(dy, s - dy);
          const d = Math.sqrt(dx * dx + dy * dy * 1.15);
          if (d < b1) {
            b2 = b1;
            b1 = d;
            bi = i;
          } else if (d < b2) b2 = d;
        });
        cell[y * s + x] = bi;
        d1[y * s + x] = b1;
        d2[y * s + x] = b2;
      }
    return { pts, cell, d1, d2 };
  }
  toImageData() {
    return new ImageData(this.d, this.s, this.s);
  }
}

/* ------------------------------------------------------------------ */
/* Palettes                                                            */
/* ------------------------------------------------------------------ */
export const PAL = {
  stone: [0x5e5e5e, 0x6b6b6b, 0x747474, 0x7d7d7d, 0x868686, 0x8f8f8f],
  andesite: [0x6f6f6f, 0x7a7a7a, 0x858585, 0x8e8e8e, 0x9a9a9a],
  granite: [0x7a4d3e, 0x8a5a48, 0x996653, 0xa6735f, 0xb58470],
  diorite: [0xa8a8a8, 0xb9b9b9, 0xc8c8c8, 0xd6d6d6, 0xe6e6e6],
  calcite: [0xcfd0cb, 0xdadbd6, 0xe3e4df, 0xecede8, 0xf5f5f0],
  tuff: [0x585850, 0x62625a, 0x6c6c62, 0x76766b, 0x808074],
  dirt: [0x5b3d27, 0x6b4a31, 0x79553a, 0x866043, 0x946c4d],
  coarse: [0x4d3322, 0x5f412c, 0x72503a, 0x836049, 0x9a7a5c],
  mud: [0x3a3330, 0x423a37, 0x4b433f, 0x544b46],
  clay: [0x8c919c, 0x969ba6, 0xa0a5b0, 0xabb0ba],
  sand: [0xcdb982, 0xd6c48c, 0xdccb95, 0xe3d4a1, 0xe9dbab],
  redsand: [0xa4521c, 0xb05b22, 0xbb6428, 0xc56e30, 0xcf7a3a],
  sandstone: [0xc9b37c, 0xd3bf88, 0xdbc894, 0xe2d0a0],
  gravel: [0x5e5959, 0x736d6d, 0x857f7e, 0x979090, 0xa9a2a1],
  snow: [0xdfe8ee, 0xe8f0f5, 0xf0f6fa, 0xf8fbfd, 0xffffff],
  ice: [0x7fa8e8, 0x8cb3ee, 0x99bef2, 0xa6c8f5],
  packedIce: [0x7e9fd6, 0x8aaade, 0x97b6e6, 0xa4c1ec],
  obsidian: [0x0f0b1a, 0x160f25, 0x1f1633, 0x2a1f44, 0x3a2c5c],
  basalt: [0x3d3d42, 0x48484e, 0x53535a, 0x5f5f66, 0x6b6b72],
  darkStone: [0x1f1b21, 0x27222a, 0x2f2932, 0x38313b, 0x423a45],
  terracotta: [0x8a5039, 0x96583f, 0xa06045, 0xa9684c],
  oakLog: [0x3f2f1c, 0x4c3822, 0x5a4329, 0x664c30],
  oakPlank: [0x7a5c33, 0x8a6a3c, 0x9a7646, 0xa6824f, 0xb08c58],
  oakRing: [0x8a6a3c, 0x9f7c49, 0xb08c58, 0xbe9a63],
  birchLog: [0xcfcfc6, 0xdcdcd3, 0xe6e6de, 0xf0f0e8],
  birchPlank: [0xb5a36f, 0xc2b07a, 0xcdbb84, 0xd7c58f],
  spruceLog: [0x2c1e10, 0x352514, 0x3e2c19, 0x48331e],
  sprucePlank: [0x5a3f22, 0x654728, 0x6f4f2e, 0x7a5834],
  jungleLog: [0x4a3a17, 0x55441c, 0x604d21, 0x6c5727],
  junglePlank: [0x946443, 0xa06e4b, 0xab7853, 0xb6835c],
  darkOakLog: [0x2a1d0e, 0x322312, 0x3a2915, 0x422f19],
  darkOakPlank: [0x3a2612, 0x432c16, 0x4c321a, 0x55391f],
  acaciaLog: [0x575049, 0x625a52, 0x6c645b, 0x776f65],
  acaciaPlank: [0x9e5129, 0xab5a2e, 0xb66334, 0xc16d3a],
  charred: [0x151212, 0x1c1817, 0x241f1d, 0x2d2724, 0x3a322d],
};

export function woolPalette(hex) {
  const [r, g, b] = hexToRgb(hex);
  return [0.72, 0.82, 0.9, 1, 1.08].map(
    (f) => (clamp(r * f, 0, 255) << 16) | (clamp(g * f, 0, 255) << 8) | clamp(b * f, 0, 255),
  );
}

export function shadePal(hex, factors = [0.7, 0.8, 0.9, 1, 1.1]) {
  return factors.map((f) => {
    const [r, g, b] = hexToRgb(hex);
    return (
      (clamp(Math.round(r * f), 0, 255) << 16) |
      (clamp(Math.round(g * f), 0, 255) << 8) |
      clamp(Math.round(b * f), 0, 255)
    );
  });
}

/* ------------------------------------------------------------------ */
/* Painters                                                            */
/* ------------------------------------------------------------------ */
export const P = {
  stone(t, pal = PAL.stone) {
    t.noise(
      pal,
      [
        [2, 0.3],
        [4, 0.35],
        [8, 0.35],
      ],
      0.35,
    );
    // horizontal-ish streaks like MC stone
    for (let i = 0; i < 6; i++) {
      const x = t.rng.int(0, 15),
        y = t.rng.int(0, 15),
        len = t.rng.int(2, 4);
      for (let k = 0; k < len; k++) t.set(x + k, y, pal[t.rng.int(0, 1)]);
    }
    t.speck(pal[pal.length - 1], 0.04);
  },
  smoothStone(t, pal = PAL.stone) {
    t.noise(pal.slice(2, 5), [[4, 1]], 0.15);
    for (let i = 0; i < 16; i++) {
      t.set(i, 0, pal[pal.length - 1]);
      t.set(i, 15, pal[0]);
      t.set(0, i, pal[pal.length - 2]);
      t.set(15, i, pal[1]);
    }
  },
  cobble(t, pal = PAL.stone, mortar = null, n = 9) {
    const v = t.voronoi(n);
    const shades = v.pts.map(() => t.rng.range(0.15, 0.85));
    t.each((x, y) => {
      const i = y * 16 + x;
      const edge = v.d2[i] - v.d1[i];
      let tt = shades[v.cell[i]] + (1 - v.d1[i] / 5) * 0.35 + (t.rng.next() - 0.5) * 0.2;
      if (edge < 1.1) t.set(x, y, mortar ?? pal[0]);
      else t.set(x, y, pal[clamp(Math.floor(tt * pal.length), 1, pal.length - 1)]);
    });
  },
  gravel(t, pal = PAL.gravel) {
    const v = t.voronoi(22);
    const shades = v.pts.map(() => t.rng.next());
    t.each((x, y) => {
      const i = y * 16 + x;
      const edge = v.d2[i] - v.d1[i];
      const tt = edge < 0.6 ? 0.05 : shades[v.cell[i]] * 0.8 + 0.2 - v.d1[i] * 0.06;
      t.set(x, y, pal[clamp(Math.floor(tt * pal.length), 0, pal.length - 1)]);
    });
  },
  bricks(t, pal, mortar, bw = 8, bh = 4, bevel = true) {
    for (let row = 0; row < 16 / bh; row++) {
      const off = row % 2 ? bw / 2 : 0;
      for (let col = -1; col < 16 / bw + 1; col++) {
        const shade = t.rng.range(0.25, 0.85);
        for (let y = 0; y < bh; y++)
          for (let x = 0; x < bw; x++) {
            const px = col * bw + x + off,
              py = row * bh + y;
            if (px < 0 || px >= 16) continue;
            let tt = shade + (t.rng.next() - 0.5) * 0.3;
            if (bevel && (y === 0 || x === 0)) tt += 0.25;
            if (bevel && (y === bh - 2 || x === bw - 2)) tt -= 0.15;
            const c =
              y === bh - 1 || x === bw - 1
                ? mortar
                : pal[clamp(Math.floor(tt * pal.length), 0, pal.length - 1)];
            t.set(px, py, c);
          }
      }
    }
  },
  stoneBricks(t, pal = PAL.stone) {
    // MC-like: 2 rows of 8px tall bricks split into 8x4 with bevels
    for (let row = 0; row < 4; row++) {
      const off = row % 2 ? 4 : 0;
      for (let col = -1; col < 3; col++) {
        const base = t.rng.range(0.35, 0.7);
        for (let y = 0; y < 4; y++)
          for (let x = 0; x < 8; x++) {
            const px = col * 8 + x + off,
              py = row * 4 + y;
            if (px < 0 || px >= 16) continue;
            let tt = base + (t.rng.next() - 0.5) * 0.22;
            let c;
            if (y === 3 || x === 7) c = pal[0];
            else {
              if (y === 0 || x === 0) tt += 0.25;
              if (y === 2 || x === 6) tt -= 0.18;
              c = pal[clamp(Math.floor(tt * pal.length), 1, pal.length - 1)];
            }
            t.set(px, py, c);
          }
      }
    }
  },
  crack(t, hex = 0x3a3a3a, n = 3) {
    for (let k = 0; k < n; k++) {
      let x = t.rng.int(2, 13),
        y = t.rng.int(2, 13);
      for (let i = 0; i < 7; i++) {
        t.set(x, y, hex);
        x += t.rng.int(-1, 1);
        y += t.rng.pick([-1, 1, 1]);
      }
    }
  },
  moss(t, n = 0.35) {
    const f = t.fbm(
      [
        [3, 0.6],
        [8, 0.4],
      ],
      'moss',
    );
    const mp = [0x3f5a1f, 0x4c6b24, 0x5a7b2a, 0x688b31];
    t.each((x, y) => {
      const v = f[y * 16 + x] + (t.rng.next() - 0.5) * 0.2;
      if (v > 1 - n) t.set(x, y, mp[t.rng.int(0, 3)]);
    });
  },
  planks(t, pal) {
    for (let row = 0; row < 4; row++) {
      const cut = t.rng.int(2, 13);
      const shade = t.rng.range(0.35, 0.65);
      for (let y = 0; y < 4; y++)
        for (let x = 0; x < 16; x++) {
          const py = row * 4 + y;
          let tt =
            shade +
            Math.sin(x * 0.9 + row * 3 + t.rng.next() * 0.6) * 0.08 +
            (t.rng.next() - 0.5) * 0.15;
          if (y === 3) tt = 0.02;
          else if (y === 0) tt += 0.12;
          let c = pal[clamp(Math.floor(tt * pal.length), 0, pal.length - 1)];
          if (x === cut && y < 3) c = pal[0];
          t.set(x, py, c);
        }
      // grain streaks
      for (let k = 0; k < 2; k++) {
        const gy = row * 4 + t.rng.int(0, 2),
          gx = t.rng.int(0, 12),
          len = t.rng.int(3, 6);
        for (let i = 0; i < len; i++) t.set(gx + i, gy, pal[1]);
      }
    }
  },
  logSide(t, pal) {
    const cols = [];
    for (let x = 0; x < 16; x++) cols.push(t.rng.range(0.2, 0.9));
    t.each((x, y) => {
      let tt = cols[x] + Math.sin(y * 0.7 + x * 2.3) * 0.12 + (t.rng.next() - 0.5) * 0.25;
      t.set(x, y, pal[clamp(Math.floor(tt * pal.length), 0, pal.length - 1)]);
    });
    for (let k = 0; k < 5; k++) {
      const x = t.rng.int(0, 15),
        y = t.rng.int(0, 15);
      for (let i = 0; i < t.rng.int(2, 5); i++) t.set(x, y + i, pal[0]);
    }
  },
  birchSide(t) {
    t.noise(PAL.birchLog, [[4, 1]], 0.2);
    for (let k = 0; k < 7; k++) {
      const x = t.rng.int(0, 15),
        y = t.rng.int(0, 15),
        w = t.rng.int(2, 5);
      for (let i = 0; i < w; i++) t.set(x + i, y, i === 0 || i === w - 1 ? 0x3a3a34 : 0x24241f);
    }
  },
  logTop(t, ring, bark) {
    t.each((x, y) => {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      if (d > 6.9) t.set(x, y, bark[t.rng.int(0, bark.length - 1)]);
      else {
        const r = Math.floor(d) % 2 === 0;
        t.set(x, y, ring[clamp((r ? 2 : 1) + (t.rng.next() < 0.2 ? 1 : 0), 0, ring.length - 1)]);
      }
    });
  },
  leaves(t, pal, holes = 0.22) {
    const f = t.fbm([
      [4, 0.6],
      [8, 0.4],
    ]);
    t.each((x, y) => {
      const v = f[y * 16 + x] + (t.rng.next() - 0.5) * 0.35;
      if (t.rng.next() < holes && v < 0.55) t.set(x, y, 0, 0);
      else t.set(x, y, pal[clamp(Math.floor(v * pal.length), 0, pal.length - 1)]);
    });
  },
  grassTop(t, pal) {
    t.noise(
      pal,
      [
        [4, 0.5],
        [8, 0.5],
      ],
      0.45,
    );
    for (let k = 0; k < 18; k++) t.set(t.rng.int(0, 15), t.rng.int(0, 15), pal[pal.length - 1]);
    for (let k = 0; k < 12; k++) t.set(t.rng.int(0, 15), t.rng.int(0, 15), pal[0]);
  },
  grassSide(t, dirt, grass, overhang = [2, 5]) {
    P.dirt(t, dirt);
    for (let x = 0; x < 16; x++) {
      const h = t.rng.int(overhang[0], overhang[1]);
      for (let y = 0; y < h; y++)
        t.set(x, y, grass[clamp(grass.length - 1 - y - t.rng.int(0, 1), 0, grass.length - 1)]);
    }
  },
  snowSide(t, dirt) {
    P.dirt(t, dirt);
    for (let x = 0; x < 16; x++) {
      const h = t.rng.int(3, 6);
      for (let y = 0; y < h; y++) t.set(x, y, PAL.snow[clamp(4 - y + t.rng.int(-1, 0), 0, 4)]);
    }
  },
  dirt(t, pal = PAL.dirt) {
    t.noise(
      pal,
      [
        [4, 0.5],
        [16, 0.5],
      ],
      0.4,
    );
    t.speck(pal[0], 0.06);
    t.speck(pal[pal.length - 1], 0.04);
  },
  sand(t, pal) {
    t.noise(
      pal,
      [
        [4, 0.4],
        [16, 0.6],
      ],
      0.35,
    );
    t.speck(pal[pal.length - 1], 0.05);
    t.speck(pal[0], 0.03);
  },
  sandstoneSide(t, pal) {
    t.noise(pal, [[16, 1]], 0.25);
    for (let x = 0; x < 16; x++) {
      t.set(x, 0, pal[3]);
      t.set(x, 3, pal[0]);
      t.set(x, 11, pal[1]);
      t.set(x, 15, pal[0]);
    }
  },
  snow(t) {
    t.noise(
      PAL.snow,
      [
        [4, 0.5],
        [16, 0.5],
      ],
      0.3,
      'snow',
    );
  },
  ice(t, pal = PAL.ice, a = 200) {
    t.noise(
      pal,
      [
        [2, 0.5],
        [8, 0.5],
      ],
      0.2,
    );
    for (let k = 0; k < 3; k++) {
      const x = t.rng.int(0, 15),
        y = t.rng.int(0, 15);
      for (let i = 0; i < 6; i++) t.set(x + i, y - i, 0xd6e6ff);
    }
    t.each((x, y) => t.alpha(x, y, a));
  },
  glass(t, frame = 0xd9eef2, tint = 0xffffff, a = 40) {
    t.each((x, y) => t.set(x, y, tint, a));
    for (let i = 0; i < 16; i++) {
      t.set(i, 0, frame, 255);
      t.set(i, 15, frame, 255);
      t.set(0, i, frame, 255);
      t.set(15, i, frame, 255);
    }
    for (let i = 0; i < 4; i++) t.set(3 + i, 5 - i, 0xffffff, 160);
    for (let i = 0; i < 2; i++) t.set(4 + i, 7 - i, 0xffffff, 160);
  },
  wool(t, hex) {
    const pal = woolPalette(hex);
    t.noise(
      pal.slice(1, 4),
      [
        [8, 0.5],
        [16, 0.5],
      ],
      0.5,
    );
    for (let k = 0; k < 20; k++) {
      const x = t.rng.int(0, 15),
        y = t.rng.int(0, 15);
      t.set(x, y, pal[0]);
      t.set(x + 1, y, pal[4]);
    }
  },
  flat(t, hex, var_ = 0.06) {
    const pal = [1 - var_ * 2, 1 - var_, 1, 1 + var_].map((f) => shadePal(hex, [f])[0]);
    t.noise(
      pal,
      [
        [4, 0.4],
        [16, 0.6],
      ],
      0.3,
    );
  },
  ore(t, base, pal, blobs = 4) {
    P.stone(t, base);
    for (let b = 0; b < blobs; b++) {
      const cx = t.rng.int(2, 13),
        cy = t.rng.int(2, 13);
      const cells = [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
        [-1, 0],
        [0, -1],
      ].filter(() => t.rng.next() < 0.75);
      for (const [dx, dy] of cells) t.set(cx + dx, cy + dy, pal[1]);
      t.set(cx, cy, pal[2]);
      t.set(cx + 1, cy + 1, pal[0]);
    }
  },
  metal(t, pal) {
    t.noise(pal.slice(1, 4), [[4, 1]], 0.12);
    for (let i = 0; i < 16; i++) {
      t.set(i, 0, pal[4]);
      t.set(0, i, pal[4]);
      t.set(i, 15, pal[0]);
      t.set(15, i, pal[0]);
    }
    for (let i = 2; i < 14; i++) {
      t.set(i, 2, pal[3]);
      t.set(i, 13, pal[1]);
    }
  },
  gemBlock(t, pal) {
    t.fill(pal[2]);
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const d = Math.min(x, y, 15 - x, 15 - y);
        if (d === 0) t.set(x, y, pal[0]);
        else if (d === 1) t.set(x, y, pal[4]);
        else if ((x + y) % 7 === 0) t.set(x, y, pal[3]);
        else if ((x - y + 16) % 9 === 0) t.set(x, y, pal[1]);
      }
  },
  obsidian(t) {
    t.noise(
      PAL.obsidian,
      [
        [4, 0.5],
        [8, 0.5],
      ],
      0.35,
    );
    for (let k = 0; k < 5; k++) {
      const x = t.rng.int(0, 15),
        y = t.rng.int(0, 15);
      for (let i = 0; i < 3; i++) t.set(x + i, y + (i % 2), 0x4a3a78);
    }
  },
  basaltSide(t) {
    for (let x = 0; x < 16; x++) {
      const s = t.rng.range(0.1, 0.9);
      for (let y = 0; y < 16; y++) {
        const tt = clamp(s + (t.rng.next() - 0.5) * 0.3, 0, 0.99);
        t.set(x, y, x % 4 === 3 ? PAL.basalt[0] : PAL.basalt[Math.floor(tt * 5)]);
      }
    }
  },
  basaltTop(t) {
    t.noise(PAL.basalt, [[4, 1]], 0.3);
    const v = t.voronoi(5);
    t.each((x, y) => {
      const i = y * 16 + x;
      if (v.d2[i] - v.d1[i] < 0.9) t.set(x, y, PAL.basalt[0]);
    });
  },
  magma(t) {
    t.noise([0x3a1508, 0x4a1d0b, 0x5c250e], [[4, 1]], 0.3);
    const v = t.voronoi(7);
    t.each((x, y) => {
      const i = y * 16 + x;
      const e = v.d2[i] - v.d1[i];
      if (e < 1.2) {
        const c = e < 0.5 ? 0xffd24a : 0xff7a1a;
        t.set(x, y, c).glow(x, y, e < 0.5 ? 255 : 200);
      }
    });
  },
  pillarSide(t, pal) {
    t.noise(pal, [[16, 1]], 0.2);
    for (let y = 0; y < 16; y++) {
      t.set(0, y, pal[pal.length - 1]).set(15, y, pal[0]);
      if (y % 4 === 0) for (let x = 2; x < 14; x += 3) t.set(x, y, pal[1]);
    }
  },
  bookshelf(t) {
    P.planks(t, PAL.oakPlank);
    const colors = [0x6b1f1f, 0x2d3f7a, 0x2f5c2a, 0x7a5a1c, 0x5a2a5a, 0x3a3a3a, 0x8a3b1b];
    for (const y0 of [1, 9]) {
      let x = 1;
      while (x < 15) {
        const w = t.rng.int(1, 2),
          h = t.rng.int(4, 6),
          c = t.rng.pick(colors);
        for (let dx = 0; dx < w && x + dx < 15; dx++)
          for (let y = 0; y < h; y++)
            t.set(x + dx, y0 + 6 - h + y, dx === 0 && y === 0 ? 0xd8c890 : c);
        x += w;
      }
      for (let xx = 0; xx < 16; xx++) t.set(xx, y0 + 6, PAL.oakPlank[0]);
    }
  },
  runes(t, pal, glow, pattern = 0) {
    P.stoneBricks(t, pal);
    const glyphs = [
      [
        [3, 3],
        [4, 3],
        [5, 3],
        [4, 4],
        [4, 5],
        [4, 6],
        [3, 6],
        [5, 6],
        [10, 9],
        [11, 9],
        [12, 9],
        [11, 10],
        [11, 11],
        [10, 12],
        [12, 12],
      ],
      [
        [2, 2],
        [3, 3],
        [4, 4],
        [5, 5],
        [5, 2],
        [2, 5],
        [10, 10],
        [11, 10],
        [12, 10],
        [12, 11],
        [12, 12],
        [11, 12],
        [10, 12],
      ],
      [
        [7, 1],
        [7, 2],
        [6, 3],
        [8, 3],
        [7, 4],
        [7, 5],
        [3, 9],
        [4, 10],
        [5, 11],
        [12, 9],
        [11, 10],
        [10, 11],
        [7, 12],
        [7, 13],
      ],
    ][pattern % 3];
    for (const [x, y] of glyphs) t.set(x, y, glow).glow(x, y, 255);
  },
  hayTop(t) {
    t.noise([0x8a6a14, 0xa3801c, 0xbd9926, 0xd1ad35], [[16, 1]], 0.5);
    t.each((x, y) => {
      if (Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)) > 6.5) t.set(x, y, 0xa3801c);
    });
  },
  haySide(t) {
    t.each((x, y) => {
      const c = [0x8a6a14, 0xa3801c, 0xbd9926, 0xd1ad35][(x * 7 + y * 3 + t.rng.int(0, 2)) % 4];
      t.set(x, y, c);
    });
    for (let x = 0; x < 16; x++) {
      t.set(x, 4, 0x7a2e14).set(x, 5, 0x9a3a1a);
      t.set(x, 11, 0x7a2e14).set(x, 12, 0x9a3a1a);
    }
  },
  pumpkinSide(t, face = false) {
    for (let x = 0; x < 16; x++) {
      const band = x % 4 === 0 ? 0 : x % 4 === 2 ? 2 : 1;
      for (let y = 0; y < 16; y++)
        t.set(x, y, [0xb0590d, 0xc5690f, 0xd87b18][clamp(band + t.rng.int(-1, 0), 0, 2)]);
    }
    if (face) {
      const f = 0x3a1a02,
        g = 0xffc34a;
      for (const [x, y] of [
        [3, 4],
        [4, 4],
        [4, 5],
        [11, 4],
        [12, 4],
        [11, 5],
        [7, 7],
        [8, 7],
      ])
        t.set(x, y, g).glow(x, y, 220);
      for (let x = 3; x < 13; x++) t.set(x, 10, g).glow(x, 10, 220);
      for (const x of [4, 7, 10]) t.set(x, 11, g).glow(x, 11, 220);
      t.set(2, 2, f);
    }
  },
  furnaceFront(t, lit = false) {
    P.cobble(t, PAL.stone);
    t.rect(4, 8, 8, 6, 0x1c1c1c);
    t.rect(3, 7, 10, 1, 0x4a4a4a);
    if (lit) {
      for (let x = 5; x < 11; x++) {
        const h = t.rng.int(2, 4);
        for (let y = 0; y < h; y++)
          t.set(x, 13 - y, y === 0 ? 0xffd24a : 0xff7a1a).glow(x, 13 - y, 255);
      }
    }
  },
  chestSide(t) {
    P.planks(t, [0x6a4a1c, 0x7a5622, 0x8a6228, 0x996e2e]);
    for (let i = 0; i < 16; i++)
      t.set(i, 0, 0x3a2810)
        .set(i, 15, 0x3a2810)
        .set(0, i, 0x3a2810)
        .set(15, i, 0x3a2810)
        .set(i, 6, 0x3a2810);
    t.rect(7, 5, 2, 4, 0xc0c0c0).set(7, 8, 0x6a6a6a);
  },
  barrelSide(t) {
    P.planks(t, PAL.sprucePlank);
    for (let x = 0; x < 16; x++) {
      t.set(x, 2, 0x3a3a3a).set(x, 13, 0x3a3a3a);
    }
  },
  melonSide(t) {
    t.each((x, y) =>
      t.set(x, y, x % 3 === 0 ? 0x9ab32a : [0x5a7a14, 0x6a8a1a, 0x7a9a22][t.rng.int(0, 2)]),
    );
  },
  terracotta(t, hex) {
    const pal = shadePal(hex, [0.9, 0.95, 1, 1.04]);
    t.noise(
      pal,
      [
        [4, 0.5],
        [16, 0.5],
      ],
      0.25,
    );
  },
  bedrock(t) {
    t.noise(
      [0x1a1a1a, 0x333333, 0x4d4d4d, 0x666666, 0x808080],
      [
        [8, 0.5],
        [16, 0.5],
      ],
      0.6,
    );
  },
  lampPost(t) {
    t.fill(0x2a2a2a);
  },
  farmland(t) {
    t.noise([0x3a2412, 0x472d17, 0x54361c], [[16, 1]], 0.4);
    for (let y = 1; y < 16; y += 4) for (let x = 0; x < 16; x++) t.set(x, y, 0x2a190c);
    for (let i = 0; i < 16; i++) t.set(i, 0, 0x5a3d22).set(0, i, 0x5a3d22);
  },
  path(t) {
    t.noise(
      [0x7a6333, 0x8a7240, 0x96804b, 0xa38b55],
      [
        [4, 0.5],
        [16, 0.5],
      ],
      0.35,
    );
  },
};

/* ------------------------------------------------------------------ */
/* Cross-plant & special painters (transparent backgrounds)            */
/* ------------------------------------------------------------------ */
export const PP = {
  grass(t, pal) {
    t.fill(0, 0);
    for (let k = 0; k < 11; k++) {
      let x = t.rng.int(1, 14);
      const h = t.rng.int(6, 13);
      for (let y = 0; y < h; y++) {
        t.set(x, 15 - y, pal[clamp(Math.floor((y / h) * pal.length), 0, pal.length - 1)]);
        if (y > h / 2 && t.rng.next() < 0.3) x += t.rng.pick([-1, 1]);
        x = clamp(x, 0, 15);
      }
    }
  },
  fern(t, pal) {
    t.fill(0, 0);
    for (const cx of [4, 8, 11]) {
      const h = t.rng.int(9, 14);
      for (let y = 0; y < h; y++) {
        const x = cx + Math.round(Math.sin(y * 0.3) * 1);
        t.set(x, 15 - y, pal[2]);
        if (y % 2 === 0 && y > 2) {
          t.set(x - 1, 15 - y, pal[1]);
          t.set(x + 1, 15 - y, pal[3]);
          if (y < h - 3) t.set(x - 2, 15 - y + 1, pal[0]);
        }
      }
    }
  },
  flower(t, petal, center, stem = 0x3c7a1e) {
    t.fill(0, 0);
    for (let y = 8; y < 16; y++) t.set(7, y, stem);
    t.set(6, 12, stem).set(5, 11, stem).set(8, 13, stem).set(9, 12, stem);
    for (const [x, y] of [
      [7, 4],
      [6, 5],
      [8, 5],
      [7, 6],
      [6, 6],
      [8, 6],
      [7, 7],
      [5, 5],
      [9, 5],
      [6, 4],
      [8, 4],
    ])
      t.set(x, y, petal);
    t.set(7, 5, center);
  },
  tallFlower(t, petal) {
    t.fill(0, 0);
    for (let y = 5; y < 16; y++) t.set(7, y, 0x3c7a1e);
    for (let y = 1; y < 7; y++)
      for (let x = 6; x < 9; x++) if (t.rng.next() < 0.8) t.set(x, y, petal);
    t.set(6, 10, 0x4c8a2a).set(8, 12, 0x4c8a2a);
  },
  deadBush(t) {
    t.fill(0, 0);
    const c = [0x6a4a22, 0x7a5a2a, 0x8a6632];
    const branch = (x, y, dx, len) => {
      for (let i = 0; i < len; i++) {
        t.set(x, y, t.rng.pick(c));
        x += dx;
        y -= 1;
        if (t.rng.next() < 0.3) dx = -dx;
        x = clamp(x, 0, 15);
      }
    };
    branch(7, 15, 0, 3);
    branch(7, 12, -1, 6);
    branch(8, 12, 1, 7);
    branch(7, 10, 0, 6);
  },
  wheat(t, ripe = true) {
    t.fill(0, 0);
    const stalk = ripe ? [0x8a7414, 0xb09a24, 0xcdb331] : [0x3a7a1e, 0x4c8a2a, 0x5f9a33];
    for (const x of [2, 5, 7, 10, 13]) {
      const h = t.rng.int(10, 14);
      for (let y = 0; y < h; y++) t.set(x, 15 - y, stalk[y > h - 4 ? 2 : 1]);
      if (ripe) for (let y = h - 4; y < h; y++) t.set(x + 1, 15 - y, 0xd6bb4a);
    }
  },
  bamboo(t) {
    t.fill(0, 0);
    const g = [0x5f9a2a, 0x7ab83a, 0x9ad24e, 0x4e8022];
    for (const x of [4, 10]) {
      for (let y = 0; y < 16; y++) {
        t.set(x, y, y % 6 === 0 ? g[3] : g[1]).set(x + 1, y, y % 6 === 0 ? g[3] : g[2]);
      }
    }
    for (const [x, y, dx] of [
      [6, 3, 1],
      [8, 9, -1],
      [12, 6, 1],
    ])
      for (let i = 0; i < 3; i++) t.set(x + dx * i, y - i, g[i % 2 ? 2 : 0]);
  },
  lilac(t, top = false) {
    t.fill(0, 0);
    const petals = [0xc87ab4, 0xe2a0d0, 0xf2c4e6, 0xa45a96];
    const leaf = [0x3c7a1e, 0x4c8a2a, 0x5f9a33];
    if (!top) {
      for (let y = 6; y < 16; y++) t.set(7, y, leaf[0]).set(8, y, leaf[1]);
      for (const [x, y] of [
        [5, 11],
        [4, 12],
        [10, 10],
        [11, 11],
        [6, 13],
        [9, 14],
      ])
        t.set(x, y, leaf[2]);
    }
    const y0 = top ? 2 : 0,
      y1 = top ? 14 : 8;
    for (let y = y0; y < y1; y++) {
      const w = top ? 2 + Math.round(Math.sin(((y - y0) / (y1 - y0)) * Math.PI) * 3) : 3;
      for (let x = 7 - w; x <= 8 + w; x++)
        if (t.rng.next() < 0.72) t.set(x, y, petals[t.rng.int(0, 3)]);
    }
    if (top) for (let y = 13; y < 16; y++) t.set(7, y, leaf[0]).set(8, y, leaf[1]);
  },
  sugarCane(t) {
    t.fill(0, 0);
    for (const x of [3, 8, 12])
      for (let y = 0; y < 16; y++)
        t.set(x, y, y % 5 === 0 ? 0x6fa04a : 0x8ac462).set(x + 1, y, 0x6fa04a);
  },
  mushroom(t, cap, spots) {
    t.fill(0, 0);
    for (let y = 10; y < 16; y++) t.set(7, y, 0xd8cfb8).set(8, y, 0xc8bfa8);
    for (let y = 6; y < 10; y++)
      for (let x = 5 - (y - 6 > 1 ? 1 : 0); x < 11 + (y - 6 > 1 ? 1 : 0); x++) t.set(x, y, cap);
    if (spots) t.set(6, 7, spots).set(9, 8, spots);
  },
  fire(t) {
    t.fill(0, 0);
    const cols = [0xa82a08, 0xf06a12, 0xffae2a, 0xfff08a];
    for (let x = 0; x < 16; x++) {
      const h = Math.floor(6 + Math.abs(Math.sin(x * 1.7)) * 8 + t.rng.int(0, 2));
      for (let y = 0; y < h; y++) {
        const k = clamp(Math.floor((y / h) * 4 + t.rng.next() * 0.8), 0, 3);
        const tt = x % 5 === 2 && y < h - 2 ? 0 : 3 - k;
        t.set(x, 15 - y, cols[tt]).glow(x, 15 - y, 255);
      }
    }
  },
  cobweb(t) {
    t.fill(0, 0);
    for (let i = 0; i < 16; i++) {
      t.set(i, i, 0xe8e8e8, 220);
      t.set(15 - i, i, 0xe8e8e8, 220);
      t.set(7, i, 0xe8e8e8, 200);
      t.set(i, 7, 0xe8e8e8, 200);
    }
    for (const r of [3, 6])
      for (let a = 0; a < 24; a++)
        t.set(
          Math.round(7.5 + Math.cos(a / 3.8) * r),
          Math.round(7.5 + Math.sin(a / 3.8) * r),
          0xdddddd,
          200,
        );
  },
  vines(t, pal) {
    t.fill(0, 0);
    for (const x0 of [2, 6, 9, 13]) {
      let x = x0;
      const h = t.rng.int(8, 16);
      for (let y = 0; y < h; y++) {
        t.set(x, y, pal[t.rng.int(0, pal.length - 1)]);
        if (t.rng.next() < 0.3) t.set(x + 1, y, pal[1]);
        if (t.rng.next() < 0.2) x = clamp(x + t.rng.pick([-1, 1]), 0, 15);
      }
    }
  },
  torch(t, f = [0xfff2a0, 0xffc34a, 0xff8a1a]) {
    t.fill(0, 0);
    for (let y = 6; y < 16; y++) {
      t.set(7, y, 0x6a4a22);
      t.set(8, y, 0x4c3418);
    }
    t.set(7, 6, f[1]).glow(7, 6, 255);
    t.set(8, 6, f[2]).glow(8, 6, 255);
    t.set(7, 5, f[0]).glow(7, 5, 255);
    t.set(8, 5, f[1]).glow(8, 5, 255);
    t.set(7, 4, f[0]).glow(7, 4, 255);
  },
  lantern(t) {
    t.fill(0, 0);
    const g = 0xffd26a;
    t.rect(5, 6, 6, 1, 0x2e2e38).rect(5, 13, 6, 1, 0x2e2e38);
    for (let y = 7; y < 13; y++) {
      t.set(5, y, 0x3a3a46).set(10, y, 0x3a3a46);
      for (let x = 6; x < 10; x++) t.set(x, y, g).glow(x, y, 255);
    }
    t.rect(6, 4, 4, 2, 0x2e2e38).rect(7, 1, 2, 3, 0x4a4a55);
  },
  ladder(t) {
    t.fill(0, 0);
    for (let y = 0; y < 16; y++) {
      t.set(2, y, 0x6a4a22).set(3, y, 0x7a5a2a);
      t.set(12, y, 0x6a4a22).set(13, y, 0x7a5a2a);
    }
    for (const y of [2, 6, 10, 14])
      for (let x = 4; x < 12; x++) t.set(x, y, 0x8a6632).set(x, y + 1, 0x6a4a22);
  },
  bars(t) {
    t.fill(0, 0);
    for (const x of [1, 5, 9, 13])
      for (let y = 0; y < 16; y++) t.set(x, y, 0x6a6a6a).set(x + 1, y, 0x9a9a9a);
    for (const y of [0, 15]) for (let x = 0; x < 16; x++) t.set(x, y, 0x5a5a5a);
  },
  berryBush(t) {
    PP.grass(t, [0x1e4a26, 0x2a5a30, 0x356a3a]);
    for (let k = 0; k < 6; k++) {
      const x = t.rng.int(2, 13),
        y = t.rng.int(4, 12);
      t.set(x, y, 0xc2182a).set(x, y - 1, 0xe23a4a);
    }
  },
};
