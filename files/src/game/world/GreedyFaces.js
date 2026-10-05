import { SECTION } from './World.js';

const AREA = SECTION * SECTION;
const VOLUME = AREA * SECTION;

/** Reusable face masks. Only faces with constant, identical vertex lighting enter here. */
export class GreedyFaces {
  constructor() {
    this.tiles = new Uint16Array(6 * VOLUME);
    this.light = new Uint8Array(6 * VOLUME * 5);
  }
  reset() {
    this.tiles.fill(0);
  }
  record(face, x, y, z, tile, light) {
    const axis = face >> 1;
    const plane = axis === 0 ? x : axis === 1 ? y : z;
    const a = axis === 0 ? y : x;
    const b = axis === 2 ? y : z;
    const i = face * VOLUME + plane * AREA + b * SECTION + a;
    this.tiles[i] = tile;
    for (let k = 0; k < 5; k++) this.light[i * 5 + k] = light[k];
  }
  same(i, tile, lightIndex) {
    if (this.tiles[i] !== tile) return false;
    for (let k = 0; k < 5; k++)
      if (this.light[i * 5 + k] !== this.light[lightIndex + k]) return false;
    return true;
  }
  emit(quad) {
    for (let face = 0; face < 6; face++)
      for (let plane = 0; plane < SECTION; plane++) {
        const base = face * VOLUME + plane * AREA;
        for (let b = 0; b < SECTION; b++)
          for (let a = 0; a < SECTION; a++) {
            const i = base + b * SECTION + a,
              tile = this.tiles[i];
            if (!tile) continue;
            let width = 1,
              height = 1;
            while (a + width < SECTION && this.same(i + width, tile, i * 5)) width++;
            rows: while (b + height < SECTION) {
              for (let dx = 0; dx < width; dx++)
                if (!this.same(i + height * SECTION + dx, tile, i * 5)) break rows;
              height++;
            }
            quad(face, plane, a, b, width, height, tile, this.light, i * 5);
            for (let dy = 0; dy < height; dy++)
              this.tiles.fill(0, i + dy * SECTION, i + dy * SECTION + width);
          }
      }
  }
}
