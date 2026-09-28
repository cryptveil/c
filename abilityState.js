// shared/abilityState.js
// Pure ability charge/cooldown/ultimate-point bookkeeping -- no THREE.js, no
// DOM. The server uses this to authoritatively validate ability requests;
// the client uses it both for offline bot-mode and to predict its own HUD
// state before the server confirms. Visual effects live in
// public/src/abilities.js, which imports these functions.

export function createAbilityState(character) {
  const charges = {}, nextRecharge = {};
  character.abilities.forEach(a => { charges[a.id] = a.charges; nextRecharge[a.id] = 0; });
  return { charges, nextRecharge, ultPoints: 0, effects: [], blindUntil: 0, slowUntil: 0, revealedUntil: 0 };
}

export function canActivate(character, abilityId, state, now) {
  if (character.ultimate.id === abilityId) return state.ultPoints >= character.ultimate.pointsRequired;
  return (state.charges[abilityId] || 0) > 0;
}

export function tickAbilityState(character, state, dt, now, aliveAndRoundLive) {
  character.abilities.forEach(a => {
    if (state.charges[a.id] < a.charges && now >= state.nextRecharge[a.id]) {
      state.charges[a.id]++;
      if (state.charges[a.id] < a.charges) state.nextRecharge[a.id] = now + a.cooldownMs;
    }
  });
  if (aliveAndRoundLive) state.ultPoints = Math.min(character.ultimate.pointsRequired, state.ultPoints + dt * (100 / 70));
}

export function onKillGainUltPoints(character, state) {
  state.ultPoints = Math.min(character.ultimate.pointsRequired, state.ultPoints + 25);
}

export function spendCharge(character, abilityId, state, now) {
  if (character.ultimate.id === abilityId) { state.ultPoints = 0; return; }
  const def = character.abilities.find(a => a.id === abilityId);
  state.charges[abilityId]--;
  if (state.charges[abilityId] === def.charges - 1) state.nextRecharge[abilityId] = now + def.cooldownMs;
}
