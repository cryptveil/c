// public/src/player.js
// First-person movement and physics. Two real fixes over prototype v0.1:
//  1. Crouch now actually lowers the eye height and shrinks the vertical
//     hitbox (the old version only slowed movement speed -- the camera
//     never moved and you couldn't duck under anything).
//  2. Collision is height-aware via shared/collision.js, so players can
//     walk up onto crates/platforms and duck under overhangs instead of
//     every solid acting like a floor-to-ceiling wall.

import { MOVE } from '../../shared/rules.js';
import { collidesAt, groundHeightAt } from '../../shared/collision.js';

export function createPlayer(x, z) {
  return {
    x, z, y: MOVE.EYE_STAND, yaw: 0, pitch: 0,
    velY: 0, onGround: true, crouch: false, crouchLerp: 0,
    eyeHeight: MOVE.EYE_STAND,
    speedBoostUntil: 0, speedBoostMult: 1,
    fireRateMult: 1, reloadSpeedMult: 1,
    intangibleUntil: 0,
  };
}

// Returns {dx, dz} world-space movement for this frame, already collision
// resolved against `solids`. Does not mutate player.x/z itself so callers
// (offline sim vs. networked prediction) can decide how to apply it.
export function stepMovement(player, keys, dt, solids, now) {
  player.crouch = !!keys.ControlLeft || !!keys.ControlRight;
  const crouchTarget = player.crouch ? 1 : 0;
  player.crouchLerp += (crouchTarget - player.crouchLerp) * Math.min(1, dt * 10);
  player.eyeHeight = MOVE.EYE_STAND + (MOVE.EYE_CROUCH - MOVE.EYE_STAND) * player.crouchLerp;

  let speed = (keys.ShiftLeft || keys.ShiftRight) ? MOVE.WALK_SPEED : MOVE.RUN_SPEED;
  if (player.crouch) speed *= MOVE.CROUCH_MULT;
  if (now < player.speedBoostUntil) speed *= player.speedBoostMult;

  const f = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
  const r = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  const len = Math.hypot(f, r) || 1;
  const fn = f / len, rn = r / len;
  let dx = (Math.sin(player.yaw) * fn + Math.cos(player.yaw) * rn) * speed * dt;
  let dz = (-Math.cos(player.yaw) * fn + Math.sin(player.yaw) * rn) * speed * dt;

  const feetY = player.y - player.eyeHeight;
  const headY = player.y + 0.12;

  if (!collidesAt(player.x + dx, player.z, feetY, headY, solids)) player.x += dx; else dx = 0;
  if (!collidesAt(player.x, player.z + dz, feetY, headY, solids)) player.z += dz; else dz = 0;

  const ground = groundHeightAt(player.x, player.z, solids, 0);
  if (player.onGround && keys.Space) { player.velY = MOVE.JUMP_VELOCITY; player.onGround = false; }
  player.velY -= MOVE.GRAVITY * dt;
  player.y += player.velY * dt;
  const restY = ground + player.eyeHeight;
  if (player.y <= restY) { player.y = restY; player.velY = 0; player.onGround = true; }
  else player.onGround = false;

  return { dx, dz, ground };
}
