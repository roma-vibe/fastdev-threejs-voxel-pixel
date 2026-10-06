import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { Hud } from '../src/game/hud/Hud.js';
import { HudState } from '../src/game/hud/HudState.js';
import { Particles } from '../src/game/render/Particles.js';
import { Animator, lerpPose } from '../src/game/actors/Animator.js';
import { Renderer } from '../src/game/render/Renderer.js';
import { Mesher } from '../src/game/world/Mesher.js';
import { World } from '../src/game/world/World.js';
import { BLOCK, BLOCKS } from '../src/game/world/Blocks.js';
import { createDemo } from '../src/content/demo.js';

function hudFixture() {
  const game = {
    player: { hp: 20, maxHp: 20 },
    progress: { collected: [] },
    enemy: { alive: true },
    mode: 'combat',
    input: { usingPad: false },
    message: '',
    interactionHint: () => 'Explore',
  };
  const text = () => ({ text: '', position: { set() {} }, anchor: { set() {} } });
  const shapes = new Proxy({}, { get: (target, name) => (target[name] ||= vi.fn(() => shapes)) });
  const hud = new Hud();
  Object.assign(hud, {
    state: new HudState(),
    app: { screen: { width: 1024, height: 768 }, render: vi.fn() },
    shapes,
    status: text(),
    health: text(),
    hint: text(),
    mode: text(),
    labels: [text(), text(), text()],
  });
  return { game, hud };
}

describe('render work', () => {
  it('keeps an unchanged HUD canvas and redraws every visible state change', () => {
    const { game, hud } = hudFixture();
    for (let i = 0; i < 120; i++) hud.update(game);
    expect(hud.app.render).toHaveBeenCalledTimes(1);
    const changes = [
      () => game.player.hp--,
      () => game.player.maxHp++,
      () => game.progress.collected.push(0),
      () => (game.enemy.alive = false),
      () => (game.mode = 'build'),
      () => (game.input.usingPad = true),
      () => (game.message = 'Collected'),
      () => (hud.app.screen.width = 700),
      () => (hud.app.screen.height = 500),
      () => hud.state.invalidate(),
    ];
    changes.forEach((change, i) => {
      change();
      hud.update(game);
      hud.update(game);
      expect(hud.app.render).toHaveBeenCalledTimes(i + 2);
    });
    expect(hud.hint.text).toBe('Collected');
    expect(hud.mode.visible).toBe(false);
  });
  it('skips empty particle uploads and limits live uploads to the surviving prefix', () => {
    const particles = new Particles(new THREE.Scene()),
      pool = particles.normal;
    const attrs = Object.values(pool.geo.attributes);
    particles.update(1 / 60);
    expect(pool.points.visible).toBe(false);
    expect(pool.geo.drawRange.count).toBe(0);
    expect(attrs.map((a) => a.version)).toEqual([0, 0, 0, 0]);
    const spawn = (life) =>
      pool.spawn({ x: 0, y: 2, z: 0, vx: 2, vy: 0, vz: 0, c: [1, 0.5, 0.2], size: 1, life });
    spawn(0.05);
    spawn(2);
    particles.update(0.1);
    expect(pool.n).toBe(1);
    expect(pool.pos[0]).toBeCloseTo(0.2);
    expect(pool.points.visible).toBe(true);
    for (const a of attrs) expect(a.updateRanges).toEqual([{ start: 0, count: a.itemSize }]);
    particles.update(0.1);
    for (const a of attrs) expect(a.updateRanges).toHaveLength(1);
    particles.clear();
    expect(pool.points.visible).toBe(false);
    const versions = attrs.map((a) => a.version);
    particles.update(1);
    expect(attrs.map((a) => a.version)).toEqual(versions);
    spawn(0.01);
    particles.update(1);
    expect(pool.geo.drawRange.count).toBe(0);
    expect(pool.points.visible).toBe(false);
    spawn(2);
    particles.update(0.1);
    expect(pool.points.visible).toBe(true);
    expect(pool.geo.drawRange.count).toBe(1);
    particles.dispose();
  });
  it('retains the separate output path during chromatic aberration and resumes fusion afterwards', () => {
    const renderer = {
      grade: { uniforms: { uChroma: { value: 0 } } },
      output: {},
      outputGrade: {},
      composer: { render: vi.fn() },
    };
    Renderer.prototype.render.call(renderer);
    expect(renderer.outputGrade.enabled).toBe(true);
    renderer.grade.uniforms.uChroma.value = 0.01;
    Renderer.prototype.render.call(renderer);
    expect(renderer.output.enabled && renderer.grade.enabled).toBe(true);
    expect(renderer.outputGrade.enabled).toBe(false);
    renderer.grade.uniforms.uChroma.value = 0;
    Renderer.prototype.render.call(renderer);
    expect(renderer.output.enabled || renderer.grade.enabled).toBe(false);
  });
});

describe('animation storage', () => {
  it('interpolates sparse keys without changing clips or retaining old channels', () => {
    const a = { head: [1, 2, 3], rootY: 4 },
      b = { armR: [2, 4, 6] };
    const snapshot = structuredClone([a, b]);
    const out = lerpPose(a, b, 0.5);
    const head = out.head;
    expect(out).toEqual({ head: [0.5, 1, 1.5], rootY: 2, armR: [1, 2, 3] });
    lerpPose({ head: [2, 0, 0] }, {}, 0.5, out);
    expect(out).toEqual({ head: [1, 0, 0] });
    expect(out.head).toBe(head);
    expect([a, b]).toEqual(snapshot);
  });
  it('clears a finished action from reused locomotion storage', () => {
    const bones = Object.fromEntries(
      ['root', 'head', 'chest', 'armR', 'legR'].map((name) => [name, new THREE.Object3D()]),
    );
    bones.root.userData.rest = new THREE.Vector3();
    const animator = new Animator({ bones, scale: 1 });
    animator.t = 0;
    const clip = {
      dur: 0.1,
      keys: [
        [0, { rootX: 7, armR: [1, 0, 0] }],
        [0.1, {}],
      ],
    };
    animator.play(clip, { fadeIn: 0, fadeOut: 0.01 });
    for (let i = 0; i < 60; i++) animator.update(1 / 60);
    expect(animator.actions).toHaveLength(0);
    expect(bones.root.position.x).toBe(0);
    expect(clip.keys[0][1].armR).toEqual([1, 0, 0]);
    const pose = animator.pose;
    animator.update(1 / 60);
    expect(animator.pose).toBe(pose);
    const captured = structuredClone(animator.pose);
    animator.setOverride(animator.pose);
    animator.localVel = null;
    animator.update(1 / 60);
    expect(animator.override).toEqual(captured);
  });
});

// Expand only axis-aligned cube faces to unit faces. This checks actual coverage,
// winding, atlas regions and all corner lighting against the unmerged reference.
function unitFaces(mesh) {
  const out = new Map();
  if (!mesh) return out;
  for (let first = 0; first < mesh.position.length / 3; first += 4) {
    const corners = Array.from({ length: 4 }, (_, k) => [
      ...mesh.position.slice((first + k) * 3, (first + k + 1) * 3),
    ]);
    const normal = [...mesh.normal.slice(first * 3, first * 3 + 3)];
    const axis = normal.findIndex((n) => n !== 0),
      axes = [0, 1, 2].filter((n) => n !== axis);
    const min = [0, 1, 2].map((d) => Math.min(...corners.map((p) => p[d])));
    const max = [0, 1, 2].map((d) => Math.max(...corners.map((p) => p[d])));
    const tile = [...mesh.aTile.slice(first * 4, first * 4 + 4)];
    const merged = tile[2] > 0;
    const uv = merged
      ? [tile[0], tile[1], tile[0] + tile[2], tile[1] + tile[3]]
      : [
          Math.min(...[0, 1, 2, 3].map((k) => mesh.uv[(first + k) * 2])),
          Math.min(...[0, 1, 2, 3].map((k) => mesh.uv[(first + k) * 2 + 1])),
          Math.max(...[0, 1, 2, 3].map((k) => mesh.uv[(first + k) * 2])),
          Math.max(...[0, 1, 2, 3].map((k) => mesh.uv[(first + k) * 2 + 1])),
        ];
    const light = [
      ...mesh.aLight.slice(first * 4, (first + 4) * 4),
      ...mesh.aTorch.slice(first * 4, (first + 4) * 4),
    ];
    const edge1 = new THREE.Vector3(...corners[1]).sub(new THREE.Vector3(...corners[0]));
    const edge2 = new THREE.Vector3(...corners[2]).sub(new THREE.Vector3(...corners[0]));
    expect(edge1.cross(edge2).dot(new THREE.Vector3(...normal))).toBeGreaterThan(0);
    for (let a = min[axes[0]]; a < max[axes[0]]; a++)
      for (let b = min[axes[1]]; b < max[axes[1]]; b++) {
        const key = `${normal}:${min[axis]}:${a}:${b}`;
        expect(out.has(key)).toBe(false);
        out.set(key, { uv: uv.map((v) => +v.toFixed(6)), light });
      }
  }
  return out;
}
const atlas = {
  uv: Object.fromEntries(
    [...new Set(BLOCKS.flatMap((b) => Object.values(b.tex)).filter(Boolean))].map((name, i) => [
      name,
      [i / 256, 0, (i + 1) / 256, 1 / 256],
    ]),
  ),
};

describe('compatible face merging', () => {
  it('reduces a flat floor while preserving unit textures, coverage and corner lighting', () => {
    const world = new World(32, 32, 32);
    for (let x = 2; x < 20; x++) for (let z = 2; z < 20; z++) world.setRaw(x, 2, z, BLOCK.stone);
    world.computeLighting();
    const ref = new Mesher(world, atlas, { mergeFaces: false }).build(0, 0, 0).opaque;
    const merged = new Mesher(world, atlas).build(0, 0, 0).opaque;
    expect(merged.index.length).toBeLessThan(ref.index.length / 2);
    expect(unitFaces(merged)).toEqual(unitFaces(ref));
  });
  it('preserves demo lighting, material boundaries and animated buckets across every section', () => {
    const world = createDemo();
    const ref = new Mesher(world, atlas, { mergeFaces: false }),
      merged = new Mesher(world, atlas);
    for (let y = 0; y < world.nsy; y++)
      for (let z = 0; z < world.nsz; z++)
        for (let x = 0; x < world.nsx; x++) {
          const a = ref.build(x, y, z),
            b = merged.build(x, y, z);
          expect(unitFaces(b.opaque)).toEqual(unitFaces(a.opaque));
          for (const bucket of ['cutout', 'translucent', 'water', 'lava'])
            expect(b[bucket]).toEqual(a[bucket]);
        }
    world.set(32, 14, 31, BLOCK.jack_o_lantern);
    world.flushRelight();
    for (const x of [0, 1]) {
      expect(unitFaces(merged.build(x, 0, 0).opaque)).toEqual(unitFaces(ref.build(x, 0, 0).opaque));
    }
  });
});
