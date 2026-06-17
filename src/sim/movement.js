// movement.js — swim kinematics, drag, stamina.
//
// Pure functions that mutate a player record in place. "Feel" comes entirely
// from tunables, not from a physics engine. Kept deterministic (no Math.random,
// no Date) so the sim can be replayed and, later, run authoritatively.

import { TUNABLES } from '../config/tunables.js';

// Advance one player by dt seconds given a normalized move vector and sprint flag.
export function stepPlayer(player, move, sprint, dt, pool) {
  const T = TUNABLES.swim;
  const S = TUNABLES.stamina;

  // --- Stamina gate: sprinting needs stamina, and drains it. ---
  const wantsSprint = sprint && player.stamina > S.minToSprint;
  if (wantsSprint) {
    player.stamina = Math.max(0, player.stamina - S.sprintDrain * dt);
  } else {
    player.stamina = Math.min(S.max, player.stamina + S.regen * dt);
  }
  player.sprinting = wantsSprint && (move.x !== 0 || move.z !== 0);

  const maxSpeed = player.sprinting ? T.sprintMaxSpeed : T.maxSpeed;
  const accel = player.sprinting ? T.sprintAccel : T.accel;

  // --- Apply input acceleration. ---
  const mag = Math.hypot(move.x, move.z);
  if (mag > T.deadzone) {
    const nx = move.x / mag;
    const nz = move.z / mag;
    player.vx += nx * accel * dt;
    player.vz += nz * accel * dt;
  }

  // --- Drag (exponential damping — frame-rate independent). ---
  const damp = Math.exp(-T.drag * dt);
  player.vx *= damp;
  player.vz *= damp;

  // --- Clamp to max speed. ---
  const sp = Math.hypot(player.vx, player.vz);
  if (sp > maxSpeed) {
    const k = maxSpeed / sp;
    player.vx *= k;
    player.vz *= k;
  }
  player.speed = Math.hypot(player.vx, player.vz);

  // --- Integrate position. ---
  player.x += player.vx * dt;
  player.z += player.vz * dt;

  // --- Heading chases the velocity direction (smooth turn). ---
  if (player.speed > 0.2) {
    const target = Math.atan2(player.vz, player.vx);
    player.heading = turnToward(player.heading, target, T.turnRate * dt);
  }

  // --- Keep the swimmer inside the field of play. ---
  clampToPool(player, pool);
}

function clampToPool(player, pool) {
  const halfL = pool.length / 2;
  const halfW = pool.width / 2;
  const r = 0.5; // swimmer radius
  if (player.x < -halfL + r) { player.x = -halfL + r; if (player.vx < 0) player.vx = 0; }
  if (player.x > halfL - r) { player.x = halfL - r; if (player.vx > 0) player.vx = 0; }
  if (player.z < -halfW + r) { player.z = -halfW + r; if (player.vz < 0) player.vz = 0; }
  if (player.z > halfW - r) { player.z = halfW - r; if (player.vz > 0) player.vz = 0; }
}

// Rotate `from` toward `to` by at most `maxStep` radians, wrapping correctly.
function turnToward(from, to, maxStep) {
  let diff = ((to - from + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  if (Math.abs(diff) <= maxStep) return to;
  return from + Math.sign(diff) * maxStep;
}
