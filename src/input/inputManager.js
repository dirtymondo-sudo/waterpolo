// inputManager.js — raw device input -> intent, every frame.
//
// Supports keyboard and gamepad from day one (the 2K feel wants a controller).
// It does NOT know about the world or the camera. It reports intent in SCREEN
// space (x = right, y = up/away-from-camera) plus button states; main.js rotates
// that into a world-space move vector using the current camera basis and wraps
// it in a wire-ready command.
//
// Keyboard:
//   Space — normal shot   E — skip shot   Q — lob shot  (hold to charge, release to fire)
//   F     — pass          Tab — switch player        C — cycle camera   Shift — sprint
// With no ball, holding a shoot button (Space/E/Q) lunges for a steal instead.
//
// Gamepad (Switch Pro Controller labels; see gamepad.js for the mapping):
//   Left stick / D-pad — swim     ZR / ZL — sprint
//   A — shoot   X — skip   Y — lob   L — pass   R — switch / steal   − — camera
// Rumble fires through whichever pad is connected (rumble(strong, weak, ms)).

import { pollGamepad } from './gamepad.js';

const KEY_MOVE = {
  KeyW: [0, 1], ArrowUp: [0, 1],
  KeyS: [0, -1], ArrowDown: [0, -1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
};

// Shoot keys -> shot type. Priority resolves the (rare) multi-key case.
const SHOOT_KEYS = [
  ['Space', 'normal'],
  ['KeyE', 'skip'],
  ['KeyQ', 'lob'],
];

const PREVENT = new Set(['Space', 'KeyC', 'KeyE', 'KeyQ', 'KeyF', 'Tab']);

export class InputManager {
  constructor(target = window) {
    this.keys = new Set();
    this.sprintHeld = false;
    // Edge-triggered buttons: true for exactly one sample after a press.
    this._cycleCamQueued = false;
    this._passQueued = false;
    this._switchQueued = false;
    this._gamepadCyclePrev = false;
    this._gamepadPassPrev = false;
    this._gamepadSwitchPrev = false;

    // Currently-connected pad (for rumble) and a friendly description for the HUD.
    this.gamepad = null;       // semantic snapshot from the last sample(), or null
    this.gamepadInfo = null;   // { profile, label, mapping } or null when none
    this._onGamepadChange = null; // optional callback(info|null) for UI toasts

    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('gamepadconnected', () => this._refreshGamepad());
      window.addEventListener('gamepaddisconnected', () => this._refreshGamepad());
    }

    target.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.sprintHeld = true;
      if (e.code === 'KeyC') this._cycleCamQueued = true;
      if (e.code === 'KeyF') this._passQueued = true;
      if (e.code === 'Tab') this._switchQueued = true;
      if (KEY_MOVE[e.code] || PREVENT.has(e.code)) e.preventDefault();
    });
    target.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.sprintHeld = false;
    });
    // Drop held keys when focus is lost so the swimmer doesn't run off.
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.sprintHeld = false;
    });
  }

  // Returns { moveX, moveY, sprint, cycleCam, shootType, pass } in screen space.
  sample() {
    let x = 0;
    let y = 0;
    for (const code of this.keys) {
      const m = KEY_MOVE[code];
      if (m) { x += m[0]; y += m[1]; }
    }
    let sprint = this.sprintHeld;
    let cycleCam = this._cycleCamQueued;
    let pass = this._passQueued;
    let switchPlayer = this._switchQueued;
    this._cycleCamQueued = false;
    this._passQueued = false;
    this._switchQueued = false;

    let shootType = null;
    for (const [code, type] of SHOOT_KEYS) {
      if (this.keys.has(code)) { shootType = type; break; }
    }

    // --- Gamepad overlays keyboard. Stick/D-pad steer; buttons map by Nintendo
    // label so a Switch Pro's prompts match the engraved letters (gamepad.js). ---
    const pad = pollGamepad();
    this.gamepad = pad;
    if (pad) {
      if (pad.moveX !== 0 || pad.moveY !== 0) { x = pad.moveX; y = pad.moveY; }
      if (pad.sprint) sprint = true;
      // A = normal, X = skip, Y = lob. Keyboard wins only if already held.
      if (pad.shootNormal) shootType = shootType || 'normal';
      else if (pad.shootSkip) shootType = shootType || 'skip';
      else if (pad.shootLob) shootType = shootType || 'lob';
      // Edge-trigger the one-shot actions so a held button fires exactly once.
      if (pad.pass && !this._gamepadPassPrev) pass = true;
      this._gamepadPassPrev = pad.pass;
      if (pad.cycleCam && !this._gamepadCyclePrev) cycleCam = true;
      this._gamepadCyclePrev = pad.cycleCam;
      if (pad.switchSteal && !this._gamepadSwitchPrev) switchPlayer = true;
      this._gamepadSwitchPrev = pad.switchSteal;
    }

    // Normalize diagonal keyboard input so it isn't faster.
    const mag = Math.hypot(x, y);
    if (mag > 1) { x /= mag; y /= mag; }

    return { moveX: x, moveY: y, sprint, cycleCam, shootType, pass, switchPlayer };
  }

  // Register a callback fired whenever a pad connects/disconnects (for HUD toasts).
  onGamepadChange(cb) {
    this._onGamepadChange = cb;
    this._refreshGamepad();
  }

  _refreshGamepad() {
    const pad = pollGamepad();
    const info = pad ? { profile: pad.profile, label: pad.label, mapping: pad.mapping } : null;
    const changed = (info && info.label) !== (this.gamepadInfo && this.gamepadInfo.label);
    this.gamepadInfo = info;
    if (changed && this._onGamepadChange) this._onGamepadChange(info);
  }

  // Haptics: fire a dual-rumble on the active pad if it supports vibration.
  // strong/weak are 0..1 motor intensities; ms is the duration. No-ops safely
  // on pads/browsers without an actuator, so callers don't have to guard.
  rumble(strong = 0.6, weak = 0.4, ms = 180) {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
    for (const p of navigator.getGamepads()) {
      if (!p || !p.connected) continue;
      const act = p.vibrationActuator;
      if (act && typeof act.playEffect === 'function') {
        act.playEffect('dual-rumble', {
          duration: ms, startDelay: 0,
          strongMagnitude: strong, weakMagnitude: weak,
        }).catch(() => {});
      }
      return; // first connected pad only — matches pollGamepad()
    }
  }
}
