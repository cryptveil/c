// public/src/main.js
// Orchestrates everything: menu wiring, the render loop, input, and the two
// modes the game can run in --
//   OFFLINE (practice/unranked/competitive-local): fully simulated in the
//     browser against bots, using the same shared/roundEngine.js rules the
//     server uses, so behaviour matches online play as closely as possible.
//   ONLINE (queue/lobby): the server in server/match.js is authoritative.
//     This client sends intents and renders whatever the server broadcasts;
//     it does not decide hits, kills, credits, or round results itself.

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { MAPS, getMap, flagshipMap, CHARACTERS, getCharacter } from '../../shared/data.js';
import { MOVE, WEAPONS } from '../../shared/rules.js';
import { createRoundState, tickRound, plant as plantRound, defuse as defuseRound, checkElimination, roundEndCredits } from '../../shared/roundEngine.js';
import { buildWorld, makeText } from './world.js';
import { createPlayer, stepMovement } from './player.js';
import { createLoadout, currentWeapon, switchWeapon, startReload, tryShoot, decayRecoil } from './weapons.js';
import { spawnBot, updateBot, damageBot, respawnBot } from './bots.js';
import { createAbilityState, canActivate, tickAbilityState, tickEffects, onKillGainUltPoints, spendCharge, applyAbilityEffect, processEffectsAgainstEnemies } from './abilities.js';
import { connectNet } from './net.js';
import * as UI from './ui.js';
import { createAnimationController } from './animation.js';

const keys = {};
let settings = { quality: 1, sensitivity: 1 };
let mode = null; // 'practice'|'unranked'|'competitive'|'online'
let selectedMapId = flagshipMap().id;
let selectedCharacterId = null;

let scene, camera, renderer, solids, dynamicSolids = [], blockers = { spheres: [], meshes: [] };
let player, loadout, abilityState, character;
let bots = [];
let round = null;
let localTeam = 0, localSide = 'attack';
let net = null, remotePlayers = new Map(), remoteRoster = [];
let remoteEffects = []; // effects other players triggered (online mode only)
let raf = null, running = false, paused = false;
let anim = null, wasGrounded = true;
let lastFrame = 0, lastNetSend = 0;

document.addEventListener('keydown', e => { keys[e.code] = true; if (e.code === 'Tab') { e.preventDefault(); UI.updateScoreboard(currentRoster(), net?.socket.id); document.getElementById('scoreboard').classList.add('show'); } if (e.code === 'Escape') togglePause(); });
document.addEventListener('keyup', e => { keys[e.code] = false; if (e.code === 'Tab') document.getElementById('scoreboard').classList.remove('show'); });
// Inspect animation: I. It is intentionally procedural and uses original geometry.
document.addEventListener('keydown', e => { if (e.code === 'KeyI' && !e.repeat && running && !paused) anim?.event('inspect'); });
document.addEventListener('mousemove', e => {
  if (!running || paused || document.pointerLockElement == null) return;
  player.yaw += e.movementX * 0.0022 * settings.sensitivity;
  player.pitch = Math.max(-1.2, Math.min(1.2, player.pitch - e.movementY * 0.0022 * settings.sensitivity));
});

function currentRoster() {
  if (mode === 'online') return remoteRoster;
  return [
    { id: 'you', name: 'YOU', team: localTeam, character: character?.id, alive: player.hp > 0, kills: player.kills || 0, deaths: player.deaths || 0 },
    ...bots.map((b, i) => ({ id: 'bot' + i, name: `BOT-${i + 1}`, team: b.team, character: null, alive: b.alive, kills: b.kills || 0, deaths: b.deaths || 0 })),
  ];
}

// --------------------------------------------------------------------------
// Menu wiring
// --------------------------------------------------------------------------
UI.initMenu({
  startOffline: (m) => { mode = m; toggleMapSection(true); UI.showScreen('screenCharSelect'); },
  joinQueue: () => { ensureNet(); net.joinQueue(promptedName()); },
  leaveQueue: () => { net && net.leaveQueue(); },
  createLobby: () => { ensureNet(); net.createLobby(promptedName()); UI.showScreen('screenLobby'); },
  joinLobby: (code) => { ensureNet(); net.joinLobby(code, promptedName()); UI.showScreen('screenLobby'); },
  startLobby: () => { net && net.startLobby(currentLobbyCode); },
  setQuality: (v) => settings.quality = v,
  setSensitivity: (v) => settings.sensitivity = v,
  selectMap: (id) => selectMap(id),
  selectCharacter: (id) => { selectedCharacterId = id; document.getElementById('btnEnterMatch').disabled = false; },
});
function toggleMapSection(show) {
  const el = document.getElementById('mapSection');
  if (el) el.style.display = show ? '' : 'none';
}
function selectMap(id) {
  selectedMapId = id;
  UI.renderMapGrid(MAPS, selectedMapId, selectMap);
}
selectMap(selectedMapId);
UI.populateCharacterGrid((id) => { selectedCharacterId = id; document.getElementById('btnEnterMatch').disabled = false; });

document.getElementById('btnEnterMatch').onclick = () => {
  if (mode === 'online') { net.pickCharacter(selectedCharacterId); UI.showScreen('screenHUD'); requestPointerLockSafe(); }
  else { beginOffline(); }
};
document.getElementById('btnCharBack').onclick = () => UI.showScreen('screenMain');
document.getElementById('btnResume').onclick = () => togglePause();
document.getElementById('btnQuitToMenu').onclick = () => location.reload();
document.getElementById('btnResultMenu').onclick = () => location.reload();

function promptedName() {
  const el = document.getElementById('playerNameInput');
  return (el && el.value.trim()) || `Operative-${Math.floor(Math.random() * 9000 + 1000)}`;
}
let currentLobbyCode = null;

function ensureNet() {
  if (net) return;
  net = connectNet({
    onQueueSize: (d) => { document.getElementById('queueCount').textContent = d.size; },
    onMatched: (d) => { mode = 'online'; toggleMapSection(false); UI.showScreen('screenCharSelect'); document.getElementById('btnEnterMatch').disabled = true; },
    onLobbyCreated: (d) => { currentLobbyCode = d.code; renderLobby(d); },
    onLobbyUpdate: (d) => renderLobby(d),
    onLobbyError: (d) => alert(d.message),
    onMatchJoined: (d) => { localTeam = d.team; },
    onRoster: (d) => { remoteRoster = d.roster; },
    onState: (d) => applyServerState(d),
    onHit: (d) => { if (d.target === net.socket.id) { flashDamage(); anim?.event('hit'); } },
    onKill: (d) => { if (d.by === net.socket.id) UI.showBanner(d.headshot ? 'HEADSHOT ELIMINATION' : 'ELIMINATION'); },
    onAbility: (d) => renderRemoteAbility(d),
    onPlanted: () => UI.showBanner('SPIKE PLANTED'),
    onDefused: () => UI.showBanner('SPIKE DEFUSED'),
    onRoundEnded: (d) => { UI.showBanner((d.winnerSide === localSide ? 'ROUND WON' : 'ROUND LOST') + ` — ${d.reason}`); },
    onEconomy: (d) => { player.credits = d.credits; loadout.owned = d.owned; player.armor = d.armor; },
  });
}
function renderLobby(d) {
  currentLobbyCode = d.code;
  document.getElementById('lobbyCodeDisplay').textContent = d.code;
  document.getElementById('lobbyMembers').innerHTML = d.members.map(m => `<div>${m.name}${m.id === d.hostId ? ' (host)' : ''}</div>`).join('');
}

// --------------------------------------------------------------------------
// Offline setup
// --------------------------------------------------------------------------
function beginOffline() {
  character = getCharacter(selectedCharacterId);
  const map = getMap(selectedMapId);
  setupWorld(map);
  const spawn = map.spawns.attack[0];
  player = createPlayer(spawn.x, spawn.z);
  player.hp = 100; player.armor = 0; player.credits = 800; player.kills = 0; player.deaths = 0;
  loadout = createLoadout(mode === 'competitive' ? ['pistol'] : ['pistol', 'kite', 'vx9']);
  abilityState = createAbilityState(character);
  localTeam = 0; localSide = 'attack';
  round = mode === 'competitive' ? createRoundState() : null;

  bots = [];
  const botSpawn = map.spawns.defend[0];
  for (let i = 0; i < (mode === 'competitive' ? 4 : 3); i++) {
    bots.push(spawnBot(scene, botSpawn.x + (i - 1.5) * 2.5, botSpawn.z, 0xd65b5b, 1));
  }

  UI.showScreen('screenHUD');
  requestPointerLockSafe();
  startLoop();
}

function setupWorld(map) {
  const built = buildWorld(map, settings.quality);
  scene = built.scene; camera = built.camera; renderer = built.renderer; solids = built.solids;
  dynamicSolids = []; blockers = { spheres: [], meshes: [] };
  const host = document.getElementById('canvasHost'); host.innerHTML = ''; host.appendChild(renderer.domElement);
  anim = createAnimationController(camera, renderer, scene);
  wasGrounded = true;
  renderer.domElement.onclick = () => { if (!paused) requestPointerLockSafe(); tryFire(); };
}

function requestPointerLockSafe() { renderer?.domElement.requestPointerLock?.(); }

// --------------------------------------------------------------------------
// Online setup (called once character is picked in onMatchJoined flow above)
// --------------------------------------------------------------------------
function beginOnline(mapId) {
  character = getCharacter(selectedCharacterId);
  const map = getMap(mapId);
  setupWorld(map);
  const spawnList = localTeam === 0 ? map.spawns.attack : map.spawns.defend;
  const spawn = spawnList[0];
  player = createPlayer(spawn.x, spawn.z);
  player.hp = 100; player.armor = 0; player.credits = 800; player.kills = 0; player.deaths = 0;
  loadout = createLoadout(['pistol']);
  abilityState = createAbilityState(character);
  startLoop();
}

function applyServerState(d) {
  if (!scene) beginOnline(flagshipMap().id); // first snapshot after character pick
  localSide = localTeam === d.round.attackTeam ? 'attack' : 'defend';
  round = d.round;
  for (const rp of d.players) {
    if (net && rp.id === net.socket.id) { player.hp = rp.hp; continue; }
    let rec = remotePlayers.get(rp.id);
    if (!rec) { rec = spawnRemoteAvatar(rp); remotePlayers.set(rp.id, rec); }
    rec.targetX = rp.x; rec.targetY = rp.y; rec.targetZ = rp.z; rec.targetYaw = rp.yaw;
    rec.hp = rp.hp; rec.alive = rp.alive; rec.team = rp.team;
    rec.object.visible = rp.alive;
  }
  for (const [id, rec] of remotePlayers) if (!d.players.some(p => p.id === id)) { scene.remove(rec.object); remotePlayers.delete(id); }
}

function spawnRemoteAvatar(rp) {
  const b = spawnBot(scene, rp.x, rp.z, rp.team === localTeam ? 0x63e6d2 : 0xff5265, rp.team);
  b.ref = b; b.kind = 'player';
  return b;
}

function renderRemoteAbility(d) {
  if (!net || d.by === net.socket.id) return;
  const c = getCharacter(d.characterId);
  const effect = applyAbilityEffect(c, d.abilityId, { scene, dynamicSolids, blockers, player: { x: d.x, z: d.z }, loadout: {}, origin: { x: d.x, y: d.y, z: d.z, yaw: d.yaw }, now: performance.now(), color: c.color });
  if (effect) remoteEffects.push(effect);
}

function flashDamage() {
  const el = document.getElementById('damageFlash'); el.style.opacity = 0.55;
  setTimeout(() => el.style.opacity = 0, 140);
}

// --------------------------------------------------------------------------
// Main loop
// --------------------------------------------------------------------------
function startLoop() {
  running = true; paused = false; lastFrame = performance.now();
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(loop);
}

function togglePause() {
  if (!running) return;
  paused = !paused;
  document.getElementById('pauseOverlay').classList.toggle('show', paused);
  if (paused) document.exitPointerLock?.(); else requestPointerLockSafe();
}

function loop(t) {
  raf = requestAnimationFrame(loop);
  const dt = Math.min(0.05, (t - lastFrame) / 1000);
  lastFrame = t;
  if (!paused) update(dt, t);
  renderer.render(scene, camera);
}

function update(dt, tMs) {
  const now = performance.now();
  const allSolids = solids.concat(dynamicSolids);
  const { ground } = stepMovement(player, keys, dt, allSolids, now);
  camera.position.set(player.x, player.y, player.z);
  camera.rotation.set(player.pitch, player.yaw, 0);

  const moving = Math.hypot(keys.KeyW?1:0, keys.KeyA?1:0, keys.KeyS?1:0, keys.KeyD?1:0) > 0;
  const speedHint = moving ? ((keys.ShiftLeft || keys.ShiftRight) ? 2.8 : 5.0) : 0;
  if (wasGrounded && !player.onGround) anim?.event('jump');
  if (!wasGrounded && player.onGround) anim?.event('land', {x:player.x,y:ground,z:player.z});
  wasGrounded = player.onGround;
  anim?.update(dt, {
    moving, speed:speedHint, crouch:player.crouch,
    sprint:(keys.ShiftLeft || keys.ShiftRight) && moving,
    grounded:player.onGround, weaponDef:currentWeapon(loadout).def
  });

  decayRecoil(loadout, dt);
  camera.rotation.x -= loadout.recoilPitch * 0.4; // recoil nudges aim up
  UI.setCrosshairSpread(loadout.bloom);

  if (keys.KeyR && !keys.__reloadHeld) { keys.__reloadHeld = true; if (startReload(loadout, now)) anim?.event('reload'); }
  if (!keys.KeyR) keys.__reloadHeld = false;
  if (keys.Digit1 && !keys.__slot1) { keys.__slot1=true; const before=loadout.index; switchWeapon(loadout,0); if(before!==loadout.index) anim?.event('switch'); }
  if (!keys.Digit1) keys.__slot1=false;
  if (keys.Digit2 && !keys.__slot2) { keys.__slot2=true; const before=loadout.index; switchWeapon(loadout,1); if(before!==loadout.index) anim?.event('switch'); }
  if (!keys.Digit2) keys.__slot2=false;

  handleAbilityInput(now);
  tickAbilityState(character, abilityState, dt, now, player.hp > 0 && (!round || round.phase !== 'buy'));
  tickEffects(abilityState, now);

  if (mode === 'online') updateOnline(dt, now);
  else updateOffline(dt, now);

  syncBlockerMeshesFromEffects();
  updateHUD(now);
  updateMinimap();
}

function syncBlockerMeshesFromEffects() {
  blockers.meshes = [];
  for (const e of abilityState.effects) if (e.type === 'wall') blockers.meshes.push(e.mesh);
}

function handleAbilityInput(now) {
  const map = { KeyQ: 0, KeyC: 1, KeyF: 2, KeyV: 3 };
  for (const code in map) {
    if (keys[code] && !keys['__consumed_' + code]) {
      keys['__consumed_' + code] = true;
      const ab = character.abilities[map[code]];
      tryActivate(ab.id, now);
    }
    if (!keys[code]) keys['__consumed_' + code] = false;
  }
  if (keys.KeyX && !keys.__consumed_KeyX) { keys.__consumed_KeyX = true; tryActivate(character.ultimate.id, now); }
  if (!keys.KeyX) keys.__consumed_KeyX = false;
}

function tryActivate(abilityId, now) {
  if (!canActivate(character, abilityId, abilityState, now)) return;
  const isUlt = character.ultimate.id === abilityId;
  const def = isUlt ? character.ultimate : character.abilities.find(a => a.id === abilityId);
  if (!isUlt && player.credits < def.cost) return;
  if (mode === 'online') { net.sendAbility(abilityId); return; } // server confirms via ability:activated broadcast
  if (!isUlt) player.credits -= def.cost;
  spendCharge(character, abilityId, abilityState, now);
  const effect = applyAbilityEffect(character, abilityId, { scene, dynamicSolids, blockers, player, loadout, origin: { x: player.x, y: player.y, z: player.z, yaw: player.yaw }, now, color: character.color });
  if (effect) abilityState.effects.push(effect);
  anim?.event('ability', { id: abilityId, color: character.color });
}

function tryFire() {
  if (paused || document.pointerLockElement == null) return;
  const now = performance.now();
  if (mode === 'online') {
    const { def, ammo } = currentWeapon(loadout);
    if (now < loadout.reloadUntil || now - loadout.lastShot < def.rate * 1000 || ammo.ammo <= 0) return;
    const candidates = [...remotePlayers.values()].filter(r => r.alive && r.team !== localTeam).map(r => ({ object: r.object, headMesh: r.headMesh, kind: 'player', ref: r }));
    const result = tryShoot(loadout, camera, now, 1, candidates, blockers);
    if (result.fired) anim?.event('fire');
    let targetId = null;
    if (result.hit) { for (const [id, rec] of remotePlayers) if (rec === result.hit.ref) { targetId = id; break; } }
    net.sendShoot(targetId, result.hit ? result.hit.headshot : false);
    return;
  }
  const candidates = bots.filter(b => b.alive).map(b => ({ object: b.object, headMesh: b.headMesh, kind: 'bot', ref: b }));
  const result = tryShoot(loadout, camera, now, player.hp > 0 ? 1 : 0, candidates, blockers);
  if (result.fired) anim?.event('fire');
  if (result.hit && result.hit.kind === 'bot') {
    const died = damageBot(result.hit.ref, result.hit.damage);
    if (died) {
      player.kills = (player.kills || 0) + 1;
      onKillGainUltPoints(character, abilityState);
      UI.showBanner(result.hit.headshot ? 'HEADSHOT ELIMINATION' : 'ELIMINATION');
      if (round) checkOfflineElimination();
    }
  }
}
document.addEventListener('mousedown', (e) => { if (e.button === 0) tryFireHeld = true; });
document.addEventListener('mouseup', (e) => { if (e.button === 0) tryFireHeld = false; });
let tryFireHeld = false, fireAccum = 0;

function updateOffline(dt, now) {
  if (tryFireHeld) tryFire();
  const view = { x: player.x, z: player.z };
  for (const b of bots) {
    const dist = Math.hypot(b.x - player.x, b.z - player.z);
    const canSee = dist < 22 && player.hp > 0;
    updateBot(b, dt, now, solids.concat(dynamicSolids), view, canSee);
    if (canSee && Math.random() < dt * 1.1 && player.hp > 0 && (!round || round.phase !== 'buy')) {
      const dmg = 6 + Math.random() * 10;
      player.hp = Math.max(0, player.hp - dmg);
      flashDamage();
      if (player.hp <= 0) { onPlayerDied(); if (round) checkOfflineElimination(); }
    }
  }
  processEffectsAgainstEnemies(abilityState, bots.map(b => enemyView(b)), now, null);

  if (round) {
    const prevPhase = round.phase;
    tickRound(round, dt);
    handleOfflinePlantDefuse(now);
    if (round.phase !== prevPhase && round.phase === 'buy' && prevPhase === 'postround') resetOfflineRound();
    if (round.matchOver) { UI.showMatchResult(round.matchWinner === localTeam, round.roundWins); running = false; document.exitPointerLock?.(); }
  }
}

function resetOfflineRound() {
  const map = getMap(selectedMapId);
  localSide = localTeam === round.attackTeam ? 'attack' : 'defend';
  const mySpawn = (localSide === 'attack' ? map.spawns.attack : map.spawns.defend)[0];
  player.x = mySpawn.x; player.z = mySpawn.z; player.hp = 100; player.armor = 0;
  const botSide = localSide === 'attack' ? 'defend' : 'attack';
  const botSpawn = (botSide === 'attack' ? map.spawns.attack : map.spawns.defend)[0];
  bots.forEach((b, i) => respawnBot(b, botSpawn.x + (i - (bots.length - 1) / 2) * 2.5, botSpawn.z));
  for (const id of loadout.owned) loadout.ammoState[id] = { ammo: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
}

function enemyView(b) {
  return { x: b.x, z: b.z, yaw: b.yaw, markBlinded: () => {}, markRevealed: () => {}, markSlowed: () => {} };
}

function onPlayerDied() {
  player.deaths = (player.deaths || 0) + 1;
  setTimeout(() => {
    if (!running) return;
    const map = getMap(selectedMapId);
    const spawn = map.spawns.attack[0];
    player.x = spawn.x; player.z = spawn.z; player.hp = 100;
  }, 2200);
}

function checkOfflineElimination() {
  const botsAlive = bots.filter(b => b.alive).length;
  const playerAlive = player.hp > 0 ? 1 : 0;
  if (localSide === 'attack') checkElimination(round, playerAlive, botsAlive);
  else checkElimination(round, botsAlive, playerAlive);
}

let offlinePlantHold = null, offlineDefuseHold = null;
function handleOfflinePlantDefuse(now) {
  const map = getMap(selectedMapId);
  const site = map.sites.find(s => Math.hypot(player.x - s.x, player.z - s.z) <= s.radius);
  if (localSide === 'attack' && round.phase === 'live') {
    if (site && keys.KeyE) {
      if (!offlinePlantHold || offlinePlantHold.site !== site.id) { offlinePlantHold = { site: site.id, startedAt: now }; anim?.event('plant', {duration:2.2}); }
      if ((now - offlinePlantHold.startedAt) / 1000 >= 2.2) { plantRound(round, site.id, now); UI.showBanner('SPIKE PLANTED'); offlinePlantHold = null; }
    } else offlinePlantHold = null;
  }
  if (localSide === 'defend' && round.phase === 'planted') {
    const psite = map.sites.find(s => s.id === round.plantSite);
    const near = psite && Math.hypot(player.x - psite.x, player.z - psite.z) <= psite.radius + 1.2;
    if (near && keys.KeyE) {
      if (!offlineDefuseHold) { offlineDefuseHold = { startedAt: now }; anim?.event('defuse', {duration:3.2}); }
      if ((now - offlineDefuseHold.startedAt) / 1000 >= 3.2) { defuseRound(round); UI.showBanner('SPIKE DEFUSED'); offlineDefuseHold = null; }
    } else offlineDefuseHold = null;
  }
}

function updateOnline(dt, now) {
  if (tryFireHeld) tryFire();
  for (const [id, rec] of remotePlayers) {
    rec.x += (rec.targetX - rec.x) * Math.min(1, dt * 12);
    rec.z += (rec.targetZ - rec.z) * Math.min(1, dt * 12);
    rec.y = rec.targetY ?? rec.y;
    rec.yaw = rec.targetYaw ?? rec.yaw;
    rec.object.position.set(rec.x, rec.y, rec.z);
    rec.object.rotation.y = rec.yaw;
  }

  // Remote-triggered effects (other players' smokes/flashes/tripwires/etc):
  // expire + clean up meshes, and apply their gameplay impact to us.
  const wrapper = { effects: remoteEffects };
  tickEffects(wrapper, now);
  remoteEffects = wrapper.effects;
  const localView = {
    x: player.x, z: player.z, yaw: player.yaw,
    markBlinded: (ms) => { abilityState.blindUntil = Math.max(abilityState.blindUntil, now + ms); },
    markRevealed: () => {},
    markSlowed: (ms) => { player.speedBoostUntil = Math.max(player.speedBoostUntil, now + ms); player.speedBoostMult = Math.min(player.speedBoostMult <= 1 ? 1 : player.speedBoostMult, 0.55); },
  };
  processEffectsAgainstEnemies(wrapper, [], now, localView);

  if (now - lastNetSend > 45) { lastNetSend = now; net.sendMove(player.x, player.y, player.z, player.yaw); }
  if (keys.KeyE) {
    net.sendPlant(true); net.sendDefuse(true);
  } else { net.sendPlant(false); net.sendDefuse(false); }
}

// --------------------------------------------------------------------------
// HUD / minimap
// --------------------------------------------------------------------------
function updateHUD(now) {
  const { def, ammo } = currentWeapon(loadout);
  const roundView = round || { phase: mode === 'competitive' || mode === 'online' ? 'live' : 'practice', timeLeft: 0, roundNumber: 1, roundWins: [0, 0] };
  UI.updateHUD({
    hp: player.hp, armor: player.armor || 0, ammo: ammo.ammo, reserve: ammo.reserve, weaponName: def.name,
    credits: player.credits, timeLeft: roundView.timeLeft, phase: roundView.phase, roundNumber: roundView.roundNumber,
    roundWins: roundView.roundWins, side: localSide,
  });
  UI.updateAbilityHUD(character, abilityState, now);
  UI.setBlindOverlay(now < (abilityState.blindUntil || 0) ? 1 : 0);

  const showBuy = roundView.phase === 'buy';
  UI.showBuyMenu(showBuy, { owned: loadout.owned, credits: player.credits }, (kind, id) => {
    if (mode === 'online') { net.sendBuy(kind, id); return; }
    const price = kind === 'weapon' ? WEAPONS[id].price : (id === 'light' ? 400 : 1000);
    if (player.credits < price) return;
    player.credits -= price;
    if (kind === 'weapon') { if (!loadout.owned.includes(id)) loadout.owned.push(id); loadout.ammoState[id] = { ammo: WEAPONS[id].mag, reserve: WEAPONS[id].reserve }; loadout.index = loadout.owned.indexOf(id); }
    else player.armor = id === 'light' ? 25 : 50;
  });
}

function updateMinimap() {
  const cvs = document.getElementById('minimap'); if (!cvs) return;
  const g = cvs.getContext('2d');
  g.clearRect(0, 0, cvs.width, cvs.height);
  const scale = cvs.width / 50, cx = cvs.width / 2, cz = cvs.height / 2;
  g.fillStyle = '#0b141c'; g.fillRect(0, 0, cvs.width, cvs.height);
  const map = getMap(selectedMapId);
  (map.blocks || []).forEach(b => { g.fillStyle = '#2c3a44'; g.fillRect(cx + (b.x - b.sx / 2) * scale, cz + (b.z - b.sz / 2) * scale, b.sx * scale, b.sz * scale); });
  map.sites.forEach(s => { g.fillStyle = '#e0ad6988'; g.beginPath(); g.arc(cx + s.x * scale, cz + s.z * scale, s.radius * scale, 0, 7); g.fill(); g.fillStyle = '#fff'; g.font = '9px monospace'; g.fillText(s.id, cx + s.x * scale - 3, cz + s.z * scale + 3); });
  g.fillStyle = '#63e6d2'; g.beginPath(); g.arc(cx + player.x * scale, cz + player.z * scale, 3.5, 0, 7); g.fill();
  const list = mode === 'online' ? [...remotePlayers.values()] : bots;
  list.forEach(b => { if (!b.alive) return; g.fillStyle = (mode === 'online' ? (b.team === localTeam) : false) ? '#63e6d2' : '#ff5265'; g.beginPath(); g.arc(cx + b.x * scale, cz + b.z * scale, 3, 0, 7); g.fill(); });
}
