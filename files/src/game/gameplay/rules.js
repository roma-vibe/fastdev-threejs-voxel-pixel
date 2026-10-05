import { DEMO } from '../../content/demo.js';
export function canHit(attacker, target, range = 2.8) {
  if (!target.alive || Math.abs(attacker.pos.y - target.pos.y) > 2) return false;
  const dx = target.pos.x - attacker.pos.x,
    dz = target.pos.z - attacker.pos.z,
    d = Math.hypot(dx, dz);
  return (
    d <= range &&
    (d < 0.01 || (dx * Math.sin(attacker.yaw) + dz * Math.cos(attacker.yaw)) / d > 0.15)
  );
}
export function editableCell(x, y, z) {
  if (
    x < 2 ||
    x >= DEMO.size[0] - 2 ||
    z < 2 ||
    z >= DEMO.size[2] - 2 ||
    y < 2 ||
    y >= DEMO.size[1] - 2
  )
    return false;
  return ![DEMO.spawn, DEMO.checkpoint, DEMO.exit, ...DEMO.crystals].some(
    (p) => Math.abs(x - p[0]) < 2.5 && Math.abs(z - p[2]) < 2.5 && Math.abs(y - p[1]) < 3,
  );
}
export function intersectsPlayer(x, y, z, p) {
  return (
    x < p.pos.x + p.radius &&
    x + 1 > p.pos.x - p.radius &&
    z < p.pos.z + p.radius &&
    z + 1 > p.pos.z - p.radius &&
    y < p.pos.y + p.height &&
    y + 1 > p.pos.y
  );
}
