// ai.js — lightweight steering for the non-controlled players.
//
// Each function returns a MOVE VECTOR (the same {x,z} a human command carries),
// so AI players run through the exact same movement code as the human. The
// vector is the delta toward a target; stepPlayer normalizes it, so a short
// delta near the target naturally eases the player to a stop.
//
// Headless and deterministic. (Single AI file for Milestone 1; splits into
// ai/goalie.js, ai/defense.js, ai/offense.js as behaviours grow — see PLAN §4.)

import { TUNABLES } from '../config/tunables.js';
import { POOL } from '../config/rules.js';

const GOAL_X = POOL.length / 2 - TUNABLES.goalie.lineOffset;

export function computeAIMove(player, state) {
  if (player.role === 'goalie') return goalieMove(player, state);
  return fieldMove(player, state);
}

// Goalie: hold the line in front of its own goal, slide to track the ball's z.
function goalieMove(player, state) {
  const G = TUNABLES.goalie;
  const b = state.ball;
  const ownGoalX = player.team === 0 ? -GOAL_X : GOAL_X;
  const targetZ = clamp(b.z, -G.zClamp, G.zClamp);
  return { x: ownGoalX - player.x, z: targetZ - player.z };
}

// Field player: defenders press the ball; the attacker's teammate gets open.
function fieldMove(player, state) {
  const b = state.ball;
  const holder = b.held ? state.players.find((p) => p.id === b.ownerId) : null;
  const myTeamHasBall = holder ? holder.team === player.team : false;

  if (myTeamHasBall && holder !== player) {
    // Off-ball offence: sit at the home outlet so there's a pass option.
    return { x: player.hx - player.x, z: player.hz - player.z };
  }

  // Defence: press between the ball and our own goal.
  const D = TUNABLES.defense;
  const ownGoalX = player.team === 0 ? -POOL.length / 2 : POOL.length / 2;
  const towardGoal = Math.sign(ownGoalX - b.x) || 1;
  const targetX = b.x + towardGoal * D.pressDist;
  return { x: targetX - player.x, z: b.z - player.z };
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
