// tools/verify-map.mjs
// Not shipped gameplay code. A real, automated check that the flagship map's
// hand-authored geometry is actually navigable, since nobody has visually
// playtested it yet. Run with: node tools/verify-map.mjs
//
// Method: builds the same solids the game uses (shared/collision.js), then
// does a grid flood-fill from the attacker spawn using groundHeightAt() at
// every cell so it naturally climbs stairs (small height deltas) and
// refuses to cross walls/ledges (large height deltas) -- the same rule the
// player's own movement uses for step-up behaviour.

import { MAPS } from '../shared/data.js';
import { buildSolidsFromBlocks, groundHeightAt, collidesAt } from '../shared/collision.js';

const map = MAPS.find(m => m.flagship);
if (!map) { console.error('No flagship map found.'); process.exit(1); }

const solids = buildSolidsFromBlocks(map.blocks);
const STEP = 0.55;
const RES = 0.5;
const BOUND = 23; // stay inside the outer walls

function cellKey(x, z) { return `${Math.round(x / RES)},${Math.round(z / RES)}`; }

function groundOpen(x, z) {
  const g = groundHeightAt(x, z, solids, 0);
  // A cell only counts as ground if you could actually stand there without
  // your head hitting something (rules out being "on top of" a wall segment
  // whose top happens to be walkable-height but is really a roof).
  return !collidesAt(x, z, g + 0.05, g + 1.6, solids, { margin: 0.05, stepHeight: STEP }) ? g : null;
}

const start = map.spawns.attack[0];
const startG = groundOpen(start.x, start.z);
if (startG === null) { console.error('FAIL: attacker spawn point is itself inside geometry.'); process.exit(1); }

const visited = new Map();
const queue = [[start.x, start.z, startG]];
visited.set(cellKey(start.x, start.z), startG);
const dirs = [[RES, 0], [-RES, 0], [0, RES], [0, -RES], [RES, RES], [RES, -RES], [-RES, RES], [-RES, -RES]];

while (queue.length) {
  const [x, z, g] = queue.shift();
  for (const [dx, dz] of dirs) {
    const nx = x + dx, nz = z + dz;
    if (Math.abs(nx) > BOUND || Math.abs(nz) > BOUND) continue;
    const key = cellKey(nx, nz);
    if (visited.has(key)) continue;
    const ng = groundOpen(nx, nz);
    if (ng === null) continue;
    if (Math.abs(ng - g) > STEP) continue; // too tall a step / a wall
    visited.set(key, ng);
    queue.push([nx, nz, ng]);
  }
}

function nearestVisitedDist(px, pz) {
  let best = Infinity;
  for (const key of visited.keys()) {
    const [gx, gz] = key.split(',').map(Number);
    const x = gx * RES, z = gz * RES;
    const d = Math.hypot(x - px, z - pz);
    if (d < best) best = d;
  }
  return best;
}

const checks = [
  ['defender spawn', map.spawns.defend[0]],
  ...map.sites.map(s => [`Site ${s.id}`, s]),
];

console.log(`Flagship map: ${map.name}`);
console.log(`Reachable cells from attacker spawn: ${visited.size} (grid res ${RES}m)`);
let allPass = true;
for (const [label, pt] of checks) {
  const d = nearestVisitedDist(pt.x, pt.z);
  const pass = d <= 1.0; // within ~1 cell of a reachable point
  if (!pass) allPass = false;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label} at (${pt.x}, ${pt.z}) -- nearest reachable cell ${d.toFixed(2)}m away`);
}

// Also confirm no spawn point spawns a player inside a wall.
for (const side of ['attack', 'defend']) {
  for (const p of map.spawns[side]) {
    const g = groundOpen(p.x, p.z);
    const ok = g !== null;
    if (!ok) allPass = false;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${side} spawn (${p.x}, ${p.z}) is${ok ? '' : ' NOT'} open ground`);
  }
}

console.log(allPass ? '\nALL CHECKS PASSED' : '\nSOME CHECKS FAILED');
process.exit(allPass ? 0 : 1);
