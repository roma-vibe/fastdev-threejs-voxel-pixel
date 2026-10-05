import { Rng } from '../core/Rng.js';
import { hexToRgb, clamp } from '../core/math.js';

/** Standard 64x64 box-character skin layout (inner + outer layers), plus accessory region x>=64. */
export const PARTS = {
  head: { uv: [0, 0], s: [8, 8, 8] },
  hat: { uv: [32, 0], s: [8, 8, 8] },
  body: { uv: [16, 16], s: [8, 12, 4] },
  jacket: { uv: [16, 32], s: [8, 12, 4] },
  armR: { uv: [40, 16], s: [4, 12, 4] },
  sleeveR: { uv: [40, 32], s: [4, 12, 4] },
  armL: { uv: [32, 48], s: [4, 12, 4] },
  sleeveL: { uv: [48, 48], s: [4, 12, 4] },
  legR: { uv: [0, 16], s: [4, 12, 4] },
  pantsR: { uv: [0, 32], s: [4, 12, 4] },
  legL: { uv: [16, 48], s: [4, 12, 4] },
  pantsL: { uv: [0, 48], s: [4, 12, 4] },
};

export function faceRects(uv, s) {
  const [u, v] = uv;
  const [w, h, d] = s;
  return {
    top: [u + d, v, w, d],
    bottom: [u + d + w, v, w, d],
    right: [u, v + d, d, h],
    front: [u + d, v + d, w, h],
    left: [u + d + w, v + d, d, h],
    back: [u + 2 * d + w, v + d, w, h],
  };
}

/**
 * Pixel painter for character skins. Two canvases: colour and emissive.
 * Coordinates are integer pixels. Emissive pixels also get painted in colour.
 */
export class SkinPainter {
  constructor(w = 128, h = 64, seed = 1, accStart = 64) {
    this.accStart = accStart;
    this.w = w;
    this.h = h;
    this.rng = new Rng(seed);
    this.color = document.createElement('canvas');
    this.color.width = w;
    this.color.height = h;
    this.emissive = document.createElement('canvas');
    this.emissive.width = w;
    this.emissive.height = h;
    this.c = this.color.getContext('2d');
    this.e = this.emissive.getContext('2d');
    this.cd = this.c.createImageData(w, h);
    this.ed = this.e.createImageData(w, h);
    for (let i = 3; i < this.ed.data.length; i += 4) this.ed.data[i] = 255;
    this.acc = { x: accStart, y: 0, rowH: 0 }; // accessory allocator
    this.parts = { ...PARTS };
    this.slim = false;
  }

  setSlim(slim) {
    this.slim = slim;
    if (slim) {
      this.parts.armR = { uv: [40, 16], s: [3, 12, 4] };
      this.parts.armL = { uv: [32, 48], s: [3, 12, 4] };
      this.parts.sleeveR = { uv: [40, 32], s: [3, 12, 4] };
      this.parts.sleeveL = { uv: [48, 48], s: [3, 12, 4] };
    }
  }

  /** Allocate an accessory UV block for a box of size [w,h,d]. Returns [u,v]. */
  alloc(size, name) {
    // texture regions are whole pixels even when a box is fractional (e.g. an 11.2-wide saddle panel);
    // a fractional cursor would shift every later part off the pixel grid and leave it unpainted
    const [w, h, d] = size.map((v) => Math.ceil(v - 1e-6));
    const bw = 2 * d + 2 * w,
      bh = d + h;
    if (this.acc.x + bw > this.w) {
      this.acc.x = this.accStart;
      this.acc.y += this.acc.rowH;
      this.acc.rowH = 0;
    }
    const uv = [this.acc.x, this.acc.y];
    this.acc.x += bw;
    this.acc.rowH = Math.max(this.acc.rowH, bh);
    if (name) this.parts[name] = { uv, s: [w, h, d] };
    return uv;
  }

  px(x, y, hex, a = 255) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    const [r, g, b] = hexToRgb(hex);
    this.cd.data[i] = r;
    this.cd.data[i + 1] = g;
    this.cd.data[i + 2] = b;
    this.cd.data[i + 3] = a;
  }
  glow(x, y, hex, strength = 1) {
    this.px(x, y, hex);
    const i = (y * this.w + x) * 4;
    const [r, g, b] = hexToRgb(hex);
    this.ed.data[i] = r * strength;
    this.ed.data[i + 1] = g * strength;
    this.ed.data[i + 2] = b * strength;
  }
  get(x, y) {
    const i = (y * this.w + x) * 4;
    return (this.cd.data[i] << 16) | (this.cd.data[i + 1] << 8) | this.cd.data[i + 2];
  }
  clearPx(x, y) {
    const i = (y * this.w + x) * 4;
    this.cd.data[i + 3] = 0;
  }

  rects(part) {
    const p = this.parts[part];
    if (!p) throw new Error('unknown part ' + part);
    return faceRects(p.uv, p.s);
  }

  /** Iterate all pixels of a part (all 6 faces). fn(face, lx, ly, fw, fh) -> hex | null */
  paintPart(part, fn, faces = ['top', 'bottom', 'right', 'front', 'left', 'back']) {
    const R = this.rects(part);
    for (const f of faces) {
      const [x0, y0, w, h] = R[f];
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const c = fn(f, x, y, w, h);
          if (c == null) continue;
          if (typeof c === 'object') {
            if (c.glow) this.glow(x0 + x, y0 + y, c.color, c.strength ?? 1);
            else if (c.clear) this.clearPx(x0 + x, y0 + y);
            else this.px(x0 + x, y0 + y, c.color, c.a ?? 255);
          } else this.px(x0 + x, y0 + y, c);
        }
    }
  }

  /** Fill a part with palette noise (rocky / fabric texture). */
  noisePart(part, pal, { faces, jitter = 0.35, scale = 1, dark = null } = {}) {
    const r = this.rng;
    this.paintPart(
      part,
      (f, x, y) => {
        let t =
          r.next() * jitter +
          (1 - jitter) * 0.5 +
          Math.sin((x * 1.7 + y * 2.3 + f.length * 3) * scale) * 0.12;
        if (dark && f === 'bottom') t *= 0.6;
        return pal[clamp(Math.floor(t * pal.length), 0, pal.length - 1)];
      },
      faces,
    );
  }

  /** Rocky plates: voronoi-like cell shading per face (for Rune / Magnorite). */
  rockPart(part, pal, crack, { faces, cells = 3 } = {}) {
    const R = this.rects(part);
    for (const f of faces ?? Object.keys(R)) {
      const [x0, y0, w, h] = R[f];
      const pts = [];
      const n = Math.max(2, Math.round(((w * h) / 16) * (cells / 3)));
      for (let i = 0; i < n; i++)
        pts.push([this.rng.next() * w, this.rng.next() * h, this.rng.range(0.25, 0.95)]);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          let b1 = 1e9,
            b2 = 1e9,
            bi = 0;
          pts.forEach((p, i) => {
            const d = Math.hypot(x + 0.5 - p[0], (y + 0.5 - p[1]) * 0.9);
            if (d < b1) {
              b2 = b1;
              b1 = d;
              bi = i;
            } else if (d < b2) b2 = d;
          });
          let t = pts[bi][2] + (this.rng.next() - 0.5) * 0.25 - b1 * 0.05;
          if (f === 'bottom') t -= 0.2;
          if (f === 'top') t += 0.1;
          const c =
            b2 - b1 < 0.55 && crack != null
              ? crack
              : pal[clamp(Math.floor(t * pal.length), 0, pal.length - 1)];
          this.px(x0 + x, y0 + y, c);
        }
    }
  }

  fillPart(part, hex, faces) {
    this.paintPart(part, () => hex, faces);
  }

  clearPart(part) {
    this.paintPart(part, () => ({ clear: true }));
  }

  /** Paint on a single face in face-local coords. */
  facePx(part, face, x, y, hex, glow = false, strength = 1) {
    const [x0, y0, w, h] = this.rects(part)[face];
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    if (glow) this.glow(x0 + x, y0 + y, hex, strength);
    else this.px(x0 + x, y0 + y, hex);
  }

  /** Paint around a limb: s in [0, 2d+2w) goes right->front->left->back; y from top. */
  wrapPx(part, s, y, hex, glow = false) {
    const p = this.parts[part];
    const [w, h, d] = p.s;
    const total = 2 * d + 2 * w;
    s = ((s % total) + total) % total;
    const R = this.rects(part);
    let face, lx;
    if (s < d) [face, lx] = ['right', s];
    else if (s < d + w) [face, lx] = ['front', s - d];
    else if (s < 2 * d + w) [face, lx] = ['left', s - d - w];
    else [face, lx] = ['back', s - 2 * d - w];
    const [x0, y0] = R[face];
    if (y < 0 || y >= h) return;
    if (glow) this.glow(x0 + lx, y0 + y, hex);
    else this.px(x0 + lx, y0 + y, hex);
  }

  /** Horizontal ring around a limb at row y. */
  ring(part, y, hex, glow = false) {
    const [w, , d] = this.parts[part].s;
    for (let s = 0; s < 2 * d + 2 * w; s++) this.wrapPx(part, s, y, hex, glow);
  }

  /** Line on a face (Bresenham). */
  line(part, face, x0, y0, x1, y1, hex, glow = false) {
    let dx = Math.abs(x1 - x0),
      sx = x0 < x1 ? 1 : -1,
      dy = -Math.abs(y1 - y0),
      sy = y0 < y1 ? 1 : -1,
      err = dx + dy;
    for (let i = 0; i < 64; i++) {
      this.facePx(part, face, x0, y0, hex, glow);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  /** Fill face rows [y0,y1) with colour (e.g. belts, boots). */
  band(part, y0, y1, hex, faces = ['front', 'back', 'left', 'right']) {
    const R = this.rects(part);
    for (const f of faces) {
      const [x, y, w, h] = R[f];
      for (let yy = Math.max(0, y0); yy < Math.min(h, y1); yy++)
        for (let xx = 0; xx < w; xx++)
          this.px(x + xx, y + yy, typeof hex === 'function' ? hex(f, xx, yy) : hex);
    }
  }

  /** Lid colour (used by the blink boxes). */
  setLidColor(hex) {
    for (let y = 60; y < 64; y++) for (let x = 118; x < 128; x++) this.px(x, y, hex);
  }

  finish() {
    this.c.putImageData(this.cd, 0, 0);
    this.e.putImageData(this.ed, 0, 0);
    return { color: this.color, emissive: this.emissive };
  }
}
