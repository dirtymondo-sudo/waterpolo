// ai.js — CPU decision-making, expressed as COMMANDS.
//
// Every non-controlled player produces the same command shape a human does
// ({ move, sprint, shootType, pass, steal }), so AI and human run through the
// exact same movement/action code — and AI "just works" over the wire later.
//
// Behaviours by situation:
//   - my team has the ball, I'm the carrier  -> drive at goal, charge & shoot
//   - my team has the ball, I'm off the ball  -> get to an open outlet
//   - opponent has the ball                    -> press goal-side; steal if close
//   - loose ball                               -> sprint to it
//   - goalie                                   -> hold the line; pass out if it has it
//
// Headless and deterministic (no Math.random / Date).
//
// (Single AI file for Milestone 2; splits into ai/goalie.js, ai/defense.js,
// ai/offense.js as behaviours grow — see PLAN §4.)

import { TUNABLES } from '../config/tunables.js';
import { POOL } from '../config/rules.js';

const HALF_L = POOL.length / 2;
const GOAL_X = HALF_L - TUNABLES.goalie.lineOffset;

const NONE = () => ({ move: { x: 0, z: 0 }, sprint: false, shootType: null, pass: false, steal: false });

export function computeAICommand(player, state) {
  const b = state.ball;
  const holder = b.held ? state.players.find((p) => p.id === b.ownerId) : null;

  if (player.role === 'goalie') return goalieCmd(player, state, holder);

  if (holder && holder.team === player.team) {
    return holder === player ? carrierCmd(player, state) : offBallCmd(player, state);
  }
  return defendCmd(player, state, holder);
}

// --- Goalie -----------------------------------------------------------------
function goalieCmd(player, state, holder) {
  const cmd = NONE();
  // If the goalie somehow has the ball, clear it immediately with an outlet pass.
  if (holder === player) {
    cmd.pass = true;
    return cmd;
  }
  const G = TUNABLES.goalie;
  const b = state.ball;
  const ownGoalX = player.team === 0 ? -GOAL_X : GOAL_X;
  const targetZ = clamp(b.z, -G.zClamp, G.zClamp);
  cmd.move = { x: ownGoalX - player.x, z: targetZ - player.z };
  return cmd;
}

// --- Offence: carrier drives at the goal and shoots --------------------------
function carrierCmd(player, state) {
  const A = TUNABLES.ai;
  const cmd = NONE();
  const sign = player.team === 0 ? 1 : -1; // attack direction
  const goalX = sign * HALF_L;
  const distToLine = Math.abs(goalX - player.x);

  if (distToLine > A.shootRange) {
    // Too far: swim goal-ward, drifting toward the centre lane.
    cmd.move = { x: goalX - player.x, z: -player.z * 0.3 };
    cmd.sprint = true;
    return cmd;
  }

  // In range: aim AT the corner away from the keeper. The move vector points at
  // the target so the heading (and therefore the shot) lines up on it; the
  // player drifts goal-ward while winding up, then fires.
  const keeper = state.players.find((p) => p.team !== player.team && p.role === 'goalie');
  const cornerZ = keeper && keeper.z > 0 ? -A.cornerZ : A.cornerZ;
  cmd.move = { x: goalX - player.x, z: cornerZ - player.z };

  const full = TUNABLES.shot.chargeTime * A.targetCharge;
  cmd.shootType = player.charge < full ? 'normal' : null; // hold to charge, then release
  return cmd;
}

// --- Offence: off the ball, give a passing outlet ---------------------------
function offBallCmd(player, state) {
  const cmd = NONE();
  const sign = player.team === 0 ? 1 : -1;
  const carrier = state.players.find((p) => p.id === state.ball.ownerId);
  // Post up in the attacking third on the opposite side from the carrier.
  const targetX = sign * (HALF_L - 6);
  const targetZ = carrier ? clamp(-carrier.z, -6, 6) : 0;
  cmd.move = { x: targetX - player.x, z: targetZ - player.z };
  return cmd;
}

// --- Defence: press goal-side, steal when tight, chase loose balls ----------
function defendCmd(player, state, holder) {
  const A = TUNABLES.ai;
  const St = TUNABLES.steal;
  const cmd = NONE();
  const b = state.ball;

  if (!b.held) {
    // Loose ball: race to it.
    cmd.move = { x: b.x - player.x, z: b.z - player.z };
    cmd.sprint = Math.hypot(b.x - player.x, b.z - player.z) > A.sprintChaseDist;
    return cmd;
  }

  const d = Math.hypot(b.x - player.x, b.z - player.z);
  if (d <= St.range + 0.15) {
    // Close enough to contest: lunge in and try to strip it.
    cmd.move = { x: holder.x - player.x, z: holder.z - player.z };
    cmd.steal = true;
    return cmd;
  }

  // Otherwise sit between the ball and our own goal.
  const ownGoalX = player.team === 0 ? -HALF_L : HALF_L;
  const toward = Math.sign(ownGoalX - b.x) || 1;
  cmd.move = { x: b.x + toward * TUNABLES.defense.pressDist - player.x, z: b.z - player.z };
  cmd.sprint = d > A.sprintChaseDist;
  return cmd;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
