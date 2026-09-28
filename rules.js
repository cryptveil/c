// shared/rules.js
// Pure, dependency-free constants shared between the authoritative server
// and the browser client. Both sides import this exact file (the server via
// a relative path, the client via /shared/rules.js served statically) so
// round timing, economy numbers and weapon stats can never disagree.
//
// This directly fixes a bug from prototype v0.1: the client's round timer
// subtracted dt from timeLeft once for the live round, then subtracted dt
// again inside the "planted" branch on the same frame, so the clock ran at
// roughly double speed after a plant. Here, "live" and "planted" are two
// separate timers that never both tick in the same frame.

export const ROUND = {
  BUY_SECONDS: 20,
  ROUND_SECONDS: 100,       // time attackers have to plant before defenders win on time
  PLANT_FUSE_SECONDS: 35,   // bomb timer once planted, replaces the round timer entirely
  PLANT_HOLD_SECONDS: 2.2,
  DEFUSE_HOLD_SECONDS: 3.2,
  ROUNDS_TO_WIN: 13,
  SIDE_SWITCH_AFTER_ROUNDS: 12,
  POST_ROUND_SECONDS: 4,
};

export const ECONOMY = {
  START_CREDITS: 800,
  MAX_CREDITS: 9000,
  WIN_REWARD: 3000,
  LOSS_REWARD_BASE: 1900,
  LOSS_REWARD_STEP: 500,
  LOSS_REWARD_MAX: 2900,
  KILL_REWARD: 200,
  PLANT_REWARD: 300,
};

export const WEAPONS = {
  pistol: { id: 'pistol', name: 'SD-1 SIDEARM', price: 0, mag: 12, reserve: 36, damage: 18, headMultiplier: 2, rate: 0.14, spread: 0.030 },
  kite:   { id: 'kite',   name: 'KITE SMG',      price: 1200, mag: 32, reserve: 96, damage: 21, headMultiplier: 2, rate: 0.09, spread: 0.035 },
  vx9:    { id: 'vx9',    name: 'VX-9 RIFLE',    price: 2900, mag: 25, reserve: 75, damage: 34, headMultiplier: 2, rate: 0.18, spread: 0.018 },
};

export const ARMOR = {
  none:  { id: 'none',  name: 'NO ARMOR',    price: 0,    value: 0 },
  light: { id: 'light', name: 'LIGHT ARMOR', price: 400,  value: 25 },
  heavy: { id: 'heavy', name: 'HEAVY ARMOR', price: 1000, value: 50 },
};

export const MOVE = {
  RUN_SPEED: 4.3,
  WALK_SPEED: 2.1,
  CROUCH_MULT: 0.55,
  JUMP_VELOCITY: 5.4,
  GRAVITY: 14,
  EYE_STAND: 1.65,
  EYE_CROUCH: 1.15,
  STEP_HEIGHT: 0.55,
  // Generous sanity cap used by the server to reject impossible movement
  // (well above run+dash so it doesn't false-positive on legitimate boosts).
  MAX_PLAUSIBLE_SPEED: 9.5,
};

export const NET = {
  MOVEMENT_MIN_INTERVAL_MS: 40, // server ignores movement updates faster than ~25Hz
  MAX_HIT_RANGE: 60,
  AIM_CONE_DEGREES: 22,         // generous tolerance, see server/match.js for why
};

export function nextLossReward(streak) {
  return Math.min(ECONOMY.LOSS_REWARD_MAX, ECONOMY.LOSS_REWARD_BASE + Math.max(0, streak - 1) * ECONOMY.LOSS_REWARD_STEP);
}
