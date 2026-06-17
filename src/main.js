// main.js — bootstrap. Wires the three pillars together and runs the loop:
//
//   Input -> Commands -> Simulation (fixed 60Hz) -> Sim State -> Render (interp)
//
// The simulation advances on a FIXED timestep via an accumulator so behaviour is
// reproducible and independent of frame rate. The renderer draws an interpolated
// view between the two most recent sim states. This is exactly the structure the
// online-multiplayer client will use; nothing here has to change for `net/`.

import { createWorld } from './sim/world.js';
import { step } from './sim/step.js';
import { TUNABLES } from './config/tunables.js';
import { InputManager } from './input/inputManager.js';
import { createCommand } from './input/commands.js';
import { Renderer } from './render/renderer.js';

const FIXED_DT = 1 / TUNABLES.sim.hz;
const MAX_FRAME = 0.25; // clamp huge gaps (tab was backgrounded) to avoid spiral

const renderer = new Renderer(document.getElementById('app'));
const input = new InputManager(window);

let state = createWorld();
let prevState = structuredClone(state);
renderer.syncEntities(state);

const statsEl = document.getElementById('stats');
let accumulator = 0;
let last = performance.now();
let fpsSmooth = 60;

function frame(now) {
  let dt = (now - last) / 1000;
  last = now;
  if (dt > MAX_FRAME) dt = MAX_FRAME;
  fpsSmooth += ((1 / Math.max(dt, 1e-4)) - fpsSmooth) * 0.05;

  // --- Sample input once per frame, build a world-space command. ---
  const raw = input.sample();
  if (raw.cycleCam) renderer.cycleCamera();

  const basis = renderer.planarBasis();
  const move = {
    x: basis.forward.x * raw.moveY + basis.right.x * raw.moveX,
    z: basis.forward.z * raw.moveY + basis.right.z * raw.moveX,
  };
  const command = createCommand({ move, sprint: raw.sprint });

  // Commands keyed by controlled player id (one local player in Milestone 0).
  const commands = {};
  for (const p of state.players) {
    if (p.controlled) commands[p.id] = command;
  }

  // --- Fixed-timestep simulation with interpolation snapshots. ---
  accumulator += dt;
  while (accumulator >= FIXED_DT) {
    prevState = structuredClone(state);
    step(state, commands, FIXED_DT);
    accumulator -= FIXED_DT;
  }
  const alpha = accumulator / FIXED_DT;

  renderer.syncEntities(state);
  renderer.render(prevState, state, alpha, dt);

  if (statsEl) {
    statsEl.textContent = `${Math.round(fpsSmooth)} fps · cam: ${renderer.rig.mode}`;
  }

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

// Expose for debugging / future playtest harness.
window.GAME = {
  get state() { return state; },
  renderer,
  TUNABLES,
};
