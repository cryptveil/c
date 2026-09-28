// tools/verify-round-engine.mjs
// Actual automated tests for shared/roundEngine.js. Run: node tools/verify-round-engine.mjs

import { createRoundState, tickRound, plant, defuse, checkElimination } from '../shared/roundEngine.js';
import { ROUND } from '../shared/rules.js';

let pass = 0, fail = 0;
function assert(cond, label) { if (cond) pass++; else { fail++; console.log('FAIL:', label); } }

// 1. Buy phase transitions to live after BUY_SECONDS.
{
  const s = createRoundState();
  tickRound(s, ROUND.BUY_SECONDS + 0.1);
  assert(s.phase === 'live', 'buy -> live after buy timer');
  assert(Math.abs(s.timeLeft - ROUND.ROUND_SECONDS) < 0.01, 'live timer reset to ROUND_SECONDS');
}

// 2. Live round timing out with no plant = defenders (team 1) win, NOT a frozen "expired" state.
{
  const s = createRoundState();
  tickRound(s, ROUND.BUY_SECONDS + 0.1);
  tickRound(s, ROUND.ROUND_SECONDS + 0.1);
  assert(s.phase === 'postround', 'live timeout ends the round');
  assert(s.winnerSide === 'defend', 'live timeout is a defender win');
  assert(s.roundWins[1] === 1, 'defender (team 1) round win recorded');
}

// 3. Plant switches to its own fuse timer, independent of the round timer
//    (regression test for the double-decrement bug: one tick after planting
//    should only remove ONE dt's worth of time, not two).
{
  const s = createRoundState();
  tickRound(s, ROUND.BUY_SECONDS + 0.1);
  plant(s, 'A');
  assert(s.phase === 'planted', 'plant() switches phase');
  assert(Math.abs(s.timeLeft - ROUND.PLANT_FUSE_SECONDS) < 0.01, 'plant resets to fuse timer');
  const before = s.timeLeft;
  tickRound(s, 1.0);
  assert(Math.abs((before - s.timeLeft) - 1.0) < 0.001, `exactly 1s removed per 1s tick (got ${before - s.timeLeft})`);
}

// 4. Bomb fuse expiring = attackers (team 0) win.
{
  const s = createRoundState();
  tickRound(s, ROUND.BUY_SECONDS + 0.1);
  plant(s, 'A');
  tickRound(s, ROUND.PLANT_FUSE_SECONDS + 0.1);
  assert(s.winnerSide === 'attack', 'bomb detonation is an attacker win');
  assert(s.roundWins[0] === 1, 'attacker (team 0) round win recorded');
}

// 5. Defuse ends the round as a defender win.
{
  const s = createRoundState();
  tickRound(s, ROUND.BUY_SECONDS + 0.1);
  plant(s, 'A');
  defuse(s);
  assert(s.winnerSide === 'defend', 'defuse is a defender win');
}

// 6. Defenders wiped BEFORE plant does not auto-win the round for attack.
{
  const s = createRoundState();
  tickRound(s, ROUND.BUY_SECONDS + 0.1);
  checkElimination(s, 3, 0);
  assert(s.phase === 'live', 'wiped defense pre-plant does not end the round');
}

// 7. Defenders wiped AFTER plant DOES instantly win it for attack.
{
  const s = createRoundState();
  tickRound(s, ROUND.BUY_SECONDS + 0.1);
  plant(s, 'A');
  checkElimination(s, 2, 0);
  assert(s.winnerSide === 'attack' && s.phase === 'postround', 'wiped defense post-plant ends the round for attack');
}

// 8. Attackers wiped before plant ends the round for defense immediately.
{
  const s = createRoundState();
  tickRound(s, ROUND.BUY_SECONDS + 0.1);
  checkElimination(s, 0, 4);
  assert(s.winnerSide === 'defend' && s.phase === 'postround', 'wiped attack pre-plant ends the round for defense');
}

// 9. Match ends once a side reaches ROUNDS_TO_WIN.
{
  const s = createRoundState();
  for (let i = 0; i < ROUND.ROUNDS_TO_WIN; i++) {
    s.phase = 'live'; s.timeLeft = 0.01;
    checkElimination(s, 0, 3);
  }
  assert(s.matchOver === true, 'match ends at ROUNDS_TO_WIN');
  assert(s.matchWinner === 1, 'correct match winner recorded');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
