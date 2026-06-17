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
const scoreEl = document.getElementById('score');
const shotclockEl = document.getElementById('shotclock');
const gameclockEl = document.getElementById('gameclock');
const bannerEl = document.getElementById('banner');
const manupEl = document.getElementById('manup');
const chargebarEl = document.getElementById('chargebar');
const chargefillEl = document.getElementById('chargefill');
const chargelabelEl = document.getElementById('chargelabel');
const CHARGE_COLOR = { normal: '#ffffff', skip: '#4fd2ff', lob: '#ffa83c' };

function mmss(t) {
  const s = Math.max(0, Math.ceil(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Big centre-screen status text driven by the match phase.
function bannerFor(s) {
  switch (s.phase) {
    case 'swimOff':
      return s.phaseTimer > 0.4 ? `PERIOD ${s.period}` : 'GO!';
    case 'goal':
      return s.lastGoalTeam === 0 ? 'GOAL — P1!' : 'GOAL — CPU!';
    case 'periodEnd':
      return `END OF PERIOD ${s.period}`;
    case 'fullTime': {
      const [a, b] = s.score;
      const who = a === b ? 'DRAW' : a > b ? 'P1 WINS' : 'CPU WINS';
      return `FULL TIME — ${who}  ${a} : ${b}`;
    }
    default:
      return '';
  }
}

let accumulator = 0;
let last = performance.now();
let fpsSmooth = 60;

// --- Controller haptics + connection toast ---------------------------------
// Rumble is a pure "feel" layer reading sim deltas; it never touches the sim.
const toastEl = document.getElementById('gamepad-toast');
let toastTimer = 0;
function showToast(text) {
  if (!toastEl) return;
  toastEl.textContent = text;
  toastEl.classList.add('show');
  toastTimer = 2.6;
}
input.onGamepadChange((info) => {
  if (info) {
    showToast(`🎮 ${info.label} connected`);
    input.rumble(0.5, 0.5, 160); // a quick "hello" buzz to confirm it's live
  } else {
    showToast('🎮 Controller disconnected');
  }
});

// Watch sim state between frames and translate notable events into rumble.
let prevPhaseForRumble = state.phase;
let wasCharging = false;
function driveHaptics(cur) {
  if (cur.phase === 'goal' && prevPhaseForRumble !== 'goal') {
    // Big celebratory rumble for your goal, a duller thud when you concede.
    if (cur.lastGoalTeam === 0) input.rumble(1.0, 0.8, 420);
    else input.rumble(0.35, 0.25, 220);
  }
  prevPhaseForRumble = cur.phase;

  // Light kick the instant a charged shot is released by the player.
  const chargingNow = cur.players.some((p) => p.controlled && p.chargeType);
  if (wasCharging && !chargingNow) input.rumble(0.45, 0.6, 110);
  wasCharging = chargingNow;
}

function updateHUD(s) {
  if (scoreEl) scoreEl.textContent = `${s.score[0]} : ${s.score[1]}`;
  if (gameclockEl) gameclockEl.textContent = `Q${s.period}  ${mmss(s.periodClock)}`;
  if (shotclockEl) {
    shotclockEl.textContent = Math.ceil(s.shotClock);
    shotclockEl.classList.toggle('urgent', s.shotClock <= 5 && s.phase === 'play');
  }
  if (bannerEl) {
    const text = bannerFor(s);
    bannerEl.textContent = text;
    bannerEl.classList.toggle('show', !!text);
    bannerEl.classList.toggle('huge', s.phase === 'goal' || s.phase === 'fullTime');
  }

  // Man-up / man-down indicator (counts players still in the pool).
  if (manupEl) {
    const inPool = [0, 0];
    let exTimer = 0;
    for (const p of s.players) {
      if (p.excluded) { exTimer = Math.max(exTimer, p.excludeTimer); continue; }
      inPool[p.team] += 1;
    }
    if (inPool[0] !== inPool[1] && s.phase === 'play') {
      const up = inPool[0] > inPool[1];
      manupEl.textContent = `P1 ${up ? 'MAN-UP' : 'MAN-DOWN'} ${inPool[0]}v${inPool[1]} · ${Math.ceil(exTimer)}s`;
      manupEl.className = up ? 'up' : 'down';
    } else {
      manupEl.textContent = '';
      manupEl.className = '';
    }
  }

  // Charge bar follows the controlled carrier while a shoot button is held.
  const carrier = s.players.find((p) => p.controlled && p.chargeType);
  if (chargebarEl) {
    if (carrier) {
      const frac = Math.min(1, carrier.charge / TUNABLES.shot.chargeTime);
      chargebarEl.classList.add('show');
      chargefillEl.style.width = `${Math.round(frac * 100)}%`;
      chargefillEl.style.background = CHARGE_COLOR[carrier.chargeType] || '#fff';
      chargelabelEl.textContent = carrier.chargeType;
      chargelabelEl.style.color = CHARGE_COLOR[carrier.chargeType] || '#fff';
    } else {
      chargebarEl.classList.remove('show');
    }
  }
}

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
  const command = createCommand({
    move,
    sprint: raw.sprint,
    shootType: raw.shootType,
    pass: raw.pass,
    switchPlayer: raw.switchPlayer,
  });

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

  driveHaptics(state);
  if (toastTimer > 0) {
    toastTimer -= dt;
    if (toastTimer <= 0 && toastEl) toastEl.classList.remove('show');
  }

  renderer.syncEntities(state);
  renderer.render(prevState, state, alpha, dt);
  updateHUD(state);

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
  // Deterministic self-test: can each shot type score from the 6m mark when
  // aimed at an open corner? Runs throwaway sims; never touches the live state.
  testShots() {
    const HALF_L = state.pool.length / 2;
    const out = {};
    for (const type of ['normal', 'skip', 'lob']) {
      const s = createWorld();
      s.phase = 'play'; s.phaseTimer = 0; s.possession = 0;
      const h = s.players.find((p) => p.human);
      for (const p of s.players) {
        if (p === h) continue;
        p.x = -HALF_L + 1; p.z = -9; p.excluded = true; p.excludeTimer = 999; // open net
      }
      h.x = 9; h.z = -1; h.hx = 9; h.hz = -1;
      s.ball.locked = false; s.ball.held = true; s.ball.ownerId = h.id;
      s.ball.x = 9; s.ball.z = -1;
      const aim = () => { h.heading = Math.atan2(1.2 - (-1), HALF_L - 9); };
      const chargeTicks = Math.round(TUNABLES.shot.chargeTime / FIXED_DT);
      const start = s.score[0];
      for (let i = 0; i < 400; i++) {
        aim();
        const cmd = createCommand({
          move: { x: 0, z: 0 },
          shootType: i < chargeTicks ? type : null,
        });
        step(s, { [h.id]: cmd }, FIXED_DT);
        if (s.score[0] > start) break;
      }
      out[type] = s.score[0] > start;
    }
    return out;
  },
};
