// public/src/abilities.js
// Ability charge/cooldown tracking and the actual gameplay effects (smoke
// that blocks vision+bullets, walls that block movement, tripwires, recon
// pulses, flashes, dashes, buffs). Only Vesper and Warden are implemented --
// this is the real thing for those two, not a stub, but it is only two of
// the eventual roster.
//
// Known simplification, documented rather than hidden: flash blind and
// recon reveal use a straight-line facing/distance check, not a full
// raycast against level geometry, so they don't yet correctly stop at a
// wall between the effect and the target. Smoke and walls DO block real
// gunfire (they're wired into the raycast/collision systems), which is the
// mechanically important part.

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { createAbilityState, canActivate, tickAbilityState, onKillGainUltPoints, spendCharge } from '../../shared/abilityState.js';

export { createAbilityState, canActivate, tickAbilityState, onKillGainUltPoints, spendCharge };

function disposeEffect(e) {
  if (e.mesh && e.mesh.parent) e.mesh.parent.remove(e.mesh);
}

// Effects (smoke/wall/trip/recon/etc, tracked separately from charge state
// since only the client renders them) expire on their own tick pass.
export function tickEffects(state, now) {
  state.effects = state.effects.filter(e => {
    if (now > e.expiresAt) { disposeEffect(e); return false; }
    return true;
  });
}

// Applies the actual world effect. `ctx` = { scene, dynamicSolids, blockers,
// player, loadout, origin:{x,y,z,yaw}, now, color }. Returns an effect
// record (or null for instant self-only effects with nothing to render).
export function applyAbilityEffect(character, abilityId, ctx) {
  const { scene, dynamicSolids, blockers, player, loadout, origin, now, color } = ctx;
  const isUlt = character.ultimate.id === abilityId;
  const def = isUlt ? character.ultimate : character.abilities.find(a => a.id === abilityId);

  switch (abilityId) {
    case 'dash': case 'phase': {
      const dist = def.distance;
      player.x += Math.sin(origin.yaw) * dist;
      player.z += -Math.cos(origin.yaw) * dist;
      if (abilityId === 'dash') { player.speedBoostUntil = now + def.boostMs; player.speedBoostMult = 1.6; }
      else { player.intangibleUntil = now + 500; }
      return null;
    }
    case 'boost': {
      loadout.fireRateBoostUntil = now + def.durationMs;
      player.reloadSpeedMult = 1.5;
      setTimeout(() => { player.reloadSpeedMult = 1; }, def.durationMs);
      return null;
    }
    case 'overdrive': {
      player.speedBoostUntil = now + def.durationMs; player.speedBoostMult = 1.35;
      loadout.fireRateBoostUntil = now + def.durationMs;
      return { type: 'overdrive', expiresAt: now + def.durationMs, reveal: true };
    }
    case 'flash': {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      mesh.position.set(origin.x + Math.sin(origin.yaw) * 6, 1.2, origin.z - Math.cos(origin.yaw) * 6);
      scene.add(mesh);
      const rec = { type: 'flash', mesh, expiresAt: now + def.fuseMs + 50, detonateAt: now + def.fuseMs, radius: def.radius, detonated: false, pos: { x: mesh.position.x, z: mesh.position.z } };
      return rec;
    }
    case 'smoke': {
      const pos = { x: origin.x + Math.sin(origin.yaw) * 6, y: 1.2, z: origin.z - Math.cos(origin.yaw) * 6 };
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(def.radius, 16, 16), new THREE.MeshBasicMaterial({ color: 0xcfd8dc, transparent: true, opacity: 0.55 }));
      mesh.position.set(pos.x, pos.y, pos.z);
      scene.add(mesh);
      const blocker = { x: pos.x, z: pos.z, radius: def.radius };
      blockers.push(blocker);
      return { type: 'smoke', mesh, expiresAt: now + def.durationMs, blocker, blockers };
    }
    case 'wall': {
      const cx = origin.x + Math.sin(origin.yaw) * 4, cz = origin.z - Math.cos(origin.yaw) * 4;
      const block = { x: cx, y: def.height / 2, z: cz, sx: def.width, sy: def.height, sz: 0.6, ymin: 0, ymax: def.height, hx: def.width / 2, hz: 0.3 };
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(def.width, def.height, 0.6), new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.75 }));
      mesh.position.set(cx, def.height / 2, cz);
      mesh.rotation.y = origin.yaw;
      scene.add(mesh);
      dynamicSolids.push(block);
      return { type: 'wall', mesh, expiresAt: now + def.durationMs, dynamicSolids, block };
    }
    case 'trip': {
      const cx = origin.x + Math.sin(origin.yaw) * 5, cz = origin.z - Math.cos(origin.yaw) * 5;
      const mesh = new THREE.Mesh(new THREE.TorusGeometry(def.radius, 0.03, 6, 16), new THREE.MeshBasicMaterial({ color: 0xff5265 }));
      mesh.rotation.x = Math.PI / 2; mesh.position.set(cx, 0.1, cz);
      scene.add(mesh);
      return { type: 'trip', mesh, expiresAt: now + def.durationMs, pos: { x: cx, z: cz }, radius: def.radius, slowMs: def.slowMs, triggered: false };
    }
    case 'recon': {
      const cx = origin.x + Math.sin(origin.yaw) * 6, cz = origin.z - Math.cos(origin.yaw) * 6;
      const mesh = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.5, 8), new THREE.MeshStandardMaterial({ color }));
      mesh.position.set(cx, 0.3, cz);
      scene.add(mesh);
      return { type: 'recon', mesh, expiresAt: now + def.durationMs, pos: { x: cx, z: cz }, radius: def.radius, pulseMs: def.pulseMs, lastPulse: 0 };
    }
    case 'lockdown': {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(def.radius, def.radius, 3, 24), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18 }));
      mesh.position.set(origin.x, 1.5, origin.z);
      scene.add(mesh);
      return { type: 'lockdown', mesh, expiresAt: now + def.durationMs, pos: { x: origin.x, z: origin.z }, radius: def.radius };
    }
    default: return null;
  }
}

// Called every frame with a list of enemy state objects {x,z,yaw,markRevealed(ms),markSlowed(ms)}
// so persistent effects (flash detonation, tripwire trigger, recon pulses,
// lockdown zone) can act on whoever is nearby right now.
export function processEffectsAgainstEnemies(state, enemies, now, localPlayerView) {
  for (const e of state.effects) {
    if (e.type === 'flash' && !e.detonated && now >= e.detonateAt) {
      e.detonated = true;
      for (const en of enemies) {
        const d = Math.hypot(en.x - e.pos.x, en.z - e.pos.z);
        if (d < e.radius) {
          const toFlash = Math.atan2(e.pos.x - en.x, -(e.pos.z - en.z));
          let diff = Math.abs(((toFlash - en.yaw + Math.PI) % (Math.PI * 2)) - Math.PI);
          if (diff < Math.PI * 0.6) en.markBlinded(1800 * (1 - d / e.radius) + 400);
        }
      }
      if (localPlayerView) {
        const d = Math.hypot(localPlayerView.x - e.pos.x, localPlayerView.z - e.pos.z);
        if (d < e.radius) localPlayerView.markBlinded(1800 * (1 - d / e.radius) + 400);
      }
    }
    if (e.type === 'trip') {
      for (const en of enemies) {
        if (Math.hypot(en.x - e.pos.x, en.z - e.pos.z) < e.radius + 0.6) {
          en.markRevealed(3000); en.markSlowed(e.slowMs);
        }
      }
    }
    if (e.type === 'recon' && now - e.lastPulse > e.pulseMs) {
      e.lastPulse = now;
      for (const en of enemies) if (Math.hypot(en.x - e.pos.x, en.z - e.pos.z) < e.radius) en.markRevealed(e.pulseMs);
    }
    if (e.type === 'lockdown') {
      for (const en of enemies) if (Math.hypot(en.x - e.pos.x, en.z - e.pos.z) < e.radius) { en.markRevealed(300); en.markSlowed(300); }
    }
  }
}
