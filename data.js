// shared/data.js
// Gameplay data shared by client and server: map geometry/sites/spawns and
// character/ability definitions. Kept as plain data (no THREE.js, no DOM)
// so the server can validate against it and the map-verification script in
// tools/ can test it, without either needing a browser.

// ---------------------------------------------------------------------------
// MAPS
// ---------------------------------------------------------------------------
// "triad-keep" is the one flagship map: hand-authored geometry (not the
// random-scatter generator the other 12 use), three sites, real elevation
// via a stepped-up mid platform, and lane-separating walls so flanks matter.
// It is the ONLY map wired into the online matchmaking server right now.
// The other 12 are the original procedural prototype arenas -- honest
// placeholders for bot practice, not yet hand-built or server-validated.

const triadKeepBlocks = [
  { id: 'floor', x: 0, y: -0.35, z: 0, sx: 48, sy: 0.7, sz: 48, type: 'floor' },
  { id: 'wallN', x: 0, y: 2, z: -24, sx: 48, sy: 4, sz: 1, type: 'wall' },
  { id: 'wallS', x: 0, y: 2, z: 24, sx: 48, sy: 4, sz: 1, type: 'wall' },
  { id: 'wallW', x: -24, y: 2, z: 0, sx: 1, sy: 4, sz: 48, type: 'wall' },
  { id: 'wallE', x: 24, y: 2, z: 0, sx: 1, sy: 4, sz: 48, type: 'wall' },

  // Mid platform (Site C sits on top of this) and the stairway up from spawn.
  { id: 'platform', x: 0, y: 0.6, z: -9, sx: 9, sy: 1.2, sz: 7, type: 'platform' },
  { id: 'step1', x: 0, y: 0.2, z: -1.5, sx: 7, sy: 0.4, sz: 2, type: 'step' },
  { id: 'step2', x: 0, y: 0.4, z: -3.7, sx: 7, sy: 0.8, sz: 2, type: 'step' },
  { id: 'step3', x: 0, y: 0.6, z: -5.9, sx: 7, sy: 1.2, sz: 2, type: 'step' },

  // West stairway off the platform down toward Site A (rotation route).
  { id: 'wstepA', x: -6.5, y: 0.6, z: -9, sx: 2, sy: 1.2, sz: 6, type: 'step' },
  { id: 'wstepB', x: -8.5, y: 0.4, z: -9, sx: 2, sy: 0.8, sz: 6, type: 'step' },
  { id: 'wstepC', x: -10.5, y: 0.2, z: -9, sx: 2, sy: 0.4, sz: 6, type: 'step' },
  // East stairway, mirrored, toward Site B.
  { id: 'estepA', x: 6.5, y: 0.6, z: -9, sx: 2, sy: 1.2, sz: 6, type: 'step' },
  { id: 'estepB', x: 8.5, y: 0.4, z: -9, sx: 2, sy: 0.8, sz: 6, type: 'step' },
  { id: 'estepC', x: 10.5, y: 0.2, z: -9, sx: 2, sy: 0.4, sz: 6, type: 'step' },

  // Site A cover + back-door corridor to defender spawn.
  { id: 'coverA1', x: -17, y: 1.0, z: -11, sx: 2, sy: 2, sz: 1.4, type: 'cover' },
  { id: 'coverA2', x: -13, y: 1.0, z: -7, sx: 2, sy: 2, sz: 1.4, type: 'cover' },
  { id: 'backA_w', x: -17, y: 1.5, z: -15, sx: 1, sy: 3, sz: 8, type: 'wall' },
  { id: 'backA_e', x: -13, y: 1.5, z: -15, sx: 1, sy: 3, sz: 8, type: 'wall' },

  // Site B, mirrored.
  { id: 'coverB1', x: 17, y: 1.0, z: -11, sx: 2, sy: 2, sz: 1.4, type: 'cover' },
  { id: 'coverB2', x: 13, y: 1.0, z: -7, sx: 2, sy: 2, sz: 1.4, type: 'cover' },
  { id: 'backB_w', x: 17, y: 1.5, z: -15, sx: 1, sy: 3, sz: 8, type: 'wall' },
  { id: 'backB_e', x: 13, y: 1.5, z: -15, sx: 1, sy: 3, sz: 8, type: 'wall' },

  // Open field between spawn and the stairs: cover plus lane-splitting walls
  // so the west/mid/east routes actually behave like separate lanes, with
  // gaps left open near the spawn end and the stair end for crossing.
  { id: 'coverMid1', x: -6, y: 0.9, z: 6, sx: 2.2, sy: 1.8, sz: 2.2, type: 'cover' },
  { id: 'coverMid2', x: 6, y: 0.9, z: 6, sx: 2.2, sy: 1.8, sz: 2.2, type: 'cover' },
  { id: 'coverMid3', x: 0, y: 0.9, z: 12, sx: 3, sy: 1.8, sz: 1.6, type: 'cover' },
  { id: 'coverW', x: -16, y: 0.9, z: 2, sx: 2, sy: 1.8, sz: 3, type: 'cover' },
  { id: 'coverE', x: 16, y: 0.9, z: 2, sx: 2, sy: 1.8, sz: 3, type: 'cover' },
  { id: 'laneWallW', x: -9, y: 1.25, z: 8, sx: 1, sy: 2.5, sz: 10, type: 'wall' },
  { id: 'laneWallE', x: 9, y: 1.25, z: 8, sx: 1, sy: 2.5, sz: 10, type: 'wall' },
];

export const MAPS = [
  {
    id: 'triad-keep', name: 'Triad Keep', style: 'flagship', flagship: true,
    desc: 'Three sites around a stepped-up central platform. Hand-authored, server-validated.',
    wall: 0x59616a, floor: 0x77756d, accent: 0xe0ad69,
    blocks: triadKeepBlocks,
    sites: [
      { id: 'A', label: 'SITE A', x: -15, z: -9, radius: 2.8 },
      { id: 'B', label: 'SITE B', x: 15, z: -9, radius: 2.8 },
      { id: 'C', label: 'SITE C', x: 0, z: -9, radius: 2.8, elevated: 1.2 },
    ],
    spawns: {
      attack: [{ x: -3, z: 20 }, { x: 3, z: 20 }, { x: -6, z: 18 }, { x: 6, z: 18 }, { x: 0, z: 19 }],
      defend: [{ x: -3, z: -20 }, { x: 3, z: -20 }, { x: -6, z: -18 }, { x: 6, z: -18 }, { x: 0, z: -19 }],
    },
  },

  // The remaining 12 are the original procedural prototype arenas. They are
  // honest placeholders: playable solo/bot practice, generated from a style
  // keyword rather than hand-authored, and not wired into online matchmaking.
  { id: 'cinder-gate', name: 'Cinder Gate', style: 'teleport', sites: 2, desc: 'Twin jump-gates, tight alleys, no mid lane. Prototype arena.', wall: 0x42515b, floor: 0x6a655c, accent: 0x38c9b6 },
  { id: 'vertical-divide', name: 'Vertical Divide', style: 'vertical', sites: 2, desc: 'Urban split-level lanes and raised catwalks. Prototype arena.', wall: 0x3d4e60, floor: 0x525e6c, accent: 0xffb45d },
  { id: 'sunspire-plaza', name: 'Sunspire Plaza', style: 'courtyard', sites: 2, desc: 'Open plaza, solid shutters, long and short lanes. Prototype arena.', wall: 0x8a7765, floor: 0xb2a18b, accent: 0x64d4be },
  { id: 'polar-relay', name: 'Polar Relay', style: 'arctic', sites: 2, desc: 'Cold industrial compound with elevated platforms. Prototype arena.', wall: 0x597987, floor: 0xa9c0c8, accent: 0x9ee7ed },
  { id: 'tidebreak', name: 'Tidebreak', style: 'coast', sites: 2, desc: 'Coastal ruins, long views and interior routes. Prototype arena.', wall: 0x9a8068, floor: 0xb6a88e, accent: 0x42c7d1 },
  { id: 'crosscurrent-lab', name: 'Crosscurrent Lab', style: 'split', sites: 2, desc: 'Divided research campus with outer rotations. Prototype arena.', wall: 0x596d73, floor: 0x7c8a87, accent: 0xb8db73 },
  { id: 'blueglass-quarter', name: 'Blueglass Quarter', style: 'city', sites: 2, desc: 'Compact waterfront streets and connected passages. Prototype arena.', wall: 0x8a7c77, floor: 0x9c9690, accent: 0x64cce0 },
  { id: 'echo-sanctum', name: 'Echo Sanctum', style: 'ancient', sites: 3, desc: 'Old stone complex with rotating gate mechanisms. Prototype arena.', wall: 0x77674e, floor: 0x9a8a70, accent: 0xc2d56a },
  { id: 'neon-borough', name: 'Neon Borough', style: 'urban', sites: 2, desc: 'Neighbourhood lanes, courtyards and alley flanks. Prototype arena.', wall: 0x59606c, floor: 0x777d82, accent: 0xf29b62 },
  { id: 'riftwatch', name: 'Riftwatch', style: 'chasm', sites: 2, desc: 'Suspended facility, narrow bridges and exposed edges. Prototype arena.', wall: 0x4e6175, floor: 0x3c4d5d, accent: 0xa28bff },
  { id: 'ironhaven', name: 'Ironhaven', style: 'fortress', sites: 2, desc: 'Fortified industrial streets with layered cover. Prototype arena.', wall: 0x746b60, floor: 0x817b70, accent: 0xdfa35f },
  { id: 'summit-array', name: 'Summit Array', style: 'lanes', sites: 2, desc: 'Three-lane simulator with timed barrier gates. Prototype arena.', wall: 0x526675, floor: 0x75818a, accent: 0x68e0c5 },
].map(m => {
  if (m.id === 'triad-keep') return m;
  // Give every prototype arena consistent, bug-fixed site/spawn metadata.
  // The original always drew the objective marker for a map's 2nd site at
  // z:+15 instead of z:-15 (asymmetric by mistake), and plant/defuse only
  // ever checked Site A's coordinates regardless of which pad was nearby --
  // both fixed here by giving every map real, per-site coordinates.
  const sites = m.sites === 3
    ? [{ id: 'A', label: 'SITE A', x: -14, z: -15, radius: 2.7 }, { id: 'B', label: 'SITE B', x: 14, z: -15, radius: 2.7 }, { id: 'C', label: 'SITE C', x: 0, z: -9, radius: 2.7 }]
    : [{ id: 'A', label: 'SITE A', x: -14, z: -15, radius: 2.7 }, { id: 'B', label: 'SITE B', x: 14, z: -15, radius: 2.7 }];
  return { ...m, sites, spawns: { attack: [{ x: 0, z: 17 }], defend: [{ x: 0, z: -17 }] } };
});

export function getMap(id) { return MAPS.find(m => m.id === id) || MAPS[0]; }
export function flagshipMap() { return MAPS.find(m => m.flagship) || MAPS[0]; }

// ---------------------------------------------------------------------------
// CHARACTERS
// ---------------------------------------------------------------------------
// Two fully-implemented original characters. Both client (visuals/effects)
// and server (cooldown/cost validation) import this same list. Ability keys
// deliberately avoid every movement/combat/menu key already in use
// (WASD, Space, Shift, Ctrl, R, 1/2, Tab, Esc, E for plant/defuse, LMB).

export const CHARACTERS = [
  {
    id: 'vesper', name: 'VESPER', tagline: 'Entry duelist. First through the door.', role: 'Duelist', color: 0xff5265,
    abilities: [
      { id: 'dash', key: 'Q', name: 'SURGE DASH', desc: 'Dash forward, briefly boosting move speed.', type: 'instant', charges: 2, cooldownMs: 14000, cost: 200, distance: 5.5, boostMs: 900 },
      { id: 'boost', key: 'C', name: 'ADRENAL BOOST', desc: 'Temporary fire-rate and reload-speed boost.', type: 'self', charges: 1, cooldownMs: 30000, cost: 200, durationMs: 6000 },
      { id: 'phase', key: 'F', name: 'PHASE STEP', desc: 'Brief intangible micro-teleport forward.', type: 'instant', charges: 1, cooldownMs: 35000, cost: 250, distance: 4.5 },
      { id: 'flash', key: 'V', name: 'FLASHPOINT', desc: 'Throw a flare that blinds anyone looking at it.', type: 'thrown', charges: 1, cooldownMs: 24000, cost: 250, fuseMs: 900, radius: 9 },
    ],
    ultimate: { id: 'overdrive', key: 'X', name: 'OVERDRIVE', desc: 'Move faster, fire faster, and reveal nearby enemies for a few seconds.', pointsRequired: 100, durationMs: 8000 },
  },
  {
    id: 'warden', name: 'WARDEN', tagline: 'Vision control and area denial.', role: 'Controller', color: 0x63e6d2,
    abilities: [
      { id: 'smoke', key: 'Q', name: 'SMOKE CANISTER', desc: 'Throws a smoke that blocks vision and gunfire.', type: 'thrown', charges: 2, cooldownMs: 20000, cost: 200, fuseMs: 700, radius: 4.5, durationMs: 16000 },
      { id: 'trip', key: 'C', name: 'TRAP WIRE', desc: 'Places a tripwire that reveals and slows anyone who crosses it.', type: 'placed', charges: 2, cooldownMs: 18000, cost: 200, radius: 1.4, durationMs: 40000, slowMs: 2500 },
      { id: 'wall', key: 'F', name: 'BARRIER WALL', desc: 'Raises a temporary wall segment.', type: 'placed', charges: 1, cooldownMs: 32000, cost: 300, durationMs: 14000, width: 5, height: 3 },
      { id: 'recon', key: 'V', name: 'RECON PING', desc: 'Places a sensor that reveals nearby enemies in pulses.', type: 'placed', charges: 1, cooldownMs: 28000, cost: 300, radius: 11, durationMs: 12000, pulseMs: 2000 },
    ],
    ultimate: { id: 'lockdown', key: 'X', name: 'LOCKDOWN', desc: 'Deploys a zone that slows and reveals every enemy inside it.', pointsRequired: 100, durationMs: 9000, radius: 8 },
  },
];

export function getCharacter(id) { return CHARACTERS.find(c => c.id === id) || CHARACTERS[0]; }
