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
// Currently mutates state in place for simplicity/perf; the signature is kept
// pure-style (returns the state) so we can switch to immutable copies for
// rollback netcode without changing callers.

import { stepPlayer } from './movement.js';

export function step(state, commands, dt) {
  for (const player of state.players) {
    const cmd = commands[player.id];
    const move = cmd ? cmd.move : { x: 0, z: 0 };
    const sprint = cmd ? cmd.sprint : false;
    stepPlayer(player, move, sprint, dt, state.pool);
  }

  // Ball: Milestone 0 has no ball interactions yet. Reserved for Milestone 1.

  state.tick += 1;
  state.time += dt;
  return state;
}
