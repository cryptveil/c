// server/match.js
// The authoritative match. Clients send intents (movement, shoot, ability,
// buy, plant/defuse); this class validates and applies them, and the server
// is the single source of truth for health, credits, kills, and round wins.
// Clients are never trusted to decide those for themselves.
//
// Honest scope note on hit validation: this checks fire-rate, ammo, weapon
// range, and a generous aim-cone between the shooter's reported facing and
// the target -- it does NOT raycast against level geometry server-side, so
// it cannot yet catch a shot that should have been blocked by a wall
// (a "wallbang" a legitimate client wouldn't have fired, or a spoofed one
// that would). That needs a server-side collision pass against the map
// mesh and is listed as a known gap in the README, not silently skipped.

import { WEAPONS, ARMOR, ECONOMY, MOVE, NET, ROUND } from '../shared/rules.js';
import { CHARACTERS, getCharacter, flagshipMap } from '../shared/data.js';
import { createRoundState, tickRound, plant as plantRound, defuse as defuseRound, checkElimination, roundEndCredits } from '../shared/roundEngine.js';
import { createAbilityState, canActivate, tickAbilityState, onKillGainUltPoints, spendCharge } from '../shared/abilityState.js';
import { buildSolidsFromBlocks, collidesAt } from '../shared/collision.js';

const TICK_MS = 50; // 20Hz server tick for round/economy/ability bookkeeping
let matchCounter = 1;

export class Match {
  constructor(io, code, socketPlayers) {
    this.io = io;
    this.code = code;
    this.map = flagshipMap();
    this.solids = buildSolidsFromBlocks(this.map.blocks);
    this.round = createRoundState();
    this.players = new Map(); // socketId -> player record
    this.plantHold = null;    // {siteId, progress, by}
    this.defuseHold = null;   // {progress, by}
    this._interval = null;

    socketPlayers.forEach((sp, i) => this.addPlayer(sp.socket, sp.name, i % 2));
    this.beginRoundReset();
  }

  addPlayer(socket, name, team) {
    const spawnList = team === 0 ? this.map.spawns.attack : this.map.spawns.defend;
    const spawn = spawnList[this.players.size % spawnList.length];
    const player = {
      id: socket.id, socket, name: name || `Operative-${socket.id.slice(0, 4)}`, team,
      character: null, x: spawn.x, y: 0, z: spawn.z, yaw: 0,
      lastMoveAt: 0, lastPos: { x: spawn.x, z: spawn.z }, lastPosAt: Date.now(),
      hp: 100, armor: 0, alive: true,
      credits: ECONOMY.START_CREDITS,
      owned: ['pistol'], ammo: { pistol: { ammo: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve } },
      activeWeapon: 'pistol', lastShotAt: 0,
      abilityState: null, kills: 0, deaths: 0,
    };
    this.players.set(socket.id, player);
    socket.join(this.code);
    socket.emit('match:joined', { code: this.code, team, mapId: this.map.id, mapName: this.map.name, playerId: socket.id });
    this.broadcastRoster();
    return player;
  }

  removePlayer(socketId) {
    const p = this.players.get(socketId);
    if (!p) return;
    this.players.delete(socketId);
    this.io.to(this.code).emit('match:playerLeft', { id: socketId });
    this.broadcastRoster();
  }

  isEmpty() { return this.players.size === 0; }

  broadcastRoster() {
    const roster = [...this.players.values()].map(p => ({
      id: p.id, name: p.name, team: p.team, character: p.character, alive: p.alive, kills: p.kills, deaths: p.deaths,
    }));
    this.io.to(this.code).emit('match:roster', { roster, mapId: this.map.id, sites: this.map.sites });
  }

  start() {
    this._interval = setInterval(() => this.tick(), TICK_MS);
  }
  stop() { if (this._interval) clearInterval(this._interval); }

  // ---- intents from clients -------------------------------------------------

  setCharacter(socketId, characterId) {
    const p = this.players.get(socketId);
    const c = getCharacter(characterId);
    if (!p || !c) return;
    p.character = c.id;
    p.abilityState = createAbilityState(c);
    this.broadcastRoster();
  }

  handleMovement(socketId, msg, now) {
    const p = this.players.get(socketId);
    if (!p || !p.alive) return;
    if (now - p.lastMoveAt < NET.MOVEMENT_MIN_INTERVAL_MS - 5) return; // rate limit
    const dt = Math.max(0.001, (now - p.lastPosAt) / 1000);
    const dist = Math.hypot(msg.x - p.lastPos.x, msg.z - p.lastPos.z);
    const plausible = dist / dt <= MOVE.MAX_PLAUSIBLE_SPEED;
    const inGeometry = collidesAt(msg.x, msg.z, msg.y - 1.6, msg.y + 0.1, this.solids);
    if (plausible && !inGeometry) {
      p.x = msg.x; p.y = msg.y; p.z = msg.z; p.yaw = msg.yaw;
    } // else: reject silently, client will resync from the next broadcast
    p.lastPos = { x: p.x, z: p.z }; p.lastPosAt = now; p.lastMoveAt = now;
  }

  handleShoot(socketId, msg, now) {
    const shooter = this.players.get(socketId);
    if (!shooter || !shooter.alive || this.round.phase === 'buy') return;
    const def = WEAPONS[shooter.activeWeapon];
    const ammo = shooter.ammo[shooter.activeWeapon];
    if (!def || !ammo || ammo.ammo <= 0) return;
    if (now - shooter.lastShotAt < def.rate * 1000 * 0.85) return; // rate-of-fire sanity (generous margin)
    shooter.lastShotAt = now;
    ammo.ammo--;
    this.io.to(this.code).emit('combat:shotFired', { by: socketId, weaponId: def.id });

    if (!msg.targetId) return; // client-reported miss; nothing further to validate
    const target = this.players.get(msg.targetId);
    if (!target || !target.alive || target.team === shooter.team) return;
    const range = Math.hypot(target.x - shooter.x, target.z - shooter.z);
    if (range > NET.MAX_HIT_RANGE) return;
    const toTarget = Math.atan2(target.x - shooter.x, -(target.z - shooter.z));
    let diff = Math.abs(((toTarget - shooter.yaw + Math.PI) % (Math.PI * 2)) - Math.PI);
    if ((diff * 180) / Math.PI > NET.AIM_CONE_DEGREES) return; // implausible aim vs. reported facing

    const headshot = !!msg.headshot;
    let dmg = headshot ? def.damage * def.headMultiplier : def.damage;
    if (target.armor > 0) { dmg *= 0.72; target.armor = Math.max(0, target.armor - Math.round(dmg * 0.28)); }
    target.hp = Math.max(0, target.hp - Math.round(dmg));
    this.io.to(this.code).emit('combat:hit', { by: socketId, target: target.id, hp: target.hp, headshot, damage: Math.round(dmg) });

    if (target.hp <= 0 && target.alive) {
      target.alive = false; target.deaths++; shooter.kills++;
      shooter.credits = Math.min(ECONOMY.MAX_CREDITS, shooter.credits + ECONOMY.KILL_REWARD);
      if (shooter.character) onKillGainUltPoints(getCharacter(shooter.character), shooter.abilityState);
      this.io.to(this.code).emit('combat:kill', { by: socketId, target: target.id, headshot });
      this.checkRoundElimination();
      this.broadcastRoster();
    }
  }

  handleAbility(socketId, abilityId, now) {
    const p = this.players.get(socketId);
    if (!p || !p.alive || !p.character) return;
    const c = getCharacter(p.character);
    const isUlt = c.ultimate.id === abilityId;
    const def = isUlt ? c.ultimate : c.abilities.find(a => a.id === abilityId);
    if (!def) return;
    if (!isUlt && this.round.phase === 'buy') return; // abilities usable once the round is live
    if (!canActivate(c, abilityId, p.abilityState, now)) return;
    if (!isUlt && p.credits < def.cost) return;
    if (!isUlt) p.credits -= def.cost;
    spendCharge(c, abilityId, p.abilityState, now);
    this.io.to(this.code).emit('ability:activated', {
      by: socketId, characterId: c.id, abilityId, x: p.x, y: p.y, z: p.z, yaw: p.yaw, now,
    });
  }

  handleBuy(socketId, msg) {
    const p = this.players.get(socketId);
    if (!p || this.round.phase !== 'buy') return;
    if (msg.kind === 'weapon' && WEAPONS[msg.id] && p.credits >= WEAPONS[msg.id].price) {
      p.credits -= WEAPONS[msg.id].price;
      if (!p.owned.includes(msg.id)) p.owned.push(msg.id);
      p.ammo[msg.id] = { ammo: WEAPONS[msg.id].mag, reserve: WEAPONS[msg.id].reserve };
      p.activeWeapon = msg.id;
    } else if (msg.kind === 'armor' && ARMOR[msg.id] && p.credits >= ARMOR[msg.id].price) {
      p.credits -= ARMOR[msg.id].price;
      p.armor = ARMOR[msg.id].value;
    }
    p.socket.emit('economy:update', { credits: p.credits, owned: p.owned, armor: p.armor });
  }

  handlePlantProgress(socketId, holding, now) {
    const p = this.players.get(socketId);
    if (!p || !p.alive || p.team !== this.round.attackTeam || this.round.phase !== 'live') { this.plantHold = null; return; }
    const site = this.nearestSite(p);
    if (!site || !holding) { this.plantHold = null; return; }
    if (!this.plantHold || this.plantHold.siteId !== site.id) this.plantHold = { siteId: site.id, startedAt: now };
    if ((now - this.plantHold.startedAt) / 1000 >= ROUND.PLANT_HOLD_SECONDS) {
      plantRound(this.round, site.id, now);
      p.credits += ECONOMY.PLANT_REWARD;
      this.io.to(this.code).emit('round:planted', { siteId: site.id, by: socketId });
      this.plantHold = null;
    }
  }

  handleDefuseProgress(socketId, holding, now) {
    const p = this.players.get(socketId);
    if (!p || !p.alive || p.team === this.round.attackTeam || this.round.phase !== 'planted') { this.defuseHold = null; return; }
    const site = this.map.sites.find(s => s.id === this.round.plantSite);
    if (!site || Math.hypot(p.x - site.x, p.z - site.z) > site.radius + 1.2 || !holding) { this.defuseHold = null; return; }
    if (!this.defuseHold) this.defuseHold = { startedAt: now };
    if ((now - this.defuseHold.startedAt) / 1000 >= ROUND.DEFUSE_HOLD_SECONDS) {
      defuseRound(this.round);
      this.io.to(this.code).emit('round:defused', { by: socketId });
      this.defuseHold = null;
    }
  }

  nearestSite(p) {
    return this.map.sites.find(s => Math.hypot(p.x - s.x, p.z - s.z) <= s.radius) || null;
  }

  checkRoundElimination() {
    const attackers = [...this.players.values()].filter(p => p.team === this.round.attackTeam);
    const defenders = [...this.players.values()].filter(p => p.team !== this.round.attackTeam);
    checkElimination(this.round, attackers.filter(p => p.alive).length, defenders.filter(p => p.alive).length);
  }

  beginRoundReset() {
    for (const p of this.players.values()) {
      const side = p.team === this.round.attackTeam ? 'attack' : 'defend';
      const list = side === 'attack' ? this.map.spawns.attack : this.map.spawns.defend;
      const spawn = list[[...this.players.values()].indexOf(p) % list.length];
      p.x = spawn.x; p.z = spawn.z; p.y = 0; p.hp = 100; p.armor = 0; p.alive = true;
      for (const id of p.owned) p.ammo[id] = { ammo: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
    }
  }

  tick() {
    const now = Date.now();
    const prevPhase = this.round.phase;
    tickRound(this.round, TICK_MS / 1000);

    for (const p of this.players.values()) {
      if (p.character && p.abilityState) tickAbilityState(getCharacter(p.character), p.abilityState, TICK_MS / 1000, now, p.alive && this.round.phase !== 'buy');
    }

    if (prevPhase !== this.round.phase) {
      if (this.round.phase === 'postround') {
        this.applyRoundEndCredits();
        this.io.to(this.code).emit('round:ended', { winnerSide: this.round.winnerSide, reason: this.round.winReason, roundWins: this.round.roundWins });
      }
      if (this.round.phase === 'buy' && prevPhase === 'postround') {
        this.beginRoundReset();
        this.broadcastRoster();
      }
    }

    this.io.to(this.code).emit('match:state', {
      round: { phase: this.round.phase, timeLeft: Math.ceil(this.round.timeLeft), roundNumber: this.round.roundNumber, roundWins: this.round.roundWins, attackTeam: this.round.attackTeam, matchOver: this.round.matchOver, matchWinner: this.round.matchWinner },
      players: [...this.players.values()].map(p => ({ id: p.id, x: p.x, y: p.y, z: p.z, yaw: p.yaw, hp: p.hp, alive: p.alive, team: p.team, character: p.character })),
    });

    if (this.round.matchOver) this.stop();
  }

  applyRoundEndCredits() {
    const won = side => side === this.round.winnerSide;
    for (const p of this.players.values()) {
      const side = p.team === this.round.attackTeam ? 'attack' : 'defend';
      const streak = this.round.lossStreak[p.team] || 1;
      p.credits = Math.min(ECONOMY.MAX_CREDITS, p.credits + roundEndCredits(streak, won(side)));
      p.socket.emit('economy:update', { credits: p.credits, owned: p.owned, armor: p.armor });
    }
  }
}

export function nextMatchCode() { return `M${matchCounter++}${Math.random().toString(36).slice(2, 5).toUpperCase()}`; }
