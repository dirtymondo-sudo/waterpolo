// step.js — the heart of the architecture.
//
//   step(state, commands, dt) -> state
//
// Advances the authoritative simulation by exactly `dt` seconds at a FIXED rate
// (TUNABLES.sim.hz) from an accumulator, so behaviour is reproducible and
// frame-rate independent. `commands` maps playerId -> command (input/commands.js)
// for human-controlled players; every other player is driven by AI that emits
// the SAME command shape, so both paths share all the action code below.

import { TUNABLES } from '../config/tunables.js';
import { stepPlayer } from './movement.js';
import { computeAICommand } from './ai.js';
import { updateBall, tryPickup, trySteal, launchShot, launchPass } from './ball.js';
import {
  updateReferee,
  tickSwimOff,
  tickGoalPause,
  tickPeriodEnd,
} from './rules/referee.js';

export function step(state, commands, dt) {
  // Frozen phases: only their countdown advances.
  if (state.phase === 'goal') return advance(state, dt, () => tickGoalPause(state, dt));
  if (state.phase === 'periodEnd') return advance(state, dt, () => tickPeriodEnd(state, dt));
  if (state.phase === 'fullTime') return advance(state, dt, null);

  // Live phases ('play' and 'swimOff'): build an effective command per player.
  const eff = {};
  for (const p of state.players) {
    eff[p.id] = p.controlled && commands[p.id] ? commands[p.id] : computeAICommand(p, state);
    if (p.stealCooldown > 0) p.stealCooldown = Math.max(0, p.stealCooldown - dt);
  }

  // Manual player switch (Tab): hand control to the team-0 field player nearest
  // the ball — useful for going to defend/steal.
  for (const p of state.players) {
    if (p.controlled && eff[p.id] && eff[p.id].switchPlayer) {
      switchControl(state);
      break;
    }
  }

  // 1. Move everyone.
  for (const p of state.players) {
    stepPlayer(p, eff[p.id].move, eff[p.id].sprint, dt, state.pool);
  }

  // 2. Ball actions (charge/shoot, pass, steal) for all players.
  resolveActions(state, eff, dt);

  // 3. Advance the ball, then settle possession (pickups, saves, steals).
  updateBall(state, dt);
  tryPickup(state);

  // 4. Auto-switch the human's control to whoever on team 0 holds the ball.
  updateControl(state);

  // 5. Swim-off whistle / in-play referee (clocks, goals, periods).
  if (state.phase === 'swimOff') tickSwimOff(state, dt);
  else updateReferee(state, dt);

  state.tick += 1;
  state.time += dt;
  return state;
}

function advance(state, dt, fn) {
  if (fn) fn();
  state.tick += 1;
  state.time += dt;
  return state;
}

function resolveActions(state, eff, dt) {
  const b = state.ball;
  for (const p of state.players) {
    const cmd = eff[p.id];
    const holdsBall = b.held && b.ownerId === p.id;

    if (holdsBall) {
      if (cmd.pass) {
        launchPass(state, p);
        clearCharge(p);
      } else if (cmd.shootType) {
        p.chargeType = cmd.shootType;
        p.charge = Math.min(p.charge + dt, TUNABLES.shot.chargeTime);
      } else if (p.chargeType) {
        launchShot(state, p, p.chargeType, p.charge / TUNABLES.shot.chargeTime);
        clearCharge(p);
      }
    } else {
      clearCharge(p);
      // Context-sensitive defence: a shoot/steal press without the ball strips
      // a nearby carrier (the steal itself is rate-limited per player).
      if (cmd.steal || cmd.shootType) trySteal(state, p);
    }
  }
}

function clearCharge(p) {
  p.charge = 0;
  p.chargeType = null;
}

function updateControl(state) {
  const b = state.ball;
  if (!b.held) return;
  const holder = state.players.find((p) => p.id === b.ownerId);
  if (!holder || holder.team !== 0) return;
  for (const p of state.players) p.controlled = p === holder;
}

function switchControl(state) {
  const b = state.ball;
  const field = state.players.filter((p) => p.team === 0 && p.role === 'field');
  if (!field.length) return;
  field.sort((a, c) => Math.hypot(a.x - b.x, a.z - b.z) - Math.hypot(c.x - b.x, c.z - b.z));
  for (const p of state.players) p.controlled = false;
  field[0].controlled = true;
}
