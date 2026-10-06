import { describe, it, expect } from 'vitest';
import { World } from '../src/game/world/World.js';
import { BLOCK } from '../src/game/world/Blocks.js';
import { Mesher } from '../src/game/world/Mesher.js';
import { Entity } from '../src/game/gameplay/Entity.js';
import { createDemo, DEMO } from '../src/content/demo.js';
import { editableCell, intersectsPlayer, canHit } from '../src/game/gameplay/rules.js';
import * as THREE from 'three';
describe('voxel engine', () => {
  it('raycasts the block face and keeps edits dirty across section boundaries', () => {
    const w = new World(64, 32, 32);
    w.set(32, 3, 4, BLOCK.stone);
    const r = w.raycast(30, 3.5, 4.5, 1, 0, 0, 6);
    expect(r).toMatchObject({ hit: true, x: 32, y: 3, z: 4, nx: -1 });
    expect(r.t).toBeCloseTo(2);
    expect(w.dirty.size).toBe(2);
  });
  it('removes hidden cube faces', () => {
    const w = new World(32, 32, 32);
    w.setRaw(4, 4, 4, BLOCK.stone);
    w.setRaw(5, 4, 4, BLOCK.stone);
    w.computeLighting();
    const m = new Mesher(w, { uv: { stone: [0, 0, 1, 1] } }, { mergeFaces: false });
    const mesh = m.build(0, 0, 0).opaque;
    expect(mesh.index.length).toBe(60);
  });
  it('lights emissive blocks and removes their light after mining', () => {
    const w = new World(16, 16, 16);
    w.skyEnabled = false;
    w.setRaw(8, 5, 8, BLOCK.jack_o_lantern);
    w.computeLighting();
    expect(w.blockLight(9, 5, 8)).toBeGreaterThan(0);
    w.set(8, 5, 8, BLOCK.air);
    w.flushRelight();
    expect(w.blockLight(9, 5, 8)).toBe(0);
  });
  it('remeshes every section whose lighting changes after an edit', () => {
    const w = new World(64, 48, 64);
    w.computeLighting();
    w.dirty.clear();
    w.set(30, 14, 20, BLOCK.stone);
    w.flushRelight();
    // The relit columns (x 15–45, z 5–35) overlap all 2 × 2 sections, at every height.
    expect(w.dirty.size).toBe(w.nsx * w.nsz * w.nsy);
  });
  it('sees other entities only through clear air', () => {
    const w = new World(12, 12, 12);
    const game = { world: w, time: 0 };
    const a = new Entity(game, { pos: new THREE.Vector3(2.5, 1, 5.5) }),
      b = new Entity(game, { pos: new THREE.Vector3(5.5, 1, 5.5) });
    expect(a.canSee(b)).toBe(true);
    for (let y = 1; y < 4; y++) w.setRaw(4, y, 5, BLOCK.stone);
    expect(a.canSee(b)).toBe(false);
    expect(b.canSee(a)).toBe(false);
  });
  it('lands on a solid floor and cannot move through a wall', () => {
    const w = new World(12, 12, 12);
    for (let x = 0; x < 12; x++) for (let z = 0; z < 12; z++) w.setRaw(x, 0, z, BLOCK.stone);
    for (let y = 1; y < 5; y++) w.setRaw(5, y, 5, BLOCK.stone);
    const e = new Entity({ world: w, time: 0 }, { pos: new THREE.Vector3(4.5, 5, 5.5) });
    for (let n = 0; n < 120; n++) e.integrate(1 / 60);
    expect(e.grounded).toBe(true);
    expect(e.pos.y).toBeCloseTo(1, 3);
    e.moveAxis(0, 2);
    expect(e.pos.x).toBeLessThanOrEqual(4.7);
  });
});
describe('playable demo', () => {
  it('is deterministic, with a safe spawn, bridge and reachable crystal route', () => {
    const a = createDemo(),
      b = createDemo();
    expect(a.blocks).toEqual(b.blocks);
    expect(a.isSolid(40, 12, 29)).toBe(true);
    expect(a.isSolid(40, 13, 29)).toBe(false);
    expect(a.get(40, 12, 50)).toBe(BLOCK.oak_planks);
    expect(a.get(20, 10, 50)).toBe(BLOCK.water);
    expect(a.get(53, 14, 68)).toBe(BLOCK.mossy_stone_bricks);
    expect(a.get(38, 12, 78)).toBe(BLOCK.stone_bricks);
    expect(DEMO.crystals.length).toBe(3);
  });
  it('protects objectives and prevents building inside the player', () => {
    expect(editableCell(40, 12, 29)).toBe(false);
    expect(editableCell(2, 0, 2)).toBe(false);
    expect(editableCell(65, 13, 65)).toBe(true);
    const p = { pos: { x: 65.5, y: 13, z: 65.5 }, radius: 0.3, height: 1.8 };
    expect(intersectsPlayer(65, 13, 65, p)).toBe(true);
    expect(intersectsPlayer(66, 13, 65, p)).toBe(false);
  });
  it('limits melee to living targets in front and within reach', () => {
    const a = { pos: { x: 0, y: 1, z: 0 }, yaw: 0 },
      t = { pos: { x: 0, y: 1, z: 2 }, alive: true };
    expect(canHit(a, t)).toBe(true);
    expect(canHit({ ...a, yaw: Math.PI }, t)).toBe(false);
    expect(canHit(a, { ...t, alive: false })).toBe(false);
    expect(canHit(a, { ...t, pos: { x: 0, y: 1, z: 6 } })).toBe(false);
  });
});
