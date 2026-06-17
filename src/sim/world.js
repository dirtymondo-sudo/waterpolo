// world.js — the authoritative state container.
//
// State is PLAIN SERIALIZABLE DATA. No Three.js objects, no class instances with
// behaviour, no functions. This is the rule that makes networking, replays, and
// testing possible later: the whole world can be JSON-stringified and sent over
// the wire or snapshotted for interpolation.

import { POOL } from '../config/rules.js';
import { TUNABLES } from '../config/tunables.js';

let _nextId = 1;

function makePlayer({ team, x, z, controlled = false }) {
  return {
    id: _nextId++,
    team, // 0 | 1
    controlled, // is this the locally-controlled player?
    x,
    z,
    vx: 0,
    vz: 0,
    heading: team === 0 ? 0 : Math.PI, // facing +X / -X
    speed: 0, // cached |velocity|, handy for render (wake, bob)
    stamina: TUNABLES.stamina.max,
    sprinting: false,
  };
}

// Build the initial world. Milestone 0: a single controllable swimmer near the
// centre. Rosters/teams arrive in later milestones.
export function createWorld() {
  _nextId = 1;
  return {
    tick: 0,
    time: 0, // seconds of sim time elapsed
    pool: { length: POOL.length, width: POOL.width },
    players: [
      makePlayer({ team: 0, x: -4, z: 0, controlled: true }),
    ],
    ball: {
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      held: false,
      ownerId: null,
    },
  };
}

// Convenience accessor used by render + input.
export function getControlledPlayer(state) {
  return state.players.find((p) => p.controlled) || null;
}
