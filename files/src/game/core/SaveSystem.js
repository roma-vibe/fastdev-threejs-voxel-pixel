import { BLOCKS } from '../world/Blocks.js';
import { DEMO } from '../../content/demo.js';
export const SAVE_VERSION = 1;
const finitePoint = (p) =>
  Array.isArray(p) &&
  p.length === 3 &&
  p.every((n, i) => Number.isFinite(n) && n >= 0 && n < DEMO.size[i]);
export function normalizeSave(raw) {
  if (!raw || raw.version !== SAVE_VERSION || raw.level !== DEMO.id) return null;
  const edits = Array.isArray(raw.edits)
    ? raw.edits
        .filter(
          (e) =>
            Array.isArray(e) &&
            e.length === 4 &&
            e.every(Number.isInteger) &&
            e.slice(0, 3).every((n, i) => n >= 0 && n < DEMO.size[i]) &&
            e[3] >= 0 &&
            e[3] < BLOCKS.length,
        )
        .slice(-2048)
    : [];
  return {
    version: SAVE_VERSION,
    level: DEMO.id,
    checkpoint: finitePoint(raw.checkpoint) ? raw.checkpoint : [...DEMO.spawn],
    collected: [
      ...new Set(
        (Array.isArray(raw.collected) ? raw.collected : []).filter(
          (n) => Number.isInteger(n) && n >= 0 && n < DEMO.crystals.length,
        ),
      ),
    ],
    enemyDefeated: raw.enemyDefeated === true,
    completed: raw.completed === true,
    edits,
  };
}
export function freshSave() {
  return normalizeSave({ version: SAVE_VERSION, level: DEMO.id });
}
export class SaveSystem {
  /** `storage` defaults to localStorage, looked up on use: reading it throws when site data is blocked. */
  constructor(slug, storage) {
    this.customStorage = storage;
    this.key = `voxel.${slug}.save.v1`;
  }
  get storage() {
    return this.customStorage ?? globalThis.localStorage;
  }
  load() {
    try {
      return normalizeSave(JSON.parse(this.storage.getItem(this.key)));
    } catch {
      return null;
    }
  }
  write(data) {
    try {
      this.storage.setItem(this.key, JSON.stringify(normalizeSave(data)));
      return true;
    } catch {
      return false;
    }
  }
  clear() {
    try {
      this.storage.removeItem(this.key);
      return true;
    } catch {
      return false;
    }
  }
}
