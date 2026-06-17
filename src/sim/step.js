// step.js — the heart of the architecture.
//
//   step(state, commands, dt) -> state
//
// Advances the authoritative simulation by exactly `dt` seconds. Called at a
// FIXED rate (TUNABLES.sim.hz) from an accumulator so behaviour is independent
// of render frame rate and reproducible. `commands` is a map of playerId ->
// command object (see input/commands.js) — the exact shape that will travel
// over the wire for multiplayer.
//
// Per tick: move everyone (human + AI) -> resolve the human's ball actions ->
// advance the ball -> pickups/saves -> auto-switch control -> referee.

import { TUNABLES } from '../config/tunables.js';
import { stepPlayer } from './movement.js';
import { computeAIMove } from './ai.js';
import { updateBall, tryPickup, launchShot, launchPass } from './ball.js';
import { updateReferee, tickGoalPause } from './rules/referee.js';

export function step(state, commands, dt) {
  // During the post-goal celebration everything is frozen but the pause clock.
  if (state.phase === 'goal') {
    tickGoalPause(state, dt);
    state.tick += 1;
    state.time += dt;
    return state;
  }

  // 1. Move all players. Controlled players use their command; the rest use AI.
  for (const player of state.players) {
    const cmd = player.controlled ? commands[player.id] : null;
    const move = cmd ? cmd.move : computeAIMove(player, state);
    const sprint = cmd ? cmd.sprint : false;
    stepPlayer(player, move, sprint, dt, state.pool);
  }

  // 2. Resolve ball actions (charge/shoot/pass) for controlled ball carriers.
  resolveActions(state, commands, dt);

  // 3. Advance the ball, then settle possession (pickups, saves, steals).
  updateBall(state, dt);
  tryPickup(state);

  // 4. Auto-switch the human's control to whoever on team 0 holds the ball.
  updateControl(state);

  // 5. Clocks, goals, restarts.
  updateReferee(state, dt);

  state.tick += 1;
  state.time += dt;
  return state;
}

function resolveActions(state, commands, dt) {
  const b = state.ball;
  for (const p of state.players) {
    if (!p.controlled) continue;
    const cmd = commands[p.id];
    const holdsBall = b.held && b.ownerId === p.id;
    if (!cmd || !holdsBall) {
      p.charge = 0;
      p.chargeType = null;
      continue;
    }

    if (cmd.pass) {
      launchPass(state, p);
      p.charge = 0;
      p.chargeType = null;
    } else if (cmd.shootType) {
      // Hold to charge.
      p.chargeType = cmd.shootType;
      p.charge = Math.min(p.charge + dt, TUNABLES.shot.chargeTime);
    } else if (p.chargeType) {
      // Released this tick -> fire with the accumulated power.
      launchShot(state, p, p.chargeType, p.charge / TUNABLES.shot.chargeTime);
      p.charge = 0;
      p.chargeType = null;
    }
  }
}

function updateControl(state) {
  const b = state.ball;
  if (!b.held) return;
  const holder = state.players.find((p) => p.id === b.ownerId);
  if (!holder || holder.team !== 0) return;
  for (const p of state.players) p.controlled = p === holder;
}
