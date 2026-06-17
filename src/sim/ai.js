// ai.js — CPU decision-making, expressed as COMMANDS.
//
// Every non-controlled player produces the same command shape a human does
// ({ move, sprint, shootType, pass, steal }), so AI and human run through the
// exact same movement/action code — and AI "just works" over the wire later.
//
// With 6 field players per side, the key idea is FORMATION + ROLES so players
// don't all swarm the ball: off-ball attackers fill their attacking slot, one
// defender presses the carrier while the rest hold a zone, and the player
// nearest a loose ball chases while the others keep shape.
//
// Headless and deterministic (no Math.random / Date).

import { TUNABLES } from '../config/tunables.js';
import { POOL } from '../config/rules.js';
import { offenseSpot, defenseSpot, penaltyBox } from './formations.js';

const HALF_L = POOL.length / 2;
const GOAL_X = HALF_L - TUNABLES.goalie.lineOffset;

const NONE = () => ({ move: { x: 0, z: 0 }, sprint: false, shootType: null, pass: false, steal: false });
const toward = (p, tx, tz) => ({ x: tx - p.x, z: tz - p.z });

export function computeAICommand(player, state) {
  const cmd = NONE();

  // Sin-binned: swim to the re-entry corner and wait.
  if (player.excluded) {
    const box = penaltyBox(player.team);
    cmd.move = toward(player, box.x, box.z);
    return cmd;
  }

  const b = state.ball;
  const holder = b.held ? state.players.find((p) => p.id === b.ownerId) : null;

  if (player.role === 'goalie') return goalieCmd(player, state, holder, cmd);

  if (holder && holder.team === player.team) {
    return holder === player ? carrierCmd(player, state, cmd) : offBallCmd(player, cmd);
  }
  return defendCmd(player, state, holder, cmd);
}

// --- Goalie -----------------------------------------------------------------
function goalieCmd(player, state, holder, cmd) {
  if (holder === player) {
    cmd.pass = true; // clear it with an outlet pass
    return cmd;
  }
  const G = TUNABLES.goalie;
  const b = state.ball;
  const ownGoalX = player.team === 0 ? -GOAL_X : GOAL_X;
  cmd.move = toward(player, ownGoalX, clamp(b.z, -G.zClamp, G.zClamp));
  return cmd;
}

// --- Offence: carrier drives at goal, shoots, or passes out of pressure -------
function carrierCmd(player, state, cmd) {
  const A = TUNABLES.ai;
  const sign = player.team === 0 ? 1 : -1;
  const goalX = sign * HALF_L;
  const distToLine = Math.abs(goalX - player.x);
  const pressure = nearestOpponentDist(player, state);

  if (distToLine <= A.shootRange) {
    // In range: aim AT the corner away from the keeper so the heading (and the
    // shot) line up on it, then wind up and fire.
    const keeper = state.players.find((p) => p.team !== player.team && p.role === 'goalie');
    const cornerZ = keeper && keeper.z > 0 ? -A.cornerZ : A.cornerZ;
    cmd.move = toward(player, goalX, cornerZ);
    const full = TUNABLES.shot.chargeTime * A.targetCharge;
    cmd.shootType = player.charge < full ? 'normal' : null;
    return cmd;
  }

  // Under pressure away from goal: pass to an open teammate if there is one.
  if (pressure < A.passUnderPressure && openTeammate(player, state)) {
    cmd.pass = true;
    return cmd;
  }

  // Otherwise carry toward goal, drifting to the centre lane.
  cmd.move = toward(player, goalX, player.z * 0.7);
  cmd.sprint = true;
  return cmd;
}

function offBallCmd(player, cmd) {
  const spot = offenseSpot(player.team, player.slot);
  cmd.move = toward(player, spot.x, spot.z);
  return cmd;
}

// --- Defence: one presser, the rest hold the zone; chase loose balls ----------
function defendCmd(player, state, holder, cmd) {
  const A = TUNABLES.ai;
  const St = TUNABLES.steal;
  const b = state.ball;

  // Am I my team's nearest field player to the ball? If so, I'm the presser/chaser.
  const amClosest = isClosestFieldToBall(player, state);

  if (!b.held) {
    // Loose ball: nearest chases, the rest hold a defensive shape.
    if (amClosest) {
      cmd.move = toward(player, b.x, b.z);
      cmd.sprint = Math.hypot(b.x - player.x, b.z - player.z) > A.sprintChaseDist;
    } else {
      const spot = defenseSpot(player.team, player.slot);
      cmd.move = toward(player, spot.x, spot.z);
    }
    return cmd;
  }

  if (amClosest) {
    const d = Math.hypot(b.x - player.x, b.z - player.z);
    // Don't hack at a protected free-throw; just close down.
    if (d <= St.range + 0.15 && state.freeThrowTimer <= 0) {
      cmd.move = toward(player, holder.x, holder.z);
      cmd.steal = true;
      return cmd;
    }
    const ownGoalX = player.team === 0 ? -HALF_L : HALF_L;
    const side = Math.sign(ownGoalX - b.x) || 1;
    cmd.move = toward(player, b.x + side * TUNABLES.defense.pressDist, b.z);
    cmd.sprint = d > A.sprintChaseDist;
    return cmd;
  }

  // Off-ball defenders hold their zone.
  const spot = defenseSpot(player.team, player.slot);
  cmd.move = toward(player, spot.x, spot.z);
  return cmd;
}

// --- helpers ----------------------------------------------------------------
function isClosestFieldToBall(player, state) {
  const b = state.ball;
  const my = Math.hypot(b.x - player.x, b.z - player.z);
  for (const p of state.players) {
    if (p === player || p.team !== player.team || p.role !== 'field' || p.excluded) continue;
    const d = Math.hypot(b.x - p.x, b.z - p.z);
    if (d < my || (d === my && p.id < player.id)) return false;
  }
  return true;
}

function nearestOpponentDist(player, state) {
  let best = Infinity;
  for (const p of state.players) {
    if (p.team === player.team || p.excluded) continue;
    best = Math.min(best, Math.hypot(p.x - player.x, p.z - player.z));
  }
  return best;
}

// A forward teammate with no defender breathing down their neck.
function openTeammate(player, state) {
  const sign = player.team === 0 ? 1 : -1;
  let best = null;
  let bestOpen = 2.0; // require at least this much separation to bother
  for (const p of state.players) {
    if (p === player || p.team !== player.team || p.role === 'goalie' || p.excluded) continue;
    if ((p.x - player.x) * sign < 1) continue; // must be ahead toward goal
    const open = nearestOpponentDist(p, state);
    if (open > bestOpen) { best = p; bestOpen = open; }
  }
  return best;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
