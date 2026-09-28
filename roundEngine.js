// shared/roundEngine.js
// The competitive round state machine as pure functions over a plain state
// object. Both server/match.js (authoritative, for online play) and the
// client's offline bot-practice mode call these same functions, so the
// rules are identical in both places instead of being implemented twice.
//
// This is also the direct fix for prototype v0.1's round-timer bug: "live"
// and "planted" are separate timers (timeLeft vs plantTimeLeft) that are
// never both decremented in the same tick, and an unplanted round timer
// hitting zero now actually ends the round (defenders win) instead of just
// freezing the game on a "TIME EXPIRED" overlay forever.

import { ROUND, ECONOMY, nextLossReward } from './rules.js';

export function createRoundState() {
  return {
    phase: 'buy',            // buy -> live -> planted -> postround
    timeLeft: ROUND.BUY_SECONDS,
    roundNumber: 1,
    roundWins: [0, 0],        // [team0, team1]
    attackTeam: 0,             // which team index is currently attacking
    plantSite: null,
    winnerSide: null,
    lossStreak: [0, 0],
    matchOver: false,
    matchWinner: null,
  };
}

export function tickRound(state, dt) {
  if (state.matchOver) return state;
  state.timeLeft = Math.max(0, state.timeLeft - dt);
  if (state.phase === 'buy' && state.timeLeft <= 0) {
    state.phase = 'live'; state.timeLeft = ROUND.ROUND_SECONDS;
  } else if (state.phase === 'live' && state.timeLeft <= 0) {
    endRound(state, 'defend', 'time expired');
  } else if (state.phase === 'planted' && state.timeLeft <= 0) {
    endRound(state, 'attack', 'bomb detonated');
  } else if (state.phase === 'postround' && state.timeLeft <= 0) {
    startNextRound(state);
  }
  return state;
}

export function plant(state, siteId, now) {
  if (state.phase !== 'live') return false;
  state.phase = 'planted';
  state.plantSite = siteId;
  state.timeLeft = ROUND.PLANT_FUSE_SECONDS;
  return true;
}

export function defuse(state) {
  if (state.phase !== 'planted') return false;
  endRound(state, 'defend', 'defused');
  return true;
}

// Call whenever a team is wiped; safe to call every tick, it only acts when
// the wipe is actually round-ending under these rules:
//  - attackers wiped before plant -> defenders win immediately
//  - defenders wiped before plant -> round CONTINUES; attackers still must
//    plant (a wiped defense doesn't auto-win the round for attack)
//  - defenders wiped after plant -> attackers win immediately (no one left to defuse)
//  - attackers wiped after plant -> round continues; the bomb still ticks
export function checkElimination(state, attackersAlive, defendersAlive) {
  if (state.matchOver) return;
  if (state.phase === 'live' && attackersAlive <= 0) endRound(state, 'defend', 'attackers eliminated');
  else if (state.phase === 'planted' && defendersAlive <= 0) endRound(state, 'attack', 'defenders eliminated');
}

function endRound(state, winnerSide, reason) {
  state.phase = 'postround';
  state.timeLeft = ROUND.POST_ROUND_SECONDS;
  state.winnerSide = winnerSide;
  state.winReason = reason;
  const winnerTeam = winnerSide === 'attack' ? state.attackTeam : 1 - state.attackTeam;
  state.roundWins[winnerTeam]++;
  state.lossStreak[winnerTeam] = 0;
  state.lossStreak[1 - winnerTeam]++;
  if (state.roundWins[0] >= ROUND.ROUNDS_TO_WIN || state.roundWins[1] >= ROUND.ROUNDS_TO_WIN) {
    state.matchOver = true;
    state.matchWinner = state.roundWins[0] > state.roundWins[1] ? 0 : 1;
  }
}

function startNextRound(state) {
  state.roundNumber++;
  state.phase = 'buy';
  state.timeLeft = ROUND.BUY_SECONDS;
  state.plantSite = null;
  state.winnerSide = null;
  if (state.roundNumber === ROUND.SIDE_SWITCH_AFTER_ROUNDS + 1) state.attackTeam = 1 - state.attackTeam;
}

export function roundEndCredits(lossStreakCount, won) {
  if (won) return ECONOMY.WIN_REWARD;
  return nextLossReward(lossStreakCount);
}

export function sidesSwapped(roundNumber) {
  return roundNumber > ROUND.SIDE_SWITCH_AFTER_ROUNDS;
}
