// formations.js — pure positional data shared by the world (homes / swim-off /
// restarts) and the AI (where off-ball players go). No logic, no three.js.
//
// Slot tables are written for a team attacking +X; team 1 is mirrored on X.
// 6 field slots per team (0 = hole set at 2m, 1-2 wings, 3-4 flats, 5 point).

import { POOL } from '../config/rules.js';

const HALF_W = POOL.width / 2;

// Attacking shape: spread around the opponent goal (large +X).
const OFFENSE = [
  { x: 12, z: 0 }, // 0 hole set / centre forward at 2m
  { x: 9, z: -6 }, // 1 wing
  { x: 9, z: 6 }, // 2 wing
  { x: 6, z: -3 }, // 3 flat
  { x: 6, z: 3 }, // 4 flat
  { x: 4, z: 0 }, // 5 point / top
];

// Defending shape: drop into a zone in front of your OWN goal (large -X).
const DEFENSE = [
  { x: -10, z: 0 }, // 0 guards the hole
  { x: -8, z: -5 },
  { x: -8, z: 5 },
  { x: -5, z: -3 },
  { x: -5, z: 3 },
  { x: -3, z: 0 },
];

function mirror(team, spot) {
  const s = team === 0 ? 1 : -1;
  return { x: s * spot.x, z: spot.z };
}

export function offenseSpot(team, slot) {
  return mirror(team, OFFENSE[slot % OFFENSE.length]);
}

export function defenseSpot(team, slot) {
  return mirror(team, DEFENSE[slot % DEFENSE.length]);
}

// Swim-off: line up across your own half on the 4m line.
export function swimOffSpot(team, slot, count) {
  const s = team === 0 ? 1 : -1;
  const spread = (slot - (count - 1) / 2) * (POOL.width / (count + 1));
  return { x: s * -4, z: spread };
}

// Where an excluded player sits out: the re-entry corner by their own goal.
export function penaltyBox(team) {
  const s = team === 0 ? 1 : -1;
  return { x: s * -(POOL.length / 2 - 1), z: HALF_W + 1.2 };
}
