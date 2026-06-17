// ball.js — ball ballistics, possession, and the three shot launches.
//
// Pure, headless, deterministic (no Math.random / Date). The ball lives in the
// same XZ plane as the players, plus a Y height above the water surface (y=0).
// Air flight uses light drag + a per-shot gravity; once it settles on the water
// it floats with heavy drag. This is the "feel-first, not a physics engine"
// approach the plan calls for.

import { TUNABLES } from '../config/tunables.js';
import { POOL, MATCH } from '../config/rules.js';

const HALF_L = POOL.length / 2;
const HALF_W = POOL.width / 2;

function playerById(state, id) {
  return state.players.find((p) => p.id === id) || null;
}

// --- Per-frame ball update: carry it if held, otherwise fly/float it. --------
export function updateBall(state, dt) {
  const B = TUNABLES.ball;
  const b = state.ball;

  if (b.pickupCooldown > 0) b.pickupCooldown = Math.max(0, b.pickupCooldown - dt);

  if (b.held) {
    const o = playerById(state, b.ownerId);
    if (o) {
      b.x = o.x + Math.cos(o.heading) * B.carryDist;
      b.z = o.z + Math.sin(o.heading) * B.carryDist;
      b.y = B.carryHeight;
      b.vx = o.vx;
      b.vz = o.vz;
      b.vy = 0;
    }
    return;
  }

  // --- Free ball: integrate ballistics. ---
  b.vy -= b.gravity * dt;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.z += b.vz * dt;

  // Surface interaction: skip shots bounce, everything else settles.
  if (b.y <= 0) {
    if (b.bounces > 0 && b.vy < 0) {
      b.y = 0;
      b.vy = -b.vy * b.restitution;
      b.vx *= 0.92;
      b.vz *= 0.92;
      b.bounces -= 1;
    } else {
      b.y = 0;
      b.vy = 0;
      b.inAir = false;
    }
  }

  // Drag: light in the air, heavy once floating.
  const inWater = !b.inAir && b.y <= 0.001;
  const damp = Math.exp(-(inWater ? B.waterDrag : B.airDrag) * dt);
  b.vx *= damp;
  b.vz *= damp;
  if (inWater) {
    b.y = 0;
    b.vy = 0;
  }

  clampBallToPool(b);
}

// Reflect the ball off the pool walls. The goal mouth is left OPEN so a shot on
// target crosses the line (the referee scores it); everything else stays in play.
function clampBallToPool(b) {
  const r = TUNABLES.ball.radius;
  const gw = POOL.goalWidth / 2;
  const gh = POOL.goalHeight;

  if (b.z < -HALF_W + r) { b.z = -HALF_W + r; b.vz = Math.abs(b.vz) * 0.5; }
  if (b.z > HALF_W - r) { b.z = HALF_W - r; b.vz = -Math.abs(b.vz) * 0.5; }

  const inMouth = Math.abs(b.z) < gw && b.y < gh;
  if (!inMouth) {
    if (b.x < -HALF_L + r) { b.x = -HALF_L + r; b.vx = Math.abs(b.vx) * 0.5; }
    if (b.x > HALF_L - r) { b.x = HALF_L - r; b.vx = -Math.abs(b.vx) * 0.5; }
  }
}

// --- Possession: saves, steals of loose balls, and recovery. -----------------
// The nearest eligible player within reach grabs a free, low-enough ball. Goalies
// reach further (that's a save). The last holder is locked out briefly so a shot
// actually leaves rather than snapping back to the shooter.
export function tryPickup(state) {
  const b = state.ball;
  if (b.held || b.locked) return;

  const P = TUNABLES.possession;
  const G = TUNABLES.goalie;
  let best = null;
  let bestDist = Infinity;

  for (const p of state.players) {
    if (p.id === b.lastOwnerId && b.pickupCooldown > 0) continue;
    const reach = p.role === 'goalie' ? G.reach : P.pickupRadius;
    const reachH = p.role === 'goalie' ? G.reachHeight : P.pickupHeight;
    if (b.y > reachH) continue;
    const d = Math.hypot(b.x - p.x, b.z - p.z);
    if (d <= reach && d < bestDist) {
      best = p;
      bestDist = d;
    }
  }

  if (best) grab(state, best);
}

function grab(state, player) {
  const b = state.ball;
  b.held = true;
  b.ownerId = player.id;
  b.lastOwnerId = player.id;
  b.inAir = false;
  b.bounces = 0;
  b.vx = b.vy = b.vz = 0;
  b.gravity = 0;
  state.possession = player.team;
  state.shotClock = MATCH.shotClockSeconds;
}

// Attempt to strip the ball from an opponent carrier. Success (in range, off
// cooldown) knocks it loose toward the stealer for a scramble; either side can
// then recover it. Returns true on a successful strip. Deterministic.
export function trySteal(state, player) {
  const St = TUNABLES.steal;
  if (player.stealCooldown > 0) return false;

  const b = state.ball;
  if (!b.held) return false;
  const holder = playerById(state, b.ownerId);
  if (!holder || holder.team === player.team) return false;

  const dx = player.x - holder.x;
  const dz = player.z - holder.z;
  const d = Math.hypot(dx, dz) || 1;
  if (d > St.range) {
    player.stealCooldown = St.missCooldown; // whiffed
    return false;
  }

  // Knock the ball loose, popping it toward the stealer.
  b.held = false;
  b.ownerId = null;
  b.lastOwnerId = holder.id;
  b.inAir = true;
  b.gravity = TUNABLES.pass.gravity;
  b.bounces = 0;
  b.y = TUNABLES.ball.carryHeight;
  b.vx = (dx / d) * St.knockSpeed;
  b.vz = (dz / d) * St.knockSpeed;
  b.vy = St.knockUp;
  b.pickupCooldown = 0.25; // brief lock so the stripped carrier can't snatch back
  b.shotType = 'loose';
  player.stealCooldown = St.cooldown;
  state.possession = null;
  return true;
}

// --- Launches ---------------------------------------------------------------
function attackSign(team) {
  return team === 0 ? 1 : -1; // team 0 shoots toward +X
}

// Fire a shot in the player's facing direction. `type` selects the trajectory;
// `chargeFrac` (0..1) scales the speed. Aiming is done by orienting the player.
export function launchShot(state, player, type, chargeFrac) {
  const S = TUNABLES.shot;
  const spec = S.types[type] || S.types.normal;
  const b = state.ball;

  const speed = (S.baseSpeed + S.chargeSpeed * clamp01(chargeFrac)) * spec.speed;
  const dirX = Math.cos(player.heading);
  const dirZ = Math.sin(player.heading);

  b.held = false;
  b.ownerId = null;
  b.lastOwnerId = player.id;
  b.pickupCooldown = TUNABLES.possession.shotCooldown;
  b.inAir = true;
  b.gravity = spec.gravity;
  b.bounces = spec.bounces;
  b.restitution = spec.restitution;
  b.shotType = type;

  b.x = player.x + dirX * (TUNABLES.ball.carryDist + 0.1);
  b.z = player.z + dirZ * (TUNABLES.ball.carryDist + 0.1);
  b.y = S.releaseHeight;
  b.vx = dirX * speed;
  b.vz = dirZ * speed;
  b.vy = spec.vy;

  state.possession = null;
}

// Pass to the best teammate: prefer one ahead toward the attack, else nearest.
export function launchPass(state, player) {
  const target = bestPassTarget(state, player);
  if (!target) return;

  const Pa = TUNABLES.pass;
  const b = state.ball;

  // Lead the receiver by their current velocity.
  const tx = target.x + target.vx * Pa.lead;
  const tz = target.z + target.vz * Pa.lead;
  let dx = tx - player.x;
  let dz = tz - player.z;
  const d = Math.hypot(dx, dz) || 1;
  dx /= d;
  dz /= d;

  b.held = false;
  b.ownerId = null;
  b.lastOwnerId = player.id;
  b.pickupCooldown = TUNABLES.possession.shotCooldown;
  b.inAir = true;
  b.gravity = Pa.gravity;
  b.bounces = 0;
  b.restitution = 0;
  b.shotType = 'pass';

  b.x = player.x + dx * (TUNABLES.ball.carryDist + 0.1);
  b.z = player.z + dz * (TUNABLES.ball.carryDist + 0.1);
  b.y = TUNABLES.ball.carryHeight;
  b.vx = dx * Pa.speed;
  b.vz = dz * Pa.speed;
  b.vy = Pa.vy;

  state.possession = null;
}

function bestPassTarget(state, player) {
  const sign = attackSign(player.team);
  let forward = null;
  let forwardScore = Infinity;
  let nearest = null;
  let nearestDist = Infinity;

  for (const p of state.players) {
    if (p === player || p.team !== player.team || p.role === 'goalie') continue;
    const dist = Math.hypot(p.x - player.x, p.z - player.z);
    if (dist < nearestDist) { nearest = p; nearestDist = dist; }
    // Forward = further toward the attacking goal than the passer.
    if ((p.x - player.x) * sign > 0) {
      const score = dist; // closest forward outlet wins
      if (score < forwardScore) { forward = p; forwardScore = score; }
    }
  }
  return forward || nearest;
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
