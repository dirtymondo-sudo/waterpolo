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
    hx: x, // "home" position, restored on restarts
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
    stealCooldown: 0, // wait before this player can attempt another steal
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
    held: false,
    locked: false, // swim-off: nobody may grab it until the whistle
    ownerId: null,
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

// Roster + home formation. 2v2 field players + goalies for Milestone 2: enough
// for passing, three shot types, saves, a contesting defence, and a CPU offence.
function roster() {
  _nextId = 1;
  return [
    // --- Team 0 (the human team, attacking +X) ---
    makePlayer({ team: 0, role: 'field', x: -2, z: -1, controlled: true, human: true }),
    makePlayer({ team: 0, role: 'field', x: -5, z: 4 }),
    makePlayer({ team: 0, role: 'goalie', x: -GOAL_X, z: 0 }),
    // --- Team 1 (CPU, attacking -X) ---
    makePlayer({ team: 1, role: 'field', x: 2, z: 1 }),
    makePlayer({ team: 1, role: 'field', x: 5, z: -4 }),
    makePlayer({ team: 1, role: 'goalie', x: GOAL_X, z: 0 }),
  ];
}

// Build the initial world: opens on a swim-off to start period 1.
export function createWorld() {
  const state = {
    tick: 0,
    time: 0, // seconds of sim time elapsed
    pool: { length: POOL.length, width: POOL.width },
    phase: 'swimOff', // swimOff | play | goal | periodEnd | fullTime
    phaseTimer: 0, // counts down the current non-play phase
    lastGoalTeam: null,
    score: [0, 0],
    period: 1,
    periodClock: MATCH.periodSeconds,
    shotClock: MATCH.shotClockSeconds,
    possession: null, // team id currently holding the ball, or null
    players: roster(),
    ball: makeBall(),
  };
  setSwimOff(state);
  return state;
}

// Line both teams up on their own halves for a centre swim-off; the ball waits
// (locked) at the centre until the whistle countdown elapses.
export function setSwimOff(state) {
  state.phase = 'swimOff';
  state.phaseTimer = TUNABLES.match.swimOffSeconds;
  state.possession = null;
  state.shotClock = MATCH.shotClockSeconds;

  const lineByTeam = { 0: 0, 1: 0 };
  for (const p of state.players) {
    resetPlayer(p);
    if (p.role === 'goalie') {
      p.x = p.team === 0 ? -GOAL_X : GOAL_X;
      p.z = 0;
    } else {
      // Field players spread along their own 4m line, behind the half line.
      const i = lineByTeam[p.team]++;
      p.x = p.team === 0 ? -4 : 4;
      p.z = i === 0 ? -2.5 : 2.5;
    }
    p.controlled = p.human;
  }

  const b = state.ball;
  b.held = false;
  b.locked = true;
  b.ownerId = null;
  b.lastOwnerId = null;
  b.pickupCooldown = 0;
  b.inAir = false;
  b.x = 0;
  b.y = 0;
  b.z = 0;
  b.vx = b.vy = b.vz = 0;
  b.bounces = 0;
  b.shotType = null;
}

// Restart after a goal: reset the formation and hand the ball to `team` (the side
// that was scored on) near the centre. Keeps a human player in control.
export function kickoffTo(state, team) {
  for (const p of state.players) {
    resetPlayer(p);
    p.x = p.hx;
    p.z = p.hz;
    p.controlled = false;
  }
  const carrier = state.players
    .filter((p) => p.team === team && p.role === 'field')
    .sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];

  const b = state.ball;
  b.held = !!carrier;
  b.locked = false;
  b.ownerId = carrier ? carrier.id : null;
  b.lastOwnerId = null;
  b.pickupCooldown = 0;
  b.inAir = false;
  b.vx = b.vy = b.vz = 0;
  b.bounces = 0;
  b.shotType = null;
  state.possession = carrier ? team : null;
  state.shotClock = MATCH.shotClockSeconds;

  // Give the human a player to act with: the carrier if it's our ball, else the
  // team-0 player nearest the ball (so you can immediately go defend/steal).
  if (team === 0 && carrier) {
    carrier.controlled = true;
  } else {
    const def = state.players
      .filter((p) => p.team === 0 && p.role === 'field')
      .sort((a, p) => dist(a, b) - dist(p, b))[0];
    if (def) def.controlled = true;
  }
}

function resetPlayer(p) {
  p.vx = 0;
  p.vz = 0;
  p.speed = 0;
  p.heading = p.team === 0 ? 0 : Math.PI;
  p.charge = 0;
  p.chargeType = null;
  p.stealCooldown = 0;
  p.stamina = TUNABLES.stamina.max;
}

function dist(p, b) {
  return Math.hypot(p.x - b.x, p.z - b.z);
}

// Convenience accessor used by render + input.
export function getControlledPlayer(state) {
  return state.players.find((p) => p.controlled) || null;
}
