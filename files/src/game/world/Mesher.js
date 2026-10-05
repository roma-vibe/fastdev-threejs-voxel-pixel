import { GreedyFaces } from './GreedyFaces.js';
import { BLOCKS, T_OPAQUE, T_SHAPE, T_LIQUID, T_SOLID, SHAPE, BLOCK } from './Blocks.js';
import { SECTION } from './World.js';
import { hash3 } from '../core/Rng.js';
import { hexToRgb } from '../core/math.js';

const P = 2; // padding
const W = SECTION + P * 2;
const W2 = W * W;

/** Brightness curve for light levels 0..15 (0..255). */
const CURVE = new Uint8Array(16);
for (let l = 0; l < 16; l++) {
  const f = l / 15;
  CURVE[l] = Math.round(255 * Math.pow(f, 1.45));
}
const AO_LEVELS = [95, 160, 210, 255];

/** Per-block light colour (0..255 rgb) for coloured block light. */
const LCOL = BLOCKS.map((b) => hexToRgb(b.lightColor || 0xffc080));

/* ---------- geometry buffers ---------- */
class GeoBuf {
  constructor(tiled = false) {
    this.cap = 4096;
    this.tile = tiled ? new Float32Array(this.cap * 4) : null;
    this.pos = new Float32Array(this.cap * 3);
    this.nrm = new Int8Array(this.cap * 3);
    this.uv = new Float32Array(this.cap * 2);
    this.lit = new Uint8Array(this.cap * 4);
    this.trc = new Uint8Array(this.cap * 4);
    this.idx = [];
    this.n = 0;
  }
  reset() {
    this.n = 0;
    this.idx.length = 0;
  }
  grow() {
    const c = this.cap * 2;
    const g = (A, k) => {
      const b = new A.constructor(c * k);
      b.set(A);
      return b;
    };
    this.pos = g(this.pos, 3);
    this.nrm = g(this.nrm, 3);
    this.uv = g(this.uv, 2);
    this.lit = g(this.lit, 4);
    this.trc = g(this.trc, 4);
    if (this.tile) this.tile = g(this.tile, 4);
    this.cap = c;
  }
  vert(x, y, z, nx, ny, nz, u, v, sky, ao, wind, tr, tg, tb) {
    if (this.n >= this.cap) this.grow();
    const i = this.n++;
    if (this.tile) this.tile.fill(0, i * 4, i * 4 + 4);
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.nrm[i * 3] = nx * 127;
    this.nrm[i * 3 + 1] = ny * 127;
    this.nrm[i * 3 + 2] = nz * 127;
    this.uv[i * 2] = u;
    this.uv[i * 2 + 1] = v;
    this.lit[i * 4] = sky;
    this.lit[i * 4 + 1] = ao;
    this.lit[i * 4 + 2] = wind;
    this.lit[i * 4 + 3] = 255;
    this.trc[i * 4] = tr;
    this.trc[i * 4 + 1] = tg;
    this.trc[i * 4 + 2] = tb;
    this.trc[i * 4 + 3] = 255;
    return i;
  }
  quad(a, b, c, d, flip = false) {
    if (flip) this.idx.push(a, b, d, b, c, d);
    else this.idx.push(a, b, c, a, c, d);
  }
  /** Returns plain arrays for BufferGeometry or null if empty. */
  export() {
    if (!this.n) return null;
    const n = this.n;
    const index = n > 65535 ? new Uint32Array(this.idx) : new Uint16Array(this.idx);
    return {
      position: this.pos.slice(0, n * 3),
      normal: this.nrm.slice(0, n * 3),
      uv: this.uv.slice(0, n * 2),
      aLight: this.lit.slice(0, n * 4),
      aTorch: this.trc.slice(0, n * 4),
      index,
      ...(this.tile ? { aTile: this.tile.slice(0, n * 4) } : {}),
    };
  }
}

/* ---------- face tables ---------- */
const DIRS = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];
const FACE_TEX = ['side', 'side', 'top', 'bottom', 'side', 'side'];
// facing meta -> face index that shows 'front': 0 south(+Z) 1 west(-X) 2 north(-Z) 3 east(+X)
const FRONT_FACE = [4, 1, 5, 0];

function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

const FACES = DIRS.map((d, fi) => {
  const axis = d[0] ? 0 : d[1] ? 1 : 2;
  const o = [0, 1, 2].filter((a) => a !== axis);
  const combos = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];
  let corners = combos.map(([cb, cc]) => {
    const c = [0, 0, 0];
    c[axis] = d[axis] > 0 ? 1 : 0;
    c[o[0]] = cb;
    c[o[1]] = cc;
    const s1 = [0, 0, 0],
      s2 = [0, 0, 0];
    s1[o[0]] = cb ? 1 : -1;
    s2[o[1]] = cc ? 1 : -1;
    return { c, s1, s2 };
  });
  // fix winding so that the normal points along d
  const e1 = corners[1].c.map((v, i) => v - corners[0].c[i]);
  const e2 = corners[2].c.map((v, i) => v - corners[0].c[i]);
  const nn = cross(e1, e2);
  if (nn[0] * d[0] + nn[1] * d[1] + nn[2] * d[2] < 0)
    corners = [corners[0], corners[3], corners[2], corners[1]];
  const right = axis === 1 ? [1, 0, 0] : cross([0, 1, 0], d);
  for (const k of corners) {
    if (axis === 1) {
      k.u = k.c[0];
      k.v = d[1] > 0 ? 1 - k.c[2] : k.c[2];
    } else {
      k.u = (k.c[0] - 0.5) * right[0] + (k.c[1] - 0.5) * right[1] + (k.c[2] - 0.5) * right[2] + 0.5;
      k.v = k.c[1];
    }
  }
  return { d, fi, axis, axes: o, corners, tex: FACE_TEX[fi] };
});

/* ---------- mesher ---------- */
export class Mesher {
  constructor(world, atlas, { mergeFaces = true } = {}) {
    this.mergeFaces = mergeFaces;
    this.faces = new GreedyFaces();
    this.vertexLight = Array.from({ length: 4 }, () => [0, 0, 0, 0, 0]);
    this.vertexAO = [0, 0, 0, 0];
    this.world = world;
    this.atlas = atlas;
    this.ids = new Uint8Array(W * W * W);
    this.meta = new Uint8Array(W * W * W);
    this.sky = new Uint8Array(W * W * W);
    this.blk = new Uint8Array(W * W * W);
    this.src = new Uint8Array(W * W * W);
    this.bufs = {
      opaque: new GeoBuf(true),
      cutout: new GeoBuf(),
      translucent: new GeoBuf(),
      water: new GeoBuf(),
      lava: new GeoBuf(),
    };
    this.texUV = BLOCKS.map((b) => {
      const g = (k) => atlas.uv[k] || atlas.uv.stone;
      return {
        top: g(b.tex.top),
        bottom: g(b.tex.bottom),
        side: g(b.tex.side),
        front: b.tex.front ? g(b.tex.front) : null,
      };
    });
    this.tileUV = [null];
    this.tileId = new Map();
    for (const textures of this.texUV)
      for (const uv of Object.values(textures)) {
        if (!uv || this.tileId.has(uv)) continue;
        this.tileId.set(uv, this.tileUV.length);
        this.tileUV.push(uv);
      }
    this.windOf = BLOCKS.map((b) => Math.round((b.wind || 0) * 255));
    this.bucketOf = BLOCKS.map((b) => b.bucket);
  }

  _load(ox, oy, oz) {
    const w = this.world;
    const { sx, sy, sz, blocks, light, lsrc, meta } = w;
    const skyOut = w.skyEnabled ? 15 : 0;
    for (let ly = 0; ly < W; ly++) {
      const y = oy + ly - P;
      for (let lz = 0; lz < W; lz++) {
        const z = oz + lz - P;
        let li = W2 * ly + W * lz;
        for (let lx = 0; lx < W; lx++, li++) {
          const x = ox + lx - P;
          if (x < 0 || z < 0 || x >= sx || z >= sz || y < 0 || y >= sy) {
            this.ids[li] = 0;
            this.meta[li] = 0;
            this.sky[li] = y < 0 ? 0 : skyOut;
            this.blk[li] = 0;
            this.src[li] = 0;
            continue;
          }
          const i = x + sx * (z + sz * y);
          this.ids[li] = blocks[i];
          this.meta[li] = meta[i];
          this.sky[li] = light[i] >> 4;
          this.blk[li] = light[i] & 15;
          this.src[li] = lsrc[i];
        }
      }
    }
  }

  /** Build geometry arrays for section (sxi, syi, szi). Returns {bucket: arrays|null}. */
  build(sxi, syi, szi) {
    const ox = sxi * SECTION,
      oy = syi * SECTION,
      oz = szi * SECTION;
    this.origin = [ox, oy, oz];
    this.faces.reset();
    this._load(ox, oy, oz);
    for (const b of Object.values(this.bufs)) b.reset();
    const ids = this.ids;
    let any = false;
    for (let ly = P; ly < P + SECTION; ly++)
      for (let lz = P; lz < P + SECTION; lz++)
        for (let lx = P; lx < P + SECTION; lx++) {
          const li = lx + W * lz + W2 * ly;
          const id = ids[li];
          if (!id) continue;
          const bucket = this.bucketOf[id];
          if (bucket === 'none') continue;
          any = true;
          const wx = ox + lx - P,
            wy = oy + ly - P,
            wz = oz + lz - P;
          const shape = T_SHAPE[id];
          switch (shape) {
            case SHAPE.CUBE:
              this._cube(li, id, wx, wy, wz, bucket);
              break;
            case SHAPE.CROSS:
              this._cross(li, id, wx, wy, wz);
              break;
            case SHAPE.LIQUID:
              this._liquid(li, id, wx, wy, wz);
              break;
            case SHAPE.SLAB:
              this._box(li, id, wx, wy, wz, 0, 0, 0, 16, 8, 16, bucket);
              break;
            case SHAPE.TOPSLAB:
              this._box(li, id, wx, wy, wz, 0, 8, 0, 16, 16, 16, bucket);
              break;
            case SHAPE.LAYER:
              this._box(
                li,
                id,
                wx,
                wy,
                wz,
                0,
                0,
                0,
                16,
                id === BLOCK.snow_layer ? 2 : 1,
                16,
                bucket,
              );
              break;
            case SHAPE.TORCH:
              this._torch(li, id, wx, wy, wz);
              break;
            case SHAPE.LANTERN:
              this._lantern(li, id, wx, wy, wz);
              break;
            case SHAPE.FENCE:
              this._fence(li, id, wx, wy, wz, bucket);
              break;
            case SHAPE.PANE:
              this._pane(li, id, wx, wy, wz);
              break;
            case SHAPE.LADDER:
              this._ladder(li, id, wx, wy, wz);
              break;
            default:
              break;
          }
        }
    this._mergedFaces();
    const out = {};
    for (const [k, b] of Object.entries(this.bufs)) out[k] = any ? b.export() : null;
    return out;
  }

  /* ----- lighting helpers ----- */
  _lightAt(li) {
    return [this.sky[li], this.blk[li], this.src[li]];
  }

  /** Smooth light + AO for a face vertex. Returns [sky255, ao255, r, g, b]. */
  _vertexLight(ni, s1i, s2i, ci, out) {
    const ids = this.ids;
    const o1 = T_OPAQUE[ids[s1i]],
      o2 = T_OPAQUE[ids[s2i]],
      oc = T_OPAQUE[ids[ci]];
    const ao = o1 && o2 ? 0 : 3 - (o1 + o2 + oc);
    let skySum = this.sky[ni],
      n = 1;
    let r = 0,
      g = 0,
      b = 0;
    const addCol = (i) => {
      const l = this.blk[i];
      if (l) {
        const c = LCOL[this.src[i]] || LCOL[0];
        const f = CURVE[l];
        r += c[0] * f;
        g += c[1] * f;
        b += c[2] * f;
      }
    };
    addCol(ni);
    if (!o1) {
      skySum += this.sky[s1i];
      addCol(s1i);
      n++;
    }
    if (!o2) {
      skySum += this.sky[s2i];
      addCol(s2i);
      n++;
    }
    if (!oc && !(o1 && o2)) {
      skySum += this.sky[ci];
      addCol(ci);
      n++;
    }
    out[0] = Math.round(255 * Math.pow(skySum / n / 15, 1.45));
    out[1] = AO_LEVELS[ao];
    out[2] = Math.min(255, r / n / 255);
    out[3] = Math.min(255, g / n / 255);
    out[4] = Math.min(255, b / n / 255);
    return ao;
  }

  _cube(li, id, wx, wy, wz, bucket) {
    const ids = this.ids;
    const buf = this.bufs[bucket === 'opaque' ? 'opaque' : bucket];
    const uvs = this.texUV[id];
    const wind = this.windOf[id];
    const isLeaves = wind > 0;
    const translucent = bucket === 'translucent' || id === BLOCK.glass;
    const vl = this.vertexLight;
    const aos = this.vertexAO;
    const facing = this.meta[li] & 3;
    for (let f = 0; f < 6; f++) {
      const F = FACES[f];
      const d = F.d;
      const ni = li + d[0] + W * d[2] + W2 * d[1];
      const nid = ids[ni];
      if (T_OPAQUE[nid]) continue;
      if (translucent && nid === id) continue;
      if (nid === id && isLeaves && f === 3) continue; // skip leaf undersides stacked
      let tuv = uvs[F.tex];
      if (uvs.front && FRONT_FACE[facing] === f) tuv = uvs.front;
      const [u0, v0, u1, v1] = tuv;
      for (let k = 0; k < 4; k++) {
        const C = F.corners[k];
        const s1 = C.s1,
          s2 = C.s2;
        const s1i = ni + s1[0] + W * s1[2] + W2 * s1[1];
        const s2i = ni + s2[0] + W * s2[2] + W2 * s2[1];
        const ci = s1i + s2[0] + W * s2[2] + W2 * s2[1];
        aos[k] = this._vertexLight(ni, s1i, s2i, ci, vl[k]);
      }
      // Constant light/AO is the conservative merge rule. Gradients and moving vertices stay intact.
      if (
        this.mergeFaces &&
        bucket === 'opaque' &&
        !wind &&
        vl.every((light) => light.every((v, k) => Math.trunc(v) === Math.trunc(vl[0][k])))
      ) {
        this.faces.record(
          f,
          wx - this.origin[0],
          wy - this.origin[1],
          wz - this.origin[2],
          this.tileId.get(tuv),
          vl[0],
        );
        continue;
      }
      const first = buf.n;
      for (let k = 0; k < 4; k++) {
        const C = F.corners[k];
        const L = vl[k];
        buf.vert(
          wx + C.c[0],
          wy + C.c[1],
          wz + C.c[2],
          d[0],
          d[1],
          d[2],
          u0 + (u1 - u0) * C.u,
          v0 + (v1 - v0) * C.v,
          L[0],
          L[1],
          isLeaves ? 110 : 0,
          L[2],
          L[3],
          L[4],
        );
      }
      const flip = aos[0] + aos[2] < aos[1] + aos[3];
      buf.quad(first, first + 1, first + 2, first + 3, flip);
    }
  }

  _mergedFaces() {
    const buf = this.bufs.opaque;
    this.faces.emit((face, plane, a, b, width, height, tile, light, li) => {
      const F = FACES[face],
        axes = F.axes,
        d = F.d;
      const pos = [...this.origin],
        ext = [1, 1, 1];
      pos[F.axis] += plane;
      pos[axes[0]] += a;
      pos[axes[1]] += b;
      ext[axes[0]] = width;
      ext[axes[1]] = height;
      const [u0, v0, u1, v1] = this.tileUV[tile];
      const merged = width > 1 || height > 1;
      const nu = ext[F.axis === 0 ? 2 : 0],
        nv = ext[F.axis === 1 ? 2 : 1];
      const first = buf.n;
      for (const C of F.corners) {
        const i = buf.vert(
          pos[0] + C.c[0] * ext[0],
          pos[1] + C.c[1] * ext[1],
          pos[2] + C.c[2] * ext[2],
          d[0],
          d[1],
          d[2],
          merged ? C.u * nu : u0 + (u1 - u0) * C.u,
          merged ? C.v * nv : v0 + (v1 - v0) * C.v,
          light[li],
          light[li + 1],
          0,
          light[li + 2],
          light[li + 3],
          light[li + 4],
        );
        if (merged) buf.tile.set([u0, v0, u1 - u0, v1 - v0], i * 4);
      }
      buf.quad(first, first + 1, first + 2, first + 3);
    });
  }

  /** Flat-lit axis-aligned box in pixel units (0..16) inside the cell, with face culling at cell boundaries. */
  _box(li, id, wx, wy, wz, x0, y0, z0, x1, y1, z1, bucket, opts = {}) {
    const buf = this.bufs[bucket === 'none' ? 'opaque' : bucket];
    const uvs = this.texUV[id];
    const ids = this.ids;
    const tmp = [0, 0, 0, 0, 0];
    const bx = [x0 / 16, y0 / 16, z0 / 16],
      ex = [x1 / 16, y1 / 16, z1 / 16];
    for (let f = 0; f < 6; f++) {
      if (opts.skip && opts.skip[f]) continue;
      const F = FACES[f];
      const d = F.d;
      const atEdge = d[F.axis] > 0 ? ex[F.axis] >= 1 : bx[F.axis] <= 0;
      const ni = li + d[0] + W * d[2] + W2 * d[1];
      if (atEdge && T_OPAQUE[ids[ni]]) continue;
      const lightIdx = atEdge ? ni : li;
      tmp[0] = Math.round(255 * Math.pow(Math.max(this.sky[lightIdx], this.sky[li]) / 15, 1.45));
      const bl = Math.max(this.blk[lightIdx], this.blk[li]);
      const c =
        LCOL[this.blk[lightIdx] >= this.blk[li] ? this.src[lightIdx] : this.src[li]] || LCOL[0];
      const cf = CURVE[bl] / 255;
      const tuv = opts.uv || uvs[F.tex];
      const [u0, v0, u1, v1] = tuv;
      const idxs = [];
      for (let k = 0; k < 4; k++) {
        const C = F.corners[k];
        const px = C.c[0] ? ex[0] : bx[0],
          py = C.c[1] ? ex[1] : bx[1],
          pz = C.c[2] ? ex[2] : bx[2];
        // texture coordinates follow the sub-box extents
        let u, v;
        if (F.axis === 1) {
          u = px;
          v = d[1] > 0 ? 1 - pz : pz;
        } else {
          const right = F.axis === 0 ? [0, 0, -d[0]] : [d[2], 0, 0];
          u = (px - 0.5) * right[0] + (pz - 0.5) * right[2] + 0.5;
          v = py;
        }
        if (opts.uvMap) [u, v] = opts.uvMap(f, u, v);
        idxs.push(
          buf.vert(
            wx + px,
            wy + py,
            wz + pz,
            d[0],
            d[1],
            d[2],
            u0 + (u1 - u0) * u,
            v0 + (v1 - v0) * v,
            tmp[0],
            255,
            0,
            c[0] * cf,
            c[1] * cf,
            c[2] * cf,
          ),
        );
      }
      buf.quad(idxs[0], idxs[1], idxs[2], idxs[3]);
    }
  }

  _cross(li, id, wx, wy, wz) {
    const buf = this.bufs.cutout;
    const [u0, v0, u1, v1] = this.texUV[id].side;
    const sky = Math.round(255 * Math.pow(this.sky[li] / 15, 1.45));
    const c = LCOL[this.src[li]] || LCOL[0];
    const cf = CURVE[this.blk[li]] / 255;
    const wind = this.windOf[id];
    const h = hash3(wx, wy, wz, 7);
    const jx = (h - 0.5) * 0.3,
      jz = (hash3(wx, wy, wz, 11) - 0.5) * 0.3;
    const tall = 0.85 + hash3(wx, wy, wz, 3) * 0.3;
    const fire = id === BLOCK.fire || id === BLOCK.soul_fire;
    const height = fire ? 1.1 : Math.min(1, tall);
    const cx = wx + 0.5 + (fire ? 0 : jx),
      cz = wz + 0.5 + (fire ? 0 : jz);
    const r = 0.45;
    const planes = [
      [cx - r, cz - r, cx + r, cz + r],
      [cx - r, cz + r, cx + r, cz - r],
    ];
    const dark = 225;
    for (const [ax, az, bx, bz] of planes) {
      const nx = -(bz - az),
        nz = bx - ax;
      const nl = Math.hypot(nx, nz);
      for (const side of [1, -1]) {
        const n0 = (nx / nl) * side,
          n2 = (nz / nl) * side;
        const a = buf.vert(
          ax,
          wy,
          az,
          n0,
          0.3,
          n2,
          u0,
          v0,
          sky,
          dark,
          0,
          c[0] * cf,
          c[1] * cf,
          c[2] * cf,
        );
        const b = buf.vert(
          bx,
          wy,
          bz,
          n0,
          0.3,
          n2,
          u1,
          v0,
          sky,
          dark,
          0,
          c[0] * cf,
          c[1] * cf,
          c[2] * cf,
        );
        const cc = buf.vert(
          bx,
          wy + height,
          bz,
          n0,
          0.3,
          n2,
          u1,
          v1,
          sky,
          255,
          wind,
          c[0] * cf,
          c[1] * cf,
          c[2] * cf,
        );
        const d = buf.vert(
          ax,
          wy + height,
          az,
          n0,
          0.3,
          n2,
          u0,
          v1,
          sky,
          255,
          wind,
          c[0] * cf,
          c[1] * cf,
          c[2] * cf,
        );
        if (side > 0) buf.quad(a, b, cc, d);
        else buf.quad(b, a, d, cc);
      }
    }
  }

  _liquid(li, id, wx, wy, wz) {
    const ids = this.ids;
    const isWater = T_LIQUID[id] === 1;
    const buf = isWater ? this.bufs.water : this.bufs.lava;
    const above = ids[li + W2];
    const topH = T_LIQUID[above] === T_LIQUID[id] ? 1 : 0.875;
    const tmp = [0, 0, 0, 0, 0];
    for (let f = 0; f < 6; f++) {
      const F = FACES[f];
      const d = F.d;
      const ni = li + d[0] + W * d[2] + W2 * d[1];
      const nid = ids[ni];
      if (T_LIQUID[nid] === T_LIQUID[id]) continue;
      if (T_OPAQUE[nid] && f !== 2) continue;
      if (f === 2 && T_OPAQUE[nid]) continue;
      if (!isWater && f !== 2 && T_SOLID[nid]) continue;
      const idxs = [];
      const aos = [0, 0, 0, 0];
      for (let k = 0; k < 4; k++) {
        const C = F.corners[k];
        const s1i = ni + C.s1[0] + W * C.s1[2] + W2 * C.s1[1];
        const s2i = ni + C.s2[0] + W * C.s2[2] + W2 * C.s2[1];
        const ci = s1i + C.s2[0] + W * C.s2[2] + W2 * C.s2[1];
        aos[k] = this._vertexLight(ni, s1i, s2i, ci, tmp);
        const py = C.c[1] ? topH : 0;
        // world-space UVs for seamless animated liquids
        let u, v;
        if (F.axis === 1) {
          u = wx + C.c[0];
          v = wz + C.c[2];
        } else {
          u = F.axis === 0 ? wz + C.c[2] : wx + C.c[0];
          v = wy + py;
        }
        idxs.push(
          buf.vert(
            wx + C.c[0],
            wy + py,
            wz + C.c[2],
            d[0],
            d[1],
            d[2],
            u,
            v,
            tmp[0],
            isWater ? tmp[1] : 255,
            f === 2 ? 255 : 0,
            tmp[2],
            tmp[3],
            tmp[4],
          ),
        );
      }
      buf.quad(idxs[0], idxs[1], idxs[2], idxs[3], aos[0] + aos[2] < aos[1] + aos[3]);
      // underside of the water surface so it is visible from below
      if (f === 2 && isWater) {
        const b = idxs.map((i) => i);
        buf.idx.push(b[0], b[2], b[1], b[0], b[3], b[2]);
      }
    }
  }

  _torch(li, id, wx, wy, wz) {
    const [u0, v0, u1, v1] = this.texUV[id].side;
    // column of 2px wide in the texture (x 7..8, y 4..15)
    const tu0 = u0 + ((u1 - u0) * 7) / 16,
      tu1 = u0 + ((u1 - u0) * 9) / 16;
    this._box(li, id, wx, wy, wz, 7, 0, 7, 9, 12, 9, 'cutout', {
      uv: [tu0, v0, tu1, v1],
      uvMap: (f, u, v) => (f === 2 ? [0.5, 11 / 16] : f === 3 ? [0.5, 0.05] : [u, v]),
    });
  }

  _lantern(li, id, wx, wy, wz) {
    const [u0, v0, u1, v1] = this.texUV[id].side;
    const sub = (x0, y0, x1, y1) => [
      u0 + ((u1 - u0) * x0) / 16,
      v0 + ((v1 - v0) * (16 - y1)) / 16,
      u0 + ((u1 - u0) * x1) / 16,
      v0 + ((v1 - v0) * (16 - y0)) / 16,
    ];
    const hanging = T_SOLID[this.ids[li + W2]] && !T_SOLID[this.ids[li - W2]];
    const y0 = hanging ? 7 : 0;
    this._box(li, id, wx, wy, wz, 5, y0, 5, 11, y0 + 8, 11, 'cutout', { uv: sub(5, 6, 11, 14) });
    this._box(li, id, wx, wy, wz, 6, y0 + 8, 6, 10, y0 + 10, 10, 'cutout', {
      uv: sub(6, 4, 10, 6),
    });
  }

  _fence(li, id, wx, wy, wz, bucket) {
    const ids = this.ids;
    const post = id === BLOCK.stone_wall || id === BLOCK.blackstone_wall ? 4 : 2;
    const lo = 8 - post,
      hi = 8 + post;
    const wall = post === 4;
    this._box(li, id, wx, wy, wz, lo, 0, lo, hi, wall ? 16 : 16, hi, bucket);
    const con = (di) => {
      const n = ids[li + di];
      return T_SHAPE[n] === SHAPE.FENCE || T_OPAQUE[n];
    };
    const rails = wall
      ? [[0, 13]]
      : [
          [6, 9],
          [12, 15],
        ];
    const w = wall ? 3 : 1;
    for (const [ry0, ry1] of rails) {
      if (con(1)) this._box(li, id, wx, wy, wz, hi, ry0, 8 - w, 16, ry1, 8 + w, bucket);
      if (con(-1)) this._box(li, id, wx, wy, wz, 0, ry0, 8 - w, lo, ry1, 8 + w, bucket);
      if (con(W)) this._box(li, id, wx, wy, wz, 8 - w, ry0, hi, 8 + w, ry1, 16, bucket);
      if (con(-W)) this._box(li, id, wx, wy, wz, 8 - w, ry0, 0, 8 + w, ry1, lo, bucket);
    }
  }

  _pane(li, id, wx, wy, wz) {
    const ids = this.ids;
    const con = (di) => {
      const n = ids[li + di];
      return T_SHAPE[n] === SHAPE.PANE || T_OPAQUE[n];
    };
    const e = con(1),
      w = con(-1),
      s = con(W),
      n = con(-W);
    const none = !e && !w && !s && !n;
    if (e || w || none)
      this._box(li, id, wx, wy, wz, w || none ? 0 : 7, 0, 7, e || none ? 16 : 9, 16, 9, 'cutout');
    if (s || n) this._box(li, id, wx, wy, wz, 7, 0, n ? 0 : 7, 9, 16, s ? 16 : 9, 'cutout');
  }

  _ladder(li, id, wx, wy, wz) {
    const ids = this.ids;
    const m = this.meta[li] & 3;
    // meta: attached wall side 0:+Z 1:-X 2:-Z 3:+X; fallback to first solid neighbour
    let dir = m;
    const opts = [W, -1, -W, 1];
    if (!T_OPAQUE[ids[li + opts[dir]]])
      for (let k = 0; k < 4; k++)
        if (T_OPAQUE[ids[li + opts[k]]]) {
          dir = k;
          break;
        }
    const boxes = [
      [0, 0, 15, 16, 16, 16],
      [0, 0, 0, 1, 16, 16],
      [0, 0, 0, 16, 16, 1],
      [15, 0, 0, 16, 16, 16],
    ];
    const b = boxes[dir];
    this._box(li, id, wx, wy, wz, b[0], b[1], b[2], b[3], b[4], b[5], 'cutout');
  }
}
