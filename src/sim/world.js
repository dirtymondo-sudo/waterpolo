// world.js — the authoritative state container.
//
// State is PLAIN SERIALIZABLE DATA. No Three.js objects, no class instances with
// behaviour, no functions. This is the rule that makes networking, replays, and
// testing possible later: the whole world can be JSON-stringified and sent over
// the wire or snapshotted for interpolation.

import { POOL, MATCH } from '../config/rules.js';
import { TUNABLES } from '../config/tunables.js';
import { offenseSpot, swimOffSpot, penaltyBox } from './formations.js';

const FIELD_PER_TEAM = 6; // 6 field players + 1 goalie = 7v7

let _nextId = 1;

// team 0 attacks +X (defends -X); team 1 attacks -X (defends +X).
function makePlayer({ team, role, slot, x, z, controlled = false, human = false }) {
  return {
    id: _nextId++,
    team, // 0 | 1
    role, // 'field' | 'goalie'
    slot, // formation index (0..5 for field; 0 for goalie)
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
    excluded: false, // sin-binned (man-down) — out of the field of play
    excludeTimer: 0, // seconds left in the sin-bin
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

// Roster: 6 field + goalie per side. The human starts on team 0's "point".
function roster() {
  _nextId = 1;
  const players = [];
  for (let team = 0; team < 2; team++) {
    for (let slot = 0; slot < FIELD_PER_TEAM; slot++) {
      const spot = offenseSpot(team, slot);
      const isHuman = team === 0 && slot === 5;
      players.push(makePlayer({
        team,
        role: 'field',
        slot,
        x: spot.x,
        z: spot.z,
        human: isHuman,
        controlled: isHuman,
      }));
    }
    players.push(makePlayer({ team, role: 'goalie', slot: 0, x: team === 0 ? -GOAL_X : GOAL_X, z: 0 }));
  }
  return players;
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
    freeThrowTimer: 0, // protected possession after a foul (no steals)
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
  state.freeThrowTimer = 0;

  for (const p of state.players) {
    clearExclusion(p);
    resetPlayer(p);
    if (p.role === 'goalie') {
      p.x = p.team === 0 ? -GOAL_X : GOAL_X;
      p.z = 0;
    } else {
      const spot = swimOffSpot(p.team, p.slot, FIELD_PER_TEAM);
      p.x = spot.x;
      p.z = spot.z;
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
    .filter((p) => p.team === team && p.role === 'field' && !p.excluded)
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
  state.freeThrowTimer = 0;

  // Give the human a player to act with: the carrier if it's our ball, else the
  // team-0 player nearest the ball (so you can immediately go defend/steal).
  if (team === 0 && carrier) {
    carrier.controlled = true;
  } else {
    giveControlNearBall(state);
  }
}

// Hand control to the nearest non-excluded team-0 field player to the ball.
export function giveControlNearBall(state) {
  const b = state.ball;
  const field = state.players
    .filter((p) => p.team === 0 && p.role === 'field' && !p.excluded)
    .sort((a, c) => Math.hypot(a.x - b.x, a.z - b.z) - Math.hypot(c.x - b.x, c.z - b.z));
  if (!field.length) return;
  for (const p of state.players) p.controlled = false;
  field[0].controlled = true;
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

function clearExclusion(p) {
  p.excluded = false;
  p.excludeTimer = 0;
}

// Convenience accessor used by render + input.
export function getControlledPlayer(state) {
  return state.players.find((p) => p.controlled) || null;
}
