import { BLOCK as B, T_SOLID, T_OPAQUE, T_LIQUID, BLOCKS } from './Blocks.js';
import { Noise } from '../core/Noise.js';
import { Rng } from '../core/Rng.js';
import { clamp, lerp, smoothstep } from '../core/math.js';

/**
 * Terrain & structure toolkit operating on a World. All coordinates are integer block coords.
 */
export class Gen {
  constructor(world, seed = 1) {
    this.w = world;
    this.seed = seed;
    this.rng = new Rng(seed);
    this.noise = new Noise(seed);
    this.noise2 = new Noise(seed * 7 + 13);
    this.height = new Int16Array(world.sx * world.sz);
    this.protectMask = new Uint8Array(world.sx * world.sz);
    this.B = B;
  }

  /** Mark cells so vegetation / boulders are not placed there (paths, plazas). */
  protect(x0, z0, x1, z1) {
    const { sx, sz } = this.w;
    for (
      let z = Math.max(0, Math.floor(Math.min(z0, z1)));
      z <= Math.min(sz - 1, Math.floor(Math.max(z0, z1)));
      z++
    )
      for (
        let x = Math.max(0, Math.floor(Math.min(x0, x1)));
        x <= Math.min(sx - 1, Math.floor(Math.max(x0, x1)));
        x++
      )
        this.protectMask[x + z * sx] = 1;
  }
  protectCircle(cx, cz, r) {
    for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++)
        if ((x - cx) ** 2 + (z - cz) ** 2 <= r * r && this.w.inBounds(x, 0, z))
          this.protectMask[x + z * this.w.sx] = 1;
  }
  isProtected(x, z, margin = 0) {
    const { sx, sz } = this.w;
    for (let dz = -margin; dz <= margin; dz++)
      for (let dx = -margin; dx <= margin; dx++) {
        const px = x + dx,
          pz = z + dz;
        if (px >= 0 && pz >= 0 && px < sx && pz < sz && this.protectMask[px + pz * sx]) return true;
      }
    return false;
  }

  /* ---------------- primitives ---------------- */
  id(b) {
    return typeof b === 'string' ? (B[b] ?? (console.warn('unknown block', b), B.stone)) : b;
  }
  get(x, y, z) {
    return this.w.get(x, y, z);
  }
  set(x, y, z, b, meta = 0) {
    this.w.setRaw(Math.round(x), Math.round(y), Math.round(z), this.id(b), meta);
  }
  setIfAir(x, y, z, b, meta = 0) {
    const cur = this.w.get(Math.round(x), Math.round(y), Math.round(z));
    if (!cur || BLOCKS[cur].replaceable) this.set(x, y, z, b, meta);
  }
  fill(x0, y0, z0, x1, y1, z1, b, meta = 0) {
    const id = this.id(b);
    const [ax, bx] = [Math.min(x0, x1), Math.max(x0, x1)];
    const [ay, by] = [Math.min(y0, y1), Math.max(y0, y1)];
    const [az, bz] = [Math.min(z0, z1), Math.max(z0, z1)];
    for (let y = ay; y <= by; y++)
      for (let z = az; z <= bz; z++)
        for (let x = ax; x <= bx; x++) this.w.setRaw(x, y, z, id, meta);
  }
  /** Fill with a random pick from weighted list [[block, weight], ...]. */
  fillMix(x0, y0, z0, x1, y1, z1, mix) {
    const ids = mix.map(([b, w]) => [this.id(b), w]);
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
      for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++)
        for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++)
          this.w.setRaw(x, y, z, this.rng.weighted(ids));
  }
  pickMix(mix) {
    return this.rng.weighted(mix.map(([b, w]) => [this.id(b), w]));
  }
  clear(x0, y0, z0, x1, y1, z1) {
    this.fill(x0, y0, z0, x1, y1, z1, B.air);
  }
  hollow(x0, y0, z0, x1, y1, z1, wall, floor = wall, ceil = wall) {
    this.fill(x0, y0, z0, x1, y1, z1, wall);
    this.clear(x0 + 1, y0 + 1, z0 + 1, x1 - 1, y1 - 1, z1 - 1);
    if (floor) this.fill(x0, y0, z0, x1, y0, z1, floor);
    if (ceil) this.fill(x0, y1, z0, x1, y1, z1, ceil);
  }
  walls(x0, y0, z0, x1, y1, z1, b) {
    this.fill(x0, y0, z0, x1, y1, z0, b);
    this.fill(x0, y0, z1, x1, y1, z1, b);
    this.fill(x0, y0, z0, x0, y1, z1, b);
    this.fill(x1, y0, z0, x1, y1, z1, b);
  }
  sphere(cx, cy, cz, r, b, { onlyReplace = null, hollowR = 0, squashY = 1 } = {}) {
    const id = this.id(b);
    const R = Math.ceil(r);
    for (let y = -R; y <= R; y++)
      for (let z = -R; z <= R; z++)
        for (let x = -R; x <= R; x++) {
          const d = Math.sqrt(x * x + (y / squashY) ** 2 + z * z);
          if (d > r || d < hollowR) continue;
          const px = cx + x,
            py = cy + y,
            pz = cz + z;
          if (onlyReplace && !onlyReplace(this.get(px, py, pz))) continue;
          this.w.setRaw(px, py, pz, id);
        }
  }
  cylinder(cx, y0, cz, r, h, b, { hollow = false, onlyAir = false } = {}) {
    const id = this.id(b);
    const R = Math.ceil(r);
    for (let y = y0; y < y0 + h; y++)
      for (let z = -R; z <= R; z++)
        for (let x = -R; x <= R; x++) {
          const d = Math.sqrt(x * x + z * z);
          if (d > r + 0.3) continue;
          if (hollow && d < r - 0.7) continue;
          if (onlyAir && this.get(cx + x, y, cz + z)) continue;
          this.w.setRaw(cx + x, y, cz + z, id);
        }
  }
  line(x0, y0, z0, x1, y1, z1, b, r = 0) {
    const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0))) || 1;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = Math.round(lerp(x0, x1, t)),
        y = Math.round(lerp(y0, y1, t)),
        z = Math.round(lerp(z0, z1, t));
      if (r > 0) this.sphere(x, y, z, r, b);
      else this.set(x, y, z, b);
    }
  }

  /* ---------------- terrain ---------------- */
  /**
   * Build a heightmap with fn(x, z, noise) -> height (float). Stores into this.height.
   */
  heightmap(fn) {
    const { sx, sz } = this.w;
    for (let z = 0; z < sz; z++)
      for (let x = 0; x < sx; x++)
        this.height[x + z * sx] = Math.round(
          clamp(fn(x, z, this.noise, this.noise2), 1, this.w.sy - 2),
        );
    return this.height;
  }
  h(x, z) {
    x = clamp(Math.round(x), 0, this.w.sx - 1);
    z = clamp(Math.round(z), 0, this.w.sz - 1);
    return this.height[x + z * this.w.sx];
  }
  setH(x, z, v) {
    if (x < 0 || z < 0 || x >= this.w.sx || z >= this.w.sz) return;
    this.height[x + z * this.w.sx] = v;
  }

  /**
   * Lay down columns from the heightmap.
   * layers(x, z, h) -> { top, under, underDepth, stone, deep }
   */
  columns(layers, { waterLevel = -1, water = 'water', bedrock = true, beach = 'sand' } = {}) {
    const { sx, sz } = this.w;
    const L = (v) => this.id(v);
    for (let z = 0; z < sz; z++)
      for (let x = 0; x < sx; x++) {
        const h = this.height[x + z * sx];
        const spec = layers(x, z, h);
        const top = L(spec.top ?? 'grass'),
          under = L(spec.under ?? 'dirt'),
          stone = L(spec.stone ?? 'stone'),
          deep = L(spec.deep ?? spec.stone ?? 'stone');
        const ud = spec.underDepth ?? 3;
        for (let y = 0; y <= h; y++) {
          let id;
          if (y === 0 && bedrock) id = B.bedrock;
          else if (y === h)
            id =
              h < waterLevel && spec.underwaterTop !== false
                ? L(spec.seabed ?? (h >= waterLevel - 2 ? beach : 'gravel'))
                : top;
          else if (y > h - ud - 1) id = under;
          else if (y < h * 0.45) id = deep;
          else id = stone;
          this.w.setRaw(x, y, z, id);
        }
        if (waterLevel > 0)
          for (let y = h + 1; y <= waterLevel; y++) this.w.setRaw(x, y, z, L(water));
      }
  }

  /** Surface y (top solid block) at x,z by scanning the world. */
  surface(x, z) {
    return this.w.heightAt(x, z);
  }

  /** Carve caves using 3D noise below the surface. */
  caves({ threshold = 0.62, scale = 0.06, minY = 4, maxBelowSurface = 4 } = {}) {
    const { sx, sz } = this.w;
    const n = this.noise2;
    for (let z = 0; z < sz; z++)
      for (let x = 0; x < sx; x++) {
        const top = this.height[x + z * sx] - maxBelowSurface;
        for (let y = minY; y < top; y++) {
          const v =
            Math.abs(n.noise3(x * scale, y * scale * 1.6, z * scale)) +
            Math.abs(n.noise3(x * scale * 0.5 + 99, y * scale, z * scale * 0.5));
          if (v < 1 - threshold) this.w.setRaw(x, y, z, B.air);
        }
      }
  }

  ores(
    list = [
      ['coal_ore', 0.012, 60],
      ['iron_ore', 0.006, 40],
      ['gold_ore', 0.002, 25],
      ['diamond_ore', 0.0008, 16],
    ],
  ) {
    const { sx, sz } = this.w;
    for (const [ore, p, maxY] of list) {
      const id = this.id(ore);
      const count = Math.floor(sx * sz * maxY * p * 0.08);
      for (let i = 0; i < count; i++) {
        const x = this.rng.int(0, sx - 1),
          y = this.rng.int(2, maxY),
          z = this.rng.int(0, sz - 1);
        const size = this.rng.int(2, 6);
        for (let k = 0; k < size; k++) {
          const px = x + this.rng.int(-1, 1),
            py = y + this.rng.int(-1, 1),
            pz = z + this.rng.int(-1, 1);
          const cur = this.get(px, py, pz);
          if (cur === B.stone || cur === B.andesite) this.w.setRaw(px, py, pz, id);
        }
      }
    }
  }

  /** Flatten a rectangular area to height y (fills below with `fill`, clears above). */
  flatten(
    x0,
    z0,
    x1,
    z1,
    y,
    { top = 'grass', fill = 'dirt', clearAbove = 30, blend = 4, protect = true } = {},
  ) {
    const topId = this.id(top),
      fillId = this.id(fill);
    if (protect) this.protect(x0, z0, x1, z1);
    for (let z = z0 - blend; z <= z1 + blend; z++)
      for (let x = x0 - blend; x <= x1 + blend; x++) {
        if (!this.w.inBounds(x, 0, z)) continue;
        const dx = Math.max(x0 - x, 0, x - x1),
          dz = Math.max(z0 - z, 0, z - z1);
        const d = Math.max(dx, dz);
        const cur = this.h(x, z);
        const t = blend > 0 ? smoothstep(blend, 0, d) : d === 0 ? 1 : 0;
        const ty = Math.round(lerp(cur, y, t));
        if (t <= 0) continue;
        for (let yy = ty + 1; yy <= Math.max(cur, ty) + clearAbove; yy++) {
          const c = this.get(x, yy, z);
          if (c && !T_LIQUID[c]) this.w.setRaw(x, yy, z, B.air);
        }
        for (let yy = Math.min(cur, ty) - 1; yy < ty; yy++)
          if (yy > 0) this.w.setRaw(x, yy, z, fillId);
        this.w.setRaw(x, ty, z, topId);
        this.setH(x, z, ty);
      }
  }

  /**
   * Paint a path along polyline points [[x,z], ...] following the terrain surface.
   */
  path(points, { width = 3, block = 'path', edge = 'coarse_dirt', jitter = 0.35 } = {}) {
    const id = this.id(block),
      edgeId = edge ? this.id(edge) : null;
    const pts = [];
    for (let i = 0; i < points.length - 1; i++) {
      const [ax, az] = points[i],
        [bx, bz] = points[i + 1];
      const n = Math.ceil(Math.hypot(bx - ax, bz - az));
      for (let k = 0; k < n; k++) pts.push([lerp(ax, bx, k / n), lerp(az, bz, k / n)]);
    }
    pts.push(points[points.length - 1]);
    const r = width / 2;
    for (const [px, pz] of pts) this.protectCircle(px, pz, r + 1.5);
    for (const [px, pz] of pts) {
      for (let dz = -Math.ceil(r + 1); dz <= Math.ceil(r + 1); dz++)
        for (let dx = -Math.ceil(r + 1); dx <= Math.ceil(r + 1); dx++) {
          const x = Math.round(px + dx),
            z = Math.round(pz + dz);
          const d = Math.hypot(dx, dz) + (this.rng.next() - 0.5) * jitter * 2;
          if (d > r + 1) continue;
          const y = this.surface(x, z);
          if (y < 0) continue;
          const cur = this.get(x, y, z);
          if (T_LIQUID[cur]) continue;
          // remove plants above
          const above = this.get(x, y + 1, z);
          if (above && BLOCKS[above].replaceable) this.w.setRaw(x, y + 1, z, B.air);
          if (d <= r) this.w.setRaw(x, y, z, id);
          else if (edgeId && this.rng.chance(0.5)) this.w.setRaw(x, y, z, edgeId);
          // keep headroom clear
          for (let yy = y + 1; yy <= y + 4; yy++) {
            const c = this.get(x, yy, z);
            if (
              c &&
              (BLOCKS[c].name.includes('leaves') || BLOCKS[c].replaceable || c === B.snow_layer)
            )
              this.w.setRaw(x, yy, z, B.air);
          }
        }
    }
    return pts;
  }

  /** Carve a river channel along points; fills with water at waterY. */
  river(points, { width = 6, depth = 3, waterY, bank = 'sand', bed = 'gravel' } = {}) {
    const pts = [];
    for (let i = 0; i < points.length - 1; i++) {
      const [ax, az] = points[i],
        [bx, bz] = points[i + 1];
      const n = Math.ceil(Math.hypot(bx - ax, bz - az));
      for (let k = 0; k < n; k++) pts.push([lerp(ax, bx, k / n), lerp(az, bz, k / n)]);
    }
    const r = width / 2;
    const bankId = this.id(bank),
      bedId = this.id(bed);
    // snapshot the centre-line heights so overlapping samples don't keep digging deeper
    const base = pts.map(([px, pz]) => this.h(Math.round(px), Math.round(pz)) - 1);
    for (let i = 0; i < pts.length; i++) {
      const [px, pz] = pts[i];
      for (let dz = -Math.ceil(r + 2); dz <= Math.ceil(r + 2); dz++)
        for (let dx = -Math.ceil(r + 2); dx <= Math.ceil(r + 2); dx++) {
          const x = Math.round(px + dx),
            z = Math.round(pz + dz);
          if (!this.w.inBounds(x, 0, z)) continue;
          const d = Math.hypot(dx, dz);
          if (d > r + 2) continue;
          const wy = waterY ?? base[i];
          if (d <= r) {
            const bottom = wy - Math.round(depth * (1 - (d / r) ** 2)) - 1;
            for (let y = bottom + 1; y < this.w.sy; y++)
              this.w.setRaw(x, y, z, y <= wy ? B.water : B.air);
            this.w.setRaw(x, bottom, z, bedId);
            this.setH(x, z, bottom);
          } else {
            const top = this.surface(x, z);
            if (top > wy + 1) for (let y = wy + 1; y <= top; y++) this.w.setRaw(x, y, z, B.air);
            if (!T_LIQUID[this.get(x, wy, z)]) this.w.setRaw(x, wy, z, bankId);
            this.setH(x, z, Math.min(top, wy));
          }
        }
    }
    return pts;
  }

  /* ---------------- vegetation ---------------- */
  tree(x, y, z, type = 'oak', size = 1) {
    const r = this.rng;
    const leafSphere = (cx, cy, cz, rad, leaf, sq = 1) => {
      const R = Math.ceil(rad);
      for (let dy = -R; dy <= R; dy++)
        for (let dz = -R; dz <= R; dz++)
          for (let dx = -R; dx <= R; dx++) {
            const d = Math.sqrt(dx * dx + (dy * sq) ** 2 + dz * dz);
            if (d > rad + (r.next() - 0.5) * 0.8) continue;
            const px = cx + dx,
              py = cy + dy,
              pz = cz + dz;
            const cur = this.get(px, py, pz);
            if (!cur || BLOCKS[cur].replaceable) this.set(px, py, pz, leaf);
          }
    };
    const trunk = (h, log, x0 = x, z0 = z) => {
      for (let i = 0; i < h; i++) this.set(x0, y + i, z0, log);
    };
    switch (type) {
      case 'oak': {
        const h = Math.round((4 + r.int(0, 2)) * size);
        trunk(h, 'oak_log');
        leafSphere(x, y + h - 1, z, 2.3 * size + 0.4, 'oak_leaves', 1.3);
        leafSphere(x, y + h + 1, z, 1.4 * size, 'oak_leaves');
        break;
      }
      case 'bigoak': {
        const h = Math.round((7 + r.int(0, 3)) * size);
        trunk(h, 'oak_log');
        for (let b = 0; b < 4; b++) {
          const a = r.range(0, Math.PI * 2),
            len = r.range(2.5, 4.5) * size;
          const by = y + h - r.int(1, 4);
          const ex = Math.round(x + Math.cos(a) * len),
            ez = Math.round(z + Math.sin(a) * len),
            ey = by + 2;
          this.line(x, by, z, ex, ey, ez, 'oak_log');
          leafSphere(ex, ey + 1, ez, 2.6 * size, 'oak_leaves', 1.4);
        }
        leafSphere(x, y + h + 1, z, 3 * size, 'oak_leaves', 1.3);
        break;
      }
      case 'birch': {
        const h = Math.round((5 + r.int(0, 3)) * size);
        trunk(h, 'birch_log');
        leafSphere(x, y + h - 1, z, 2.1 * size, 'birch_leaves', 1.1);
        leafSphere(x, y + h + 1, z, 1.3, 'birch_leaves');
        break;
      }
      case 'spruce': {
        const h = Math.round((7 + r.int(0, 4)) * size);
        trunk(h, 'spruce_log');
        let rad = 0.6;
        for (let i = h + 1; i >= 2; i--) {
          const layer = (h + 1 - i) % 3;
          const rr = rad * (layer === 0 ? 0.55 : 1);
          for (let dz = -3; dz <= 3; dz++)
            for (let dx = -3; dx <= 3; dx++) {
              if (Math.abs(dx) + Math.abs(dz) * 0.9 > rr + 0.3) continue;
              this.setIfAir(x + dx, y + i, z + dz, 'spruce_leaves');
            }
          rad = Math.min(3.2 * size, rad + 0.45);
        }
        this.set(x, y + h + 1, z, 'spruce_leaves');
        this.set(x, y + h + 2, z, 'spruce_leaves');
        break;
      }
      case 'snowspruce': {
        this.tree(x, y, z, 'spruce', size);
        // snow caps on top leaves
        for (let dz = -4; dz <= 4; dz++)
          for (let dx = -4; dx <= 4; dx++)
            for (let yy = y + 14; yy >= y + 2; yy--) {
              const c = this.get(x + dx, yy, z + dz);
              if (c === B.spruce_leaves) {
                if (!this.get(x + dx, yy + 1, z + dz))
                  this.set(x + dx, yy + 1, z + dz, 'snow_layer');
                break;
              }
            }
        break;
      }
      case 'jungle': {
        const h = Math.round((10 + r.int(0, 8)) * size);
        const big = size > 1.2;
        trunk(h, 'jungle_log');
        if (big) {
          trunk(h, 'jungle_log', x + 1, z);
          trunk(h, 'jungle_log', x, z + 1);
          trunk(h, 'jungle_log', x + 1, z + 1);
        }
        leafSphere(x, y + h, z, 3.4 * size, 'jungle_leaves', 1.8);
        for (let b = 0; b < 3; b++) {
          const a = r.range(0, Math.PI * 2);
          const by = y + Math.round(h * r.range(0.5, 0.8));
          const ex = Math.round(x + Math.cos(a) * 4),
            ez = Math.round(z + Math.sin(a) * 4);
          this.line(x, by, z, ex, by + 2, ez, 'jungle_log');
          leafSphere(ex, by + 3, ez, 2.4, 'jungle_leaves', 1.6);
        }
        // hanging vines
        for (let k = 0; k < 10 * size; k++) {
          const vx = x + r.int(-4, 4),
            vz = z + r.int(-4, 4);
          for (let yy = y + h + 3; yy > y + 2; yy--) {
            if (this.get(vx, yy, vz) === B.jungle_leaves) {
              const len = r.int(2, 7);
              for (let i = 1; i <= len; i++)
                if (!this.get(vx, yy - i, vz)) this.set(vx, yy - i, vz, 'hanging_vines');
              break;
            }
          }
        }
        break;
      }
      case 'darkoak': {
        const h = Math.round((6 + r.int(0, 2)) * size);
        for (const [ox, oz] of [
          [0, 0],
          [1, 0],
          [0, 1],
          [1, 1],
        ])
          trunk(h, 'dark_oak_log', x + ox, z + oz);
        leafSphere(x, y + h, z, 3.3 * size, 'dark_oak_leaves', 1.9);
        leafSphere(x + 1, y + h + 1, z + 1, 2.8 * size, 'dark_oak_leaves', 1.6);
        break;
      }
      case 'acacia': {
        const h = Math.round((5 + r.int(0, 2)) * size);
        const dx = r.pick([-1, 1]),
          dz = r.pick([-1, 0, 1]);
        let cx = x,
          cz = z;
        for (let i = 0; i < h; i++) {
          if (i > h / 2) {
            cx += i % 2 ? dx : 0;
            cz += i % 3 ? 0 : dz;
          }
          this.set(cx, y + i, cz, 'acacia_log');
        }
        for (let ddz = -3; ddz <= 3; ddz++)
          for (let ddx = -3; ddx <= 3; ddx++) {
            if (Math.abs(ddx) + Math.abs(ddz) > 4) continue;
            this.setIfAir(cx + ddx, y + h, cz + ddz, 'acacia_leaves');
            if (Math.abs(ddx) + Math.abs(ddz) < 3)
              this.setIfAir(cx + ddx, y + h + 1, cz + ddz, 'acacia_leaves');
          }
        break;
      }
      case 'dead': {
        const h = 3 + r.int(0, 3);
        trunk(h, 'dark_oak_log');
        for (let b = 0; b < 3; b++) {
          const a = r.range(0, Math.PI * 2);
          this.line(
            x,
            y + h - 1,
            z,
            Math.round(x + Math.cos(a) * 2),
            y + h + 1,
            Math.round(z + Math.sin(a) * 2),
            'dark_oak_log',
          );
        }
        break;
      }
      case 'charred': {
        const h = 4 + r.int(0, 4);
        trunk(h, 'charred_log');
        for (let b = 0; b < 2; b++) {
          const a = r.range(0, Math.PI * 2);
          this.line(
            x,
            y + h - 2,
            z,
            Math.round(x + Math.cos(a) * 2),
            y + h,
            Math.round(z + Math.sin(a) * 2),
            'charred_log',
          );
        }
        break;
      }
      default:
        break;
    }
  }

  /** Is (x, surface) ok for placing a tree/plant: top block matches `on` list. */
  topIs(x, z, on) {
    const y = this.surface(x, z);
    if (y < 0) return -1;
    const id = this.get(x, y, z);
    return on.includes(id) && !this.get(x, y + 1, z) ? y : -1;
  }

  /** Scatter trees. density per block (e.g. 0.01). mask(x,z) optional to allow. */
  forest({
    x0 = 0,
    z0 = 0,
    x1 = this.w.sx - 1,
    z1 = this.w.sz - 1,
    density = 0.01,
    types = [['oak', 1]],
    on = ['grass'],
    mask = null,
    minSpacing = 3,
    size = [0.9, 1.2],
  }) {
    const onIds = on.map((b) => this.id(b));
    const placed = [];
    const count = Math.floor((x1 - x0) * (z1 - z0) * density);
    for (let i = 0; i < count; i++) {
      const x = this.rng.int(x0 + 2, x1 - 2),
        z = this.rng.int(z0 + 2, z1 - 2);
      if (mask && !mask(x, z)) continue;
      if (this.isProtected(x, z, 3)) continue;
      if (placed.some(([px, pz]) => Math.abs(px - x) < minSpacing && Math.abs(pz - z) < minSpacing))
        continue;
      const y = this.topIs(x, z, onIds);
      if (y < 0) continue;
      const type = this.rng.weighted(types);
      if (type === 'oak' || type === 'birch' || type === 'bigoak') this.set(x, y, z, 'dirt');
      this.tree(x, y + 1, z, type, this.rng.range(size[0], size[1]));
      placed.push([x, z]);
    }
    return placed;
  }

  /** Scatter plants on top surfaces. list = [[block, weight], ...] */
  plants({
    x0 = 0,
    z0 = 0,
    x1 = this.w.sx - 1,
    z1 = this.w.sz - 1,
    density = 0.2,
    list = [['tall_grass', 1]],
    on = ['grass'],
    mask = null,
  }) {
    const onIds = on.map((b) => this.id(b));
    const ids = list.map(([b, w]) => [this.id(b), w]);
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) {
        if (this.rng.next() > density) continue;
        if (mask && !mask(x, z)) continue;
        if (this.isProtected(x, z)) continue;
        const y = this.topIs(x, z, onIds);
        if (y < 0) continue;
        this.w.setRaw(x, y + 1, z, this.rng.weighted(ids));
      }
  }

  /** Snow layers on exposed tops. */
  snowCover({ chance = 1, on = null } = {}) {
    const { sx, sz } = this.w;
    for (let z = 0; z < sz; z++)
      for (let x = 0; x < sx; x++) {
        if (this.rng.next() > chance) continue;
        const y = this.w.heightAt(x, z);
        if (y < 0) continue;
        const id = this.get(x, y, z);
        if (T_LIQUID[id] || !T_OPAQUE[id]) continue;
        if (on && !on.includes(id)) continue;
        if (!this.get(x, y + 1, z)) this.w.setRaw(x, y + 1, z, B.snow_layer);
      }
  }

  /** Boulders / rocks scattered on the surface. */
  boulders({
    count = 20,
    blocks = [
      ['cobblestone', 2],
      ['mossy_cobblestone', 1],
      ['stone', 2],
    ],
    r = [1, 2.2],
    mask = null,
  } = {}) {
    for (let i = 0; i < count; i++) {
      const x = this.rng.int(4, this.w.sx - 5),
        z = this.rng.int(4, this.w.sz - 5);
      if (mask && !mask(x, z)) continue;
      if (this.isProtected(x, z, 2)) continue;
      const y = this.surface(x, z);
      const rad = this.rng.range(r[0], r[1]);
      const R = Math.ceil(rad);
      for (let dy = -R; dy <= R; dy++)
        for (let dz = -R; dz <= R; dz++)
          for (let dx = -R; dx <= R; dx++)
            if (Math.hypot(dx, dy * 1.3, dz) <= rad + (this.rng.next() - 0.5) * 0.6)
              this.w.setRaw(x + dx, y + dy, z + dz, this.pickMix(blocks));
    }
  }

  /** Invisible barrier walls around the playable area (keeps players inside). */
  boundary(margin = 2, height = null) {
    const { sx, sz, sy } = this.w;
    const top = height ?? sy - 1;
    for (let y = 1; y <= top; y++)
      for (let i = 0; i < Math.max(sx, sz); i++)
        for (let m = 0; m < margin; m++) {
          for (const [x, z] of [
            [i, m],
            [i, sz - 1 - m],
            [m, i],
            [sx - 1 - m, i],
          ]) {
            if (x < 0 || z < 0 || x >= sx || z >= sz) continue;
            if (!this.get(x, y, z)) this.w.setRaw(x, y, z, B.barrier);
          }
        }
  }

  /** Recompute stored heightmap from world contents (after edits). */
  syncHeight() {
    const { sx, sz } = this.w;
    for (let z = 0; z < sz; z++)
      for (let x = 0; x < sx; x++) this.height[x + z * sx] = Math.max(0, this.w.heightAt(x, z));
  }
}

export { B };
export const isSolidId = (id) => T_SOLID[id] === 1;
