// inputManager.js — raw device input -> intent, every frame.
//
// Supports keyboard and gamepad from day one (the 2K feel wants a controller).
// It does NOT know about the world or the camera. It reports intent in SCREEN
// space (x = right, y = up/away-from-camera) plus button states; main.js rotates
// that into a world-space move vector using the current camera basis and wraps
// it in a wire-ready command.

const KEY_MOVE = {
  KeyW: [0, 1], ArrowUp: [0, 1],
  KeyS: [0, -1], ArrowDown: [0, -1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
};

export class InputManager {
  constructor(target = window) {
    this.keys = new Set();
    this.sprintHeld = false;
    // Edge-triggered buttons: true for exactly one sample after a press.
    this._cycleCamQueued = false;
    this._gamepadCyclePrev = false;

    target.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.sprintHeld = true;
      if (e.code === 'KeyC') this._cycleCamQueued = true;
      if (KEY_MOVE[e.code] || e.code === 'KeyC') e.preventDefault();
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

  // Returns { moveX, moveY, sprint, cycleCam } in screen space.
  sample() {
    let x = 0;
    let y = 0;
    for (const code of this.keys) {
      const m = KEY_MOVE[code];
      if (m) { x += m[0]; y += m[1]; }
    }
    let sprint = this.sprintHeld;
    let cycleCam = this._cycleCamQueued;
    this._cycleCamQueued = false;

    // --- Gamepad overlays keyboard if a stick is pushed. ---
    const pad = this._firstGamepad();
    if (pad) {
      const gx = applyDeadzone(pad.axes[0] ?? 0);
      const gy = applyDeadzone(pad.axes[1] ?? 0);
      if (gx !== 0 || gy !== 0) { x = gx; y = -gy; } // stick up is -Y on a pad
      // RB / R1 (button 5) or right trigger (button 7) to sprint.
      if (pressed(pad, 5) || pressed(pad, 7)) sprint = true;
      // Y / triangle (button 3) cycles camera, edge-triggered.
      const cyc = pressed(pad, 3);
      if (cyc && !this._gamepadCyclePrev) cycleCam = true;
      this._gamepadCyclePrev = cyc;
    }

    // Normalize diagonal keyboard input so it isn't faster.
    const mag = Math.hypot(x, y);
    if (mag > 1) { x /= mag; y /= mag; }

    return { moveX: x, moveY: y, sprint, cycleCam };
  }

  _firstGamepad() {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
    for (const p of navigator.getGamepads()) {
      if (p && p.connected) return p;
    }
    return null;
  }
}

function applyDeadzone(v, dz = 0.18) {
  return Math.abs(v) < dz ? 0 : v;
}

function pressed(pad, i) {
  const b = pad.buttons[i];
  return !!b && (b.pressed || b.value > 0.5);
}
