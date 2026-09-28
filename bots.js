// public/src/bots.js
// Practice-mode bot AI. Used only offline/vs-bots -- online matches are
// player vs player. Kept intentionally simple (state machine: patrol, chase,
// engage) rather than claiming any advanced tactical behaviour.

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { collidesAt, groundHeightAt } from '../../shared/collision.js';
import { updateBotAnimation, markBotHit } from './animation.js';

export function spawnBot(scene, x, z, color, team) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 1.15, 4, 8), new THREE.MeshStandardMaterial({ color }));
  body.position.y = 1.0; body.castShadow = true; group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 12), new THREE.MeshStandardMaterial({ color: 0xe7c9a9 }));
  head.position.y = 1.75; head.castShadow = true; group.add(head);
  group.position.set(x, 0, z);
  scene.add(group);
  return {
    object: group, body, headMesh: head, kind: 'bot', team,
    x, z, y: 0, yaw: Math.random() * Math.PI * 2,
    hp: 100, alive: true, state: 'patrol', target: null,
    nextDecision: 0, wanderTarget: null, ref: null,
  };
}

export function updateBot(bot, dt, now, solids, playerPos, canSeePlayer) {
  if (!bot.alive) { updateBotAnimation(bot, dt, now); return; }
  bot.ref = bot;
  if (now > bot.nextDecision) {
    bot.nextDecision = now + 600 + Math.random() * 900;
    if (canSeePlayer) { bot.state = 'engage'; }
    else if (bot.state !== 'engage' || Math.random() < 0.3) {
      bot.state = 'patrol';
      bot.wanderTarget = { x: (Math.random() - 0.5) * 34, z: (Math.random() - 0.5) * 34 };
    }
  }

  const target = bot.state === 'engage' ? playerPos : bot.wanderTarget;
  if (target) {
    const dx = target.x - bot.x, dz = target.z - bot.z;
    const dist = Math.hypot(dx, dz);
    bot.yaw = Math.atan2(dx, -dz);
    if (dist > (bot.state === 'engage' ? 6 : 0.6)) {
      const speed = (bot.state === 'engage' ? 3.4 : 2.0) * dt;
      const nx = bot.x + (dx / dist) * speed, nz = bot.z + (dz / dist) * speed;
      const feetY = bot.y, headY = bot.y + 1.7;
      if (!collidesAt(nx, bot.z, feetY, headY, solids)) bot.x = nx;
      if (!collidesAt(bot.x, nz, feetY, headY, solids)) bot.z = nz;
    }
  }
  bot.y = groundHeightAt(bot.x, bot.z, solids, 0);
  bot.object.position.set(bot.x, bot.y, bot.z);
  bot.object.rotation.y = bot.yaw;
  updateBotAnimation(bot, dt, now);
}

export function damageBot(bot, dmg) {
  markBotHit(bot);
  bot.hp = Math.max(0, bot.hp - dmg);
  if (bot.hp <= 0 && bot.alive) { bot.alive = false; bot.deathT = 0.001; bot.state = 'dead'; bot.object.visible = true; return true; }
  return false;
}

export function respawnBot(bot, x, z) {
  bot.hp = 100; bot.alive = true; bot.deathT = 0; bot.x = x; bot.z = z; bot.object.visible = true; bot.object.rotation.set(0, bot.yaw, 0); bot.object.position.set(x, 0, z);
}
