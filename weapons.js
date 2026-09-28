// public/src/weapons.js
// Shooting, reload, and recoil. Prototype v0.1 had spread (random jitter per
// shot) but no actual recoil -- the "kick" only animated the gun mesh, it
// never affected where the shot landed or where the camera pointed. This
// adds real vertical recoil (nudges aim pitch, recovers over time) and
// bloom (spread grows with sustained fire, same as most tactical shooters).

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { WEAPONS } from '../../shared/rules.js';

const ORDER = ['pistol', 'kite', 'vx9'];

export function createLoadout(ownedIds) {
  const owned = ownedIds && ownedIds.length ? ownedIds : ['pistol'];
  const state = {};
  for (const id of owned) {
    const def = WEAPONS[id];
    state[id] = { id, ammo: def.mag, reserve: def.reserve };
  }
  return { owned: owned.slice(), ammoState: state, index: 0, reloadUntil: 0, lastShot: 0, bloom: 0, recoilPitch: 0 };
}

export function currentWeapon(loadout) {
  const id = loadout.owned[loadout.index];
  return { def: WEAPONS[id], ammo: loadout.ammoState[id] };
}

export function switchWeapon(loadout, slotIndex) {
  if (slotIndex < 0 || slotIndex >= loadout.owned.length) return;
  if (performance.now() < loadout.reloadUntil) return;
  loadout.index = slotIndex;
  loadout.bloom = 0;
}

export function startReload(loadout, now, onDone) {
  const { def, ammo } = currentWeapon(loadout);
  if (now < loadout.reloadUntil || ammo.ammo >= def.mag || ammo.reserve <= 0) return false;
  loadout.reloadUntil = now + 1250;
  setTimeout(() => {
    const n = Math.min(def.mag - ammo.ammo, ammo.reserve);
    ammo.ammo += n; ammo.reserve -= n;
    onDone && onDone();
  }, 1250);
  return true;
}

// Applies recoil/bloom decay for frames where the player isn't firing.
export function decayRecoil(loadout, dt) {
  loadout.bloom = Math.max(0, loadout.bloom - dt * 1.6);
  loadout.recoilPitch *= Math.max(0, 1 - dt * 6);
}

// Attempts to fire. `blockers` = { spheres:[{x,y,z,radius}], meshes:[Object3D] }
// for smoke (sphere check) and walls (raycast-blocking mesh) respectively --
// shots that hit either are absorbed before reaching any player/bot target.
// Returns {fired, hit} where hit is {kind:'bot'|'player', ref, headshot, damage} or null.
export function tryShoot(loadout, camera, now, fireRateMult, candidates, blockers = { spheres: [], meshes: [] }) {
  const { def, ammo } = currentWeapon(loadout);
  if (now < loadout.reloadUntil) return { fired: false };
  if (now - loadout.lastShot < (def.rate * 1000) / Math.max(0.2, fireRateMult)) return { fired: false };
  if (ammo.ammo <= 0) { startReload(loadout, now); return { fired: false }; }

  ammo.ammo--;
  loadout.lastShot = now;
  loadout.bloom = Math.min(1, loadout.bloom + 0.16);
  loadout.recoilPitch += 0.014 + loadout.bloom * 0.01;

  const spread = def.spread * (1 + loadout.bloom * 1.8);
  const ray = new THREE.Raycaster();
  ray.far = 80;
  ray.setFromCamera(new THREE.Vector2((Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread), camera);

  const meshes = [];
  for (const c of candidates) {
    c.object.traverse(o => { if (o.isMesh) { o.userData.__owner = c; meshes.push(o); } });
  }
  for (const m of blockers.meshes) { m.userData.__blocker = true; meshes.push(m); }
  const hits = ray.intersectObjects(meshes, false);

  let blockDist = Infinity;
  for (const s of blockers.spheres) {
    const d = raySphereDistance(ray, s);
    if (d !== null && d < blockDist) blockDist = d;
  }

  let hit = null;
  if (hits.length && hits[0].distance < blockDist) {
    if (!hits[0].object.userData.__blocker) {
      const owner = hits[0].object.userData.__owner;
      if (owner) {
        const headshot = hits[0].object === owner.headMesh;
        const damage = headshot ? def.damage * def.headMultiplier : def.damage;
        hit = { kind: owner.kind, ref: owner.ref, headshot, damage };
      }
    } // else: absorbed by a wall mesh, hit stays null
  }
  return { fired: true, hit, weaponId: def.id };
}

function raySphereDistance(ray, s) {
  const oc = ray.ray.origin.clone().sub(new THREE.Vector3(s.x, s.y ?? 1.2, s.z));
  const b = oc.dot(ray.ray.direction);
  const c = oc.dot(oc) - s.radius * s.radius;
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t > 0 ? t : (-b + Math.sqrt(disc) > 0 ? 0 : null);
}
