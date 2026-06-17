// world.js — the authoritative state container.
//
// State is PLAIN SERIALIZABLE DATA. No Three.js objects, no class instances with
// behaviour, no functions. This is the rule that makes networking, replays, and
// testing possible later: the whole world can be JSON-stringified and sent over
// the wire or snapshotted for interpolation.

import { POOL, MATCH } from '../config/rules.js';
import { TUNABLES } from '../config/tunables.js';

let _nextId = 1;

// team 0 attacks +X (defends -X); team 1 attacks -X (defends +X).
function makePlayer({ team, role, x, z, controlled = false, human = false }) {
  return {
    id: _nextId++,
    team, // 0 | 1
    role, // 'field' | 'goalie'
    human, // the player the local user starts on (control snaps back here)
    controlled, // is this the currently locally-controlled player?
    hx: x, // "home" position, restored on kickoff
    hz: z,
    x,
    z,
    vx: 0,
    vz: 0,
    heading: team === 0 ? 0 : Math.PI, // attack direction
    speed: 0, // cached |velocity|, handy for render (wake, bob)
    stamina: TUNABLES.stamina.max,
    sprinting: false,
    charge: 0, // seconds the shoot button has been held
    chargeType: null, // 'normal' | 'skip' | 'lob' while charging, else null
  };
}

function makeBall() {
  return {
    x: 0,
    y: TUNABLES.ball.carryHeight, // height above the water surface (y=0)
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    held: true,
    ownerId: null, // set by layout()
    lastOwnerId: null, // who last held it (for the re-grab cooldown)
    pickupCooldown: 0, // blocks ONLY lastOwnerId from instantly re-grabbing
    inAir: false, // true while flying as a projectile
    gravity: 0, // per-shot gravity, set at launch
    bounces: 0, // remaining water skips (skip shot)
    restitution: 0, // bounce energy retained
    shotType: null, // last launch type, for fx/debug
  };
}

const HALF_L = POOL.length / 2;
const GOAL_X = HALF_L - TUNABLES.goalie.lineOffset;

// The starting roster + formation. Small on purpose for Milestone 1: enough to
// show passing, three shot types, a goalie save, and a chasing defender.
function roster() {
  _nextId = 1;
  return [
    // --- Team 0 (the human team, attacking +X) ---
    makePlayer({ team: 0, role: 'field', x: -2, z: -1, controlled: true, human: true }),
    makePlayer({ team: 0, role: 'field', x: 6, z: 4 }), // pass outlet up the wing
    makePlayer({ team: 0, role: 'goalie', x: -GOAL_X, z: 0 }),
    // --- Team 1 (CPU, attacking -X) ---
    makePlayer({ team: 1, role: 'goalie', x: GOAL_X, z: 0 }),
    makePlayer({ team: 1, role: 'field', x: 8, z: -2 }), // defender
  ];
}

// Build the initial world.
export function createWorld() {
  const players = roster();
  const ball = makeBall();
  const state = {
    tick: 0,
    time: 0, // seconds of sim time elapsed
    pool: { length: POOL.length, width: POOL.width },
    phase: 'play', // 'play' | 'goal' (brief celebration pause)
    goalTimer: 0,
    lastGoalTeam: null,
    score: [0, 0],
    period: 1,
    periodClock: MATCH.periodSeconds,
    shotClock: MATCH.shotClockSeconds,
    possession: null, // team id currently holding the ball, or null
    players,
    ball,
  };
  kickoff(state); // hand the ball to the human so play is immediately actionable
  return state;
}

// Restore the formation and give the ball to the human for a fresh restart.
// Used at boot and after every goal.
export function kickoff(state) {
  for (const p of state.players) {
    p.x = p.hx;
    p.z = p.hz;
    p.vx = 0;
    p.vz = 0;
    p.speed = 0;
    p.heading = p.team === 0 ? 0 : Math.PI;
    p.charge = 0;
    p.chargeType = null;
    p.controlled = p.human;
  }
  const human = state.players.find((p) => p.human);
  const b = state.ball;
  b.held = true;
  b.ownerId = human ? human.id : null;
  b.lastOwnerId = null;
  b.pickupCooldown = 0;
  b.inAir = false;
  b.vx = b.vy = b.vz = 0;
  b.bounces = 0;
  b.shotType = null;
  state.possession = human ? human.team : null;
  state.shotClock = MATCH.shotClockSeconds;
}

// Convenience accessor used by render + input.
export function getControlledPlayer(state) {
  return state.players.find((p) => p.controlled) || null;
}
