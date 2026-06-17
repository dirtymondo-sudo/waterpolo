// commands.js — the command schema.
//
// A command is the ONLY way input reaches the simulation. It is a plain,
// serializable object: exactly what gets sent over the wire for multiplayer.
// One command per controlled player per simulation tick.
//
//   { seq, move: {x, z}, sprint, cycleCam, shootType, pass }
//
// move is a world-space vector in the XZ plane, magnitude 0..1 (a normalized
// stick / WASD direction). `shootType` is which shoot button is CURRENTLY held
// ('normal' | 'skip' | 'lob' | null) — the sim charges while it's held and fires
// on release. `pass` is an edge-triggered button. `seq` lets the server ack and
// the client reconcile later.

let _seq = 0;

export function createCommand({ move, sprint = false, cycleCam = false, shootType = null, pass = false }) {
  return {
    seq: _seq++,
    move: { x: move.x, z: move.z },
    sprint: !!sprint,
    cycleCam: !!cycleCam,
    shootType: shootType || null,
    pass: !!pass,
  };
}

export const NEUTRAL_COMMAND = Object.freeze({
  seq: -1,
  move: Object.freeze({ x: 0, z: 0 }),
  sprint: false,
  cycleCam: false,
  shootType: null,
  pass: false,
});
