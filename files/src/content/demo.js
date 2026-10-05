import { World } from '../game/world/World.js';
import { Gen } from '../game/world/Gen.js';
export const DEMO = {
  id: 'meadow-v1',
  seed: 14382,
  size: [96, 48, 96],
  spawn: [40.5, 13.05, 29.5],
  checkpoint: [40.5, 13, 38.5],
  exit: [40.5, 13, 78.5],
  enemy: [40.5, 13, 68.5],
  crystals: [
    [45.5, 14, 33.5],
    [40.5, 14, 57.5],
    [53.5, 16, 68.5],
  ],
};
export function createDemo() {
  const w = new World(...DEMO.size),
    g = new Gen(w, DEMO.seed);
  g.heightmap(
    (x, z, n) =>
      12 + n.fbm2(x * 0.03, z * 0.03, 3) * 5 + Math.max(0, Math.hypot(x - 42, z - 49) - 30) * 0.17,
  );
  g.columns(() => ({ top: 'grass', under: 'dirt' }));
  g.flatten(26, 22, 59, 82, 12, { blend: 3 });
  g.protect(25, 20, 60, 84);
  g.forest({
    density: 0.018,
    types: [
      ['oak', 3],
      ['birch', 1],
    ],
    minSpacing: 4,
    size: [0.85, 1.2],
  });
  // A shallow river, a bridge, and a short optional jumping route.
  g.fill(7, 9, 47, 88, 18, 53, 'air');
  g.fill(7, 8, 47, 88, 8, 53, 'sand');
  g.fill(7, 9, 47, 88, 10, 53, 'water');
  g.fill(37, 12, 45, 43, 12, 55, 'oak_planks');
  for (let z = 45; z <= 55; z++) {
    g.set(37, 13, z, 'oak_fence');
    g.set(43, 13, z, 'oak_fence');
  }
  for (const [x, y, z] of [
    [48, 13, 63],
    [51, 14, 65],
    [53, 14, 68],
  ])
    g.fill(x, y, z, x + 1, y, z + 1, 'mossy_stone_bricks');
  for (const [x, _y, z] of [DEMO.checkpoint, DEMO.exit]) {
    g.fill(
      Math.floor(x) - 2,
      12,
      Math.floor(z) - 2,
      Math.floor(x) + 2,
      12,
      Math.floor(z) + 2,
      'stone_bricks',
    );
    g.set(x - 2, 13, z, 'lantern');
  }
  g.boundary(1);
  w.computeLighting();
  return w;
}
