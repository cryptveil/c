// shared/collision.js
// Pure collision math, no THREE.js dependency, so it can run in the browser,
// on the server (for sanity-checking reported positions), and in the Node
// map-verification script under tools/.
//
// Fixes a real bug in prototype v0.1: collision only ever checked x/z against
// every solid, ignoring the stored ymin/ymax entirely. That made it
// impossible to stand on top of a crate or walk underneath a raised catwalk
// -- every solid behaved like a floor-to-ceiling wall regardless of height.

export function buildSolidsFromBlocks(blocks) {
  return blocks.map(b => ({
    x: b.x, z: b.z,
    hx: b.sx / 2, hz: b.sz / 2,
    ymin: b.y - b.sy / 2, ymax: b.y + b.sy / 2,
    id: b.id || null, type: b.type || 'solid',
  }));
}

// True if a player occupying [feetY, headY] at (x,z) would be blocked by any
// solid, allowing for stepping up onto low objects and ducking under tall ones.
export function collidesAt(x, z, feetY, headY, solids, opts = {}) {
  const margin = opts.margin ?? 0.32;
  const stepHeight = opts.stepHeight ?? 0.55;
  for (const s of solids) {
    if (x > s.x - s.hx - margin && x < s.x + s.hx + margin &&
        z > s.z - s.hz - margin && z < s.z + s.hz + margin) {
      if (feetY >= s.ymax - stepHeight) continue; // standing on top of it
      if (headY <= s.ymin + 0.05) continue;        // ducking fully underneath it
      return true;
    }
  }
  return false;
}

// Highest solid surface directly beneath (x,z), i.e. what the player's feet
// should rest on. Used every frame to let players walk up onto props.
export function groundHeightAt(x, z, solids, fallbackY = 0) {
  const eps = 0.05; // treat exactly-touching pieces (e.g. adjoining stairs) as overlapping, not seamed
  let top = fallbackY;
  for (const s of solids) {
    if (x > s.x - s.hx - eps && x < s.x + s.hx + eps && z > s.z - s.hz - eps && z < s.z + s.hz + eps) {
      if (s.ymax > top) top = s.ymax;
    }
  }
  return top;
}
