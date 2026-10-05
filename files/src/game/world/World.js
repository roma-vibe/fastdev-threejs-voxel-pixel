import {
  T_SOLID,
  T_OPAQUE,
  T_SHAPE,
  T_LIGHT,
  T_FILTER,
  T_LIQUID,
  SHAPE,
  BLOCK,
  BLOCKS,
} from './Blocks.js';

export const SECTION = 32;

/**
 * Dense voxel world for one level. Index = x + sx * (z + sz * y).
 * light: high nibble = sky light, low nibble = block light. lsrc = block id of the light source (for coloured light).
 */
export class World {
  constructor(sx, sy, sz) {
    this.sx = sx;
    this.sy = sy;
    this.sz = sz;
    const n = sx * sy * sz;
    this.blocks = new Uint8Array(n);
    this.meta = new Uint8Array(n);
    this.light = new Uint8Array(n);
    this.lsrc = new Uint8Array(n);
    this.nsx = Math.ceil(sx / SECTION);
    this.nsy = Math.ceil(sy / SECTION);
    this.nsz = Math.ceil(sz / SECTION);
    this.dirty = new Set();
    this.lightReady = false;
    this.pendingRelight = [];
    this.skyEnabled = true; // false for underground or sky-less levels
    this.onBlockChange = null;
    this._queue = null;
  }

  inBounds(x, y, z) {
    return x >= 0 && y >= 0 && z >= 0 && x < this.sx && y < this.sy && z < this.sz;
  }
  idx(x, y, z) {
    return x + this.sx * (z + this.sz * y);
  }
  get(x, y, z) {
    x |= 0;
    y |= 0;
    z |= 0;
    if (x < 0 || y < 0 || z < 0 || x >= this.sx || y >= this.sy || z >= this.sz) return 0;
    return this.blocks[x + this.sx * (z + this.sz * y)];
  }
  getMeta(x, y, z) {
    if (!this.inBounds(x, y, z)) return 0;
    return this.meta[this.idx(x, y, z)];
  }
  /** Raw set without dirty-marking (used by generators before first mesh). */
  setRaw(x, y, z, id, meta = 0) {
    if (x < 0 || y < 0 || z < 0 || x >= this.sx || y >= this.sy || z >= this.sz) return;
    const i = x + this.sx * (z + this.sz * y);
    this.blocks[i] = id;
    this.meta[i] = meta;
  }
  /** Runtime set: marks sections dirty and relights. */
  set(x, y, z, id, meta = 0) {
    x |= 0;
    y |= 0;
    z |= 0;
    if (!this.inBounds(x, y, z)) return;
    const i = this.idx(x, y, z);
    if (this.blocks[i] === id && this.meta[i] === meta) return;
    const prev = this.blocks[i];
    this.blocks[i] = id;
    this.meta[i] = meta;
    this.markDirtyAround(x, y, z);
    if (this.lightReady) this.pendingRelight.push([x, y, z]);
    this.onBlockChange?.(x, y, z, id, prev);
  }
  markDirtyAround(x, y, z, r = 1) {
    const s0x = Math.floor((x - r) / SECTION),
      s1x = Math.floor((x + r) / SECTION);
    const s0y = Math.floor((y - r) / SECTION),
      s1y = Math.floor((y + r) / SECTION);
    const s0z = Math.floor((z - r) / SECTION),
      s1z = Math.floor((z + r) / SECTION);
    for (let a = s0x; a <= s1x; a++)
      for (let b = s0y; b <= s1y; b++)
        for (let c = s0z; c <= s1z; c++)
          if (a >= 0 && b >= 0 && c >= 0 && a < this.nsx && b < this.nsy && c < this.nsz)
            this.dirty.add(a + this.nsx * (c + this.nsz * b));
  }
  sky(x, y, z) {
    if (y >= this.sy) return this.skyEnabled ? 15 : 0;
    if (!this.inBounds(x, y, z)) return this.skyEnabled ? 15 : 0;
    return this.light[this.idx(x, y, z)] >> 4;
  }
  blockLight(x, y, z) {
    if (!this.inBounds(x, y, z)) return 0;
    return this.light[this.idx(x, y, z)] & 15;
  }
  isSolid(x, y, z) {
    return T_SOLID[this.get(x, y, z)] === 1;
  }
  isOpaque(x, y, z) {
    return T_OPAQUE[this.get(x, y, z)] === 1;
  }
  liquidAt(x, y, z) {
    return T_LIQUID[this.get(Math.floor(x), Math.floor(y), Math.floor(z))];
  }
  /** Highest y with a solid (collidable) block at column, or -1. */
  heightAt(x, z, from = this.sy - 1) {
    x = Math.floor(x);
    z = Math.floor(z);
    for (let y = from; y >= 0; y--) {
      const id = this.get(x, y, z);
      if (T_SOLID[id] || T_LIQUID[id]) return y;
    }
    return -1;
  }
  /** y of the ground surface under a point (first solid below `fromY`). */
  groundBelow(x, fromY, z) {
    x = Math.floor(x);
    z = Math.floor(z);
    for (let y = Math.floor(fromY); y >= 0; y--)
      if (T_SOLID[this.get(x, y, z)]) return y + collisionTop(this.get(x, y, z));
    return -Infinity;
  }
  /** Ground near a reference height: search down from fromY+3, else fall back to standY. */
  groundNear(x, z, fromY) {
    if (fromY == null) return this.standY(x, z);
    const g = this.groundBelow(x, fromY + 3, z);
    if (g > fromY - 12 && g !== -Infinity) {
      const bx = Math.floor(x),
        bz = Math.floor(z),
        by = Math.floor(g);
      if (!T_SOLID[this.get(bx, by, bz)] && !T_SOLID[this.get(bx, by + 1, bz)]) return g;
    }
    return this.standY(x, z);
  }

  /** Standing height ignoring leaves (spawns land under canopies, not on them). */
  standY(x, z) {
    x = Math.floor(x);
    z = Math.floor(z);
    for (let y = this.sy - 1; y >= 0; y--) {
      const id = this.get(x, y, z);
      if ((T_SOLID[id] || T_LIQUID[id]) && !BLOCKS[id].name.endsWith('_leaves')) {
        // need 2 blocks of headroom; otherwise keep searching below
        if (!T_SOLID[this.get(x, y + 1, z)] && !T_SOLID[this.get(x, y + 2, z)])
          return y + collisionTop(id);
      }
    }
    return this.surfaceY(x, z);
  }

  /** Walkable standing height for an actor at column (top of highest solid). */
  surfaceY(x, z) {
    const y = this.heightAt(x, z);
    return y < 0 ? 0 : y + 1;
  }

  /* ------------------------------------------------------------ */
  /* Collision                                                      */
  /* ------------------------------------------------------------ */
  /** Push AABBs [minx,miny,minz,maxx,maxy,maxz] of block at (x,y,z) into out. */
  collisionBoxes(x, y, z, out) {
    const id = this.get(x, y, z);
    if (!T_SOLID[id]) return;
    const s = T_SHAPE[id];
    if (s === SHAPE.CUBE || s === SHAPE.NONE || s === SHAPE.LIQUID)
      out.push([x, y, z, x + 1, y + 1, z + 1]);
    else if (s === SHAPE.SLAB) out.push([x, y, z, x + 1, y + 0.5, z + 1]);
    else if (s === SHAPE.TOPSLAB) out.push([x, y + 0.5, z, x + 1, y + 1, z + 1]);
    else if (s === SHAPE.LAYER) out.push([x, y, z, x + 1, y + 0.125, z + 1]);
    else if (s === SHAPE.FENCE || s === SHAPE.PANE) {
      const r = s === SHAPE.FENCE ? 0.2 : 0.08;
      const h = s === SHAPE.FENCE ? 1.5 : 1;
      out.push([x + 0.5 - r, y, z + 0.5 - r, x + 0.5 + r, y + h, z + 0.5 + r]);
      const con = (dx, dz) => {
        const n = this.get(x + dx, y, z + dz);
        return T_SHAPE[n] === s || T_OPAQUE[n];
      };
      if (con(1, 0)) out.push([x + 0.5, y, z + 0.5 - r, x + 1, y + h, z + 0.5 + r]);
      if (con(-1, 0)) out.push([x, y, z + 0.5 - r, x + 0.5, y + h, z + 0.5 + r]);
      if (con(0, 1)) out.push([x + 0.5 - r, y, z + 0.5, x + 0.5 + r, y + h, z + 1]);
      if (con(0, -1)) out.push([x + 0.5 - r, y, z, x + 0.5 + r, y + h, z + 0.5]);
    } else out.push([x, y, z, x + 1, y + 1, z + 1]);
  }

  /* ------------------------------------------------------------ */
  /* Raycast (Amanatides & Woo)                                     */
  /* ------------------------------------------------------------ */
  raycast(ox, oy, oz, dx, dy, dz, maxDist, test = defaultRayTest) {
    const len = Math.hypot(dx, dy, dz) || 1;
    dx /= len;
    dy /= len;
    dz /= len;
    let x = Math.floor(ox),
      y = Math.floor(oy),
      z = Math.floor(oz);
    const stepX = dx > 0 ? 1 : -1,
      stepY = dy > 0 ? 1 : -1,
      stepZ = dz > 0 ? 1 : -1;
    const tDeltaX = Math.abs(1 / dx),
      tDeltaY = Math.abs(1 / dy),
      tDeltaZ = Math.abs(1 / dz);
    let tMaxX = dx !== 0 ? (dx > 0 ? x + 1 - ox : ox - x) * tDeltaX : Infinity;
    let tMaxY = dy !== 0 ? (dy > 0 ? y + 1 - oy : oy - y) * tDeltaY : Infinity;
    let tMaxZ = dz !== 0 ? (dz > 0 ? z + 1 - oz : oz - z) * tDeltaZ : Infinity;
    let t = 0,
      nx = 0,
      ny = 0,
      nz = 0;
    for (let i = 0; i < 512 && t <= maxDist; i++) {
      const id = this.get(x, y, z);
      if (id && test(id, x, y, z))
        return {
          hit: true,
          x,
          y,
          z,
          id,
          t,
          nx,
          ny,
          nz,
          px: ox + dx * t,
          py: oy + dy * t,
          pz: oz + dz * t,
        };
      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        x += stepX;
        t = tMaxX;
        tMaxX += tDeltaX;
        nx = -stepX;
        ny = 0;
        nz = 0;
      } else if (tMaxY < tMaxZ) {
        y += stepY;
        t = tMaxY;
        tMaxY += tDeltaY;
        nx = 0;
        ny = -stepY;
        nz = 0;
      } else {
        z += stepZ;
        t = tMaxZ;
        tMaxZ += tDeltaZ;
        nx = 0;
        ny = 0;
        nz = -stepZ;
      }
    }
    return { hit: false, t: maxDist };
  }

  /** True if line of sight between two points is clear of opaque blocks. */
  lineOfSight(a, b) {
    const dx = b.x - a.x,
      dy = b.y - a.y,
      dz = b.z - a.z;
    const d = Math.hypot(dx, dy, dz);
    const r = this.raycast(a.x, a.y, a.z, dx, dy, dz, d, (id) => T_OPAQUE[id] === 1);
    return !r.hit;
  }

  /* ------------------------------------------------------------ */
  /* Lighting                                                       */
  /* ------------------------------------------------------------ */
  computeLighting() {
    this.relightRegion(0, 0, this.sx - 1, this.sz - 1, true);
    this.lightReady = true;
  }

  /** Apply queued relights (after runtime block changes). */
  flushRelight() {
    if (!this.pendingRelight.length) return;
    let x0 = Infinity,
      z0 = Infinity,
      x1 = -Infinity,
      z1 = -Infinity;
    for (const [x, , z] of this.pendingRelight) {
      x0 = Math.min(x0, x);
      z0 = Math.min(z0, z);
      x1 = Math.max(x1, x);
      z1 = Math.max(z1, z);
    }
    this.pendingRelight.length = 0;
    const R = 15;
    this.relightRegion(x0 - R, z0 - R, x1 + R, z1 + R, false);
    // Lighting changes affect the meshes of every section that overlaps the relit columns.
    const s0x = Math.max(0, Math.floor((x0 - R) / SECTION)),
      s1x = Math.min(this.nsx - 1, Math.floor((x1 + R) / SECTION)),
      s0z = Math.max(0, Math.floor((z0 - R) / SECTION)),
      s1z = Math.min(this.nsz - 1, Math.floor((z1 + R) / SECTION));
    for (let a = s0x; a <= s1x; a++)
      for (let c = s0z; c <= s1z; c++)
        for (let b = 0; b < this.nsy; b++) this.dirty.add(a + this.nsx * (c + this.nsz * b));
  }

  relightRegion(ax0, az0, ax1, az1, full) {
    const { sx, sy, sz, blocks, light, lsrc } = this;
    const x0 = Math.max(0, ax0),
      z0 = Math.max(0, az0),
      x1 = Math.min(sx - 1, ax1),
      z1 = Math.min(sz - 1, az1);
    const plane = sx * sz;
    const regionCells = (x1 - x0 + 1) * (z1 - z0 + 1) * sy;
    const qsize = Math.min(Math.max(1 << 16, regionCells * 2), 1 << 23);
    if (!this._queue || this._queue.length < qsize) this._queue = new Int32Array(qsize);
    const Q = this._queue;
    const QM = Q.length;

    // reset
    for (let y = 0; y < sy; y++)
      for (let z = z0; z <= z1; z++) {
        let i = x0 + sx * (z + sz * y);
        for (let x = x0; x <= x1; x++, i++) {
          light[i] = 0;
          lsrc[i] = 0;
        }
      }

    /* ---------- sky light ---------- */
    let head = 0,
      tail = 0;
    const push = (i) => {
      Q[tail] = i;
      tail = (tail + 1) % QM;
    };
    if (this.skyEnabled) {
      for (let z = z0; z <= z1; z++)
        for (let x = x0; x <= x1; x++) {
          let lvl = 15;
          for (let y = sy - 1; y >= 0; y--) {
            const i = x + sx * (z + sz * y);
            const f = T_FILTER[blocks[i]];
            if (f >= 15) lvl = 0;
            else if (f > 0) lvl = Math.max(0, lvl - f);
            if (lvl === 0) break;
            light[i] = lvl << 4;
          }
        }
      // seed: cells that can spread horizontally into darker neighbours
      for (let y = 0; y < sy; y++)
        for (let z = z0; z <= z1; z++)
          for (let x = x0; x <= x1; x++) {
            const i = x + sx * (z + sz * y);
            const l = light[i] >> 4;
            if (l < 2) continue;
            if (
              (x > 0 && light[i - 1] >> 4 < l - 1 && !T_OPAQUE[blocks[i - 1]]) ||
              (x < sx - 1 && light[i + 1] >> 4 < l - 1 && !T_OPAQUE[blocks[i + 1]]) ||
              (z > 0 && light[i - sx] >> 4 < l - 1 && !T_OPAQUE[blocks[i - sx]]) ||
              (z < sz - 1 && light[i + sx] >> 4 < l - 1 && !T_OPAQUE[blocks[i + sx]]) ||
              (y > 0 && light[i - plane] >> 4 < l - 1 && !T_OPAQUE[blocks[i - plane]])
            )
              push(i);
          }
      // boundary seeds (outside region, keep their values)
      if (!full) this._seedBoundary(x0, z0, x1, z1, 4, push);
      const trySky = (nx, ny, nz, ni, l) => {
        if (nx < x0 || nx > x1 || nz < z0 || nz > z1 || ny < 0 || ny >= sy) return;
        const b = blocks[ni];
        if (T_OPAQUE[b]) return;
        const f = T_FILTER[b];
        const nl = l - (f > 1 ? f : 1);
        if (nl > light[ni] >> 4) {
          light[ni] = (nl << 4) | (light[ni] & 15);
          Q[tail] = ni;
          tail = (tail + 1) % QM;
        }
      };
      while (head !== tail) {
        const i = Q[head];
        head = (head + 1) % QM;
        const l = light[i] >> 4;
        if (l < 2) continue;
        const y = (i / plane) | 0,
          rem = i - y * plane,
          z = (rem / sx) | 0,
          x = rem - z * sx;
        if (x > 0) trySky(x - 1, y, z, i - 1, l);
        if (x < sx - 1) trySky(x + 1, y, z, i + 1, l);
        if (z > 0) trySky(x, y, z - 1, i - sx, l);
        if (z < sz - 1) trySky(x, y, z + 1, i + sx, l);
        if (y > 0) trySky(x, y - 1, z, i - plane, l);
        if (y < sy - 1) trySky(x, y + 1, z, i + plane, l);
      }
    }

    /* ---------- block light ---------- */
    head = tail = 0;
    for (let y = 0; y < sy; y++)
      for (let z = z0; z <= z1; z++) {
        let i = x0 + sx * (z + sz * y);
        for (let x = x0; x <= x1; x++, i++) {
          const e = T_LIGHT[blocks[i]];
          if (e) {
            light[i] = (light[i] & 0xf0) | e;
            lsrc[i] = blocks[i];
            push(i);
          }
        }
      }
    if (!full) this._seedBoundary(x0, z0, x1, z1, 0, push);
    const tryBl = (nx, ny, nz, ni, l, src) => {
      if (nx < x0 || nx > x1 || nz < z0 || nz > z1 || ny < 0 || ny >= sy) return;
      const b = blocks[ni];
      if (T_OPAQUE[b]) return;
      const f = T_FILTER[b];
      const nl = l - (f > 1 ? f : 1);
      if (nl > (light[ni] & 15)) {
        light[ni] = (light[ni] & 0xf0) | nl;
        lsrc[ni] = src;
        Q[tail] = ni;
        tail = (tail + 1) % QM;
      }
    };
    while (head !== tail) {
      const i = Q[head];
      head = (head + 1) % QM;
      const l = light[i] & 15;
      if (l < 2) continue;
      const src = lsrc[i];
      const y = (i / plane) | 0,
        rem = i - y * plane,
        z = (rem / sx) | 0,
        x = rem - z * sx;
      if (x > 0) tryBl(x - 1, y, z, i - 1, l, src);
      if (x < sx - 1) tryBl(x + 1, y, z, i + 1, l, src);
      if (z > 0) tryBl(x, y, z - 1, i - sx, l, src);
      if (z < sz - 1) tryBl(x, y, z + 1, i + sx, l, src);
      if (y > 0) tryBl(x, y - 1, z, i - plane, l, src);
      if (y < sy - 1) tryBl(x, y + 1, z, i + plane, l, src);
    }
  }

  _seedBoundary(x0, z0, x1, z1, shift, push) {
    const { sx, sz, sy, light } = this;
    const add = (x, z) => {
      if (x < 0 || z < 0 || x >= sx || z >= sz) return;
      for (let y = 0; y < sy; y++) {
        const i = x + sx * (z + sz * y);
        const l = shift ? light[i] >> 4 : light[i] & 15;
        if (l > 1) push(i);
      }
    };
    // Seeds are outside the region, but tryN only writes inside it.
    for (let x = x0 - 1; x <= x1 + 1; x++) {
      add(x, z0 - 1);
      add(x, z1 + 1);
    }
    for (let z = z0; z <= z1; z++) {
      add(x0 - 1, z);
      add(x1 + 1, z);
    }
  }
}

export function collisionTop(id) {
  const s = T_SHAPE[id];
  if (s === SHAPE.SLAB) return 0.5;
  if (s === SHAPE.LAYER) return 0.125;
  if (s === SHAPE.FENCE) return 1.5;
  return 1;
}

function defaultRayTest(id) {
  return T_SOLID[id] === 1 && id !== BLOCK.barrier;
}

export const RAY_OPAQUE = (id) =>
  T_OPAQUE[id] === 1 ||
  (T_SOLID[id] === 1 && BLOCKS[id].shape !== SHAPE.PANE && id !== BLOCK.barrier);
