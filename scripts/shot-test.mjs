// shot-test.mjs — headless trajectory check for the three shot types.
//
// The sim is pure data, so we can drive it directly in Node (no browser) to tune
// shot feel deterministically. Places the carrier, aims by heading, charges, and
// fires; reports peak height, where it crossed the goal line, and the outcome.

import { createWorld } from '../src/sim/world.js';
import { step } from '../src/sim/step.js';
import { TUNABLES } from '../src/config/tunables.js';
import { POOL } from '../src/config/rules.js';

const DT = 1 / TUNABLES.sim.hz;
const HALF_L = POOL.length / 2;

function runShot({ type, fromX, fromZ, aimZ, charge = 1.0, withGoalie = true }) {
  const state = createWorld();
  // Force a live play state with the ball in the human's hands (createWorld now
  // opens on a swim-off with the ball locked).
  const human = state.players.find((p) => p.human);
  state.phase = 'play';
  state.phaseTimer = 0;
  state.possession = 0;

  // Park the chasing defenders (and optionally the keeper) out of the way so we
  // measure the shot in isolation.
  for (const p of state.players) {
    if (p.team !== 1) continue;
    if (p.role === 'field' || !withGoalie) { p.x = HALF_L - 1; p.z = 9; p.hx = HALF_L - 1; p.hz = 9; }
  }
  human.x = fromX;
  human.z = fromZ;
  human.hx = fromX;
  human.hz = fromZ;

  const b = state.ball;
  b.locked = false;
  b.held = true;
  b.ownerId = human.id;
  b.x = fromX;
  b.z = fromZ;
  human.heading = Math.atan2(aimZ - fromZ, HALF_L - fromX);

  const chargeTicks = Math.round((charge * TUNABLES.shot.chargeTime) / DT);
  const hold = { move: { x: 0, z: 0 }, sprint: false, shootType: type, pass: false };
  const release = { move: { x: 0, z: 0 }, sprint: false, shootType: null, pass: false };

  let peakY = 0;
  let crossZ = null;
  let crossY = null;
  let bounced = false;
  const startScore = state.score[0];

  for (let i = 0; i < 600; i++) {
    // Keep aiming fixed while charging (don't let movement turn the player).
    human.heading = Math.atan2(aimZ - fromZ, HALF_L - fromX);
    const cmd = i < chargeTicks ? hold : release;
    step(state, { [human.id]: cmd }, DT);

    const b = state.ball;
    if (b.y > peakY) peakY = b.y;
    if (b.shotType === 'skip' && b.bounces === 0 && b.y <= 0.02 && b.vx !== 0) bounced = true;
    if (crossZ === null && !b.held && b.x >= HALF_L - 0.05) {
      crossZ = b.z;
      crossY = b.y;
    }
    if (state.phase === 'goal' || (b.inAir === false && Math.hypot(b.vx, b.vz) < 0.3 && i > chargeTicks + 5)) {
      break;
    }
  }

  const scored = state.score[0] > startScore;
  return { type, scored, peakY, crossZ, crossY, bounced };
}

function fmt(n) {
  return n === null ? ' —  ' : n.toFixed(2).padStart(5);
}

console.log('Trajectory (no goalie), full charge, from x=9 aimed at far corner z=1.2:');
for (const type of ['normal', 'lob', 'skip']) {
  const r = runShot({ type, fromX: 9, fromZ: -1, aimZ: 1.2, withGoalie: false });
  console.log(
    `  ${type.padEnd(6)} scored=${r.scored ? 'YES' : 'no '}  peakY=${fmt(r.peakY)}  crossZ=${fmt(r.crossZ)}  crossY=${fmt(r.crossY)}  skipped=${r.bounced}`
  );
}

console.log('\nVs goalie, full charge, from x=9 aimed at far corner z=1.3:');
for (const type of ['normal', 'lob', 'skip']) {
  const r = runShot({ type, fromX: 9, fromZ: -2, aimZ: 1.3, withGoalie: true });
  console.log(`  ${type.padEnd(6)} scored=${r.scored ? 'YES' : 'no '}  (goalie saves centred shots)`);
}

console.log('\nVs goalie, centred (should be saved):');
for (const type of ['normal', 'skip']) {
  const r = runShot({ type, fromX: 9, fromZ: 0, aimZ: 0, withGoalie: true });
  console.log(`  ${type.padEnd(6)} scored=${r.scored ? 'YES (leak!)' : 'no (saved)'}`);
}
