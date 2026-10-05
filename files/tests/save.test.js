import { describe, it, expect } from 'vitest';
import { SaveSystem, freshSave, normalizeSave } from '../src/game/core/SaveSystem.js';
import { normalizeSettings } from '../src/game/core/Settings.js';
function memory() {
  const data = new Map();
  return {
    getItem: (k) => data.get(k) || null,
    setItem: (k, v) => data.set(k, v),
    removeItem: (k) => data.delete(k),
  };
}
describe('local saves', () => {
  it('isolates projects and persists checkpoint, objectives and world edits', () => {
    const storage = memory(),
      a = new SaveSystem('alpha', storage),
      b = new SaveSystem('beta', storage),
      save = freshSave();
    save.collected = [0, 2];
    save.edits = [[65, 13, 65, 0]];
    save.enemyDefeated = true;
    expect(a.write(save)).toBe(true);
    expect(a.load()).toEqual(save);
    expect(b.load()).toBeNull();
    a.clear();
    expect(a.load()).toBeNull();
  });
  it('rejects incompatible and corrupt saves and sanitizes user data', () => {
    expect(normalizeSave({ version: 999 })).toBeNull();
    const s = normalizeSave({
      ...freshSave(),
      checkpoint: [Infinity, -1, 999],
      collected: [0, 0, 9, '2'],
      edits: [
        [1, 2, 3, 999],
        [2, 2, 2, 0],
        [-1, 2, 2, 0],
      ],
    });
    expect(s.checkpoint).toEqual(freshSave().checkpoint);
    expect(s.collected).toEqual([0]);
    expect(s.edits).toEqual([[2, 2, 2, 0]]);
    const storage = memory();
    storage.setItem('voxel.alpha.save.v1', 'broken JSON');
    expect(new SaveSystem('alpha', storage).load()).toBeNull();
  });
  it('handles blocked browser storage', () => {
    const s = new SaveSystem('private', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      },
    });
    expect(s.load()).toBeNull();
    expect(s.write(freshSave())).toBe(false);
  });
  it('survives browser storage that throws on access', () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError');
      },
    });
    try {
      const s = new SaveSystem('blocked');
      expect(s.load()).toBeNull();
      expect(s.write(freshSave())).toBe(false);
    } finally {
      if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
      else delete globalThis.localStorage;
    }
  });
  it('clamps settings from saved input', () => {
    expect(
      normalizeSettings({ volume: 99, fov: -2, quality: 'unknown', sensitivity: 'bad' }),
    ).toMatchObject({ volume: 1, fov: 50, quality: 'high', sensitivity: 1 });
    expect(normalizeSettings(null).invertY).toBe(false);
  });
});
