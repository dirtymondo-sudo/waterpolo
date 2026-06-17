// gamepad.js — turns a raw Gamepad into a semantic, controller-agnostic snapshot.
//
// Built around the Nintendo Switch Pro Controller (USB) but works with any
// XInput / "standard" pad. The Gamepad API hands us two very different worlds
// and we have to cope with both:
//
//   • mapping === 'standard'  — the W3C spec remaps every control to a FIXED
//     index BY PHYSICAL POSITION. This is what modern Chrome / Edge / Firefox
//     report for a Switch Pro over USB, so it's our primary path. One gotcha:
//     the Switch's face-button LABELS are mirrored vs an Xbox pad, so by spec
//     index the EAST button (1) is printed "A", SOUTH (0) is "B", NORTH (3) is
//     "X", WEST (2) is "Y". We map by Nintendo label so the on-screen prompts
//     match what's engraved on the controller.
//
//   • mapping === ''          — raw HID order, which is browser/OS dependent.
//     We apply the documented Chrome Switch-Pro raw layout as a best-effort
//     fallback and read the D-pad off the hat axis. Most users on a current
//     browser land in the 'standard' path above and never need this.
//
// This module is PURE: it reads a Gamepad and returns a plain snapshot. Edge
// detection (press-vs-hold) and any state live in inputManager.js. No sim, no
// Three.js, no DOM — same rules as the rest of src/input.

// W3C "standard" gamepad layout. Buttons are by physical position; the comment
// after each is the Switch Pro's printed label for that position.
const STD = {
  axes: { lx: 0, ly: 1, rx: 2, ry: 3 },
  buttons: {
    south: 0,  // B
    east: 1,   // A
    west: 2,   // Y
    north: 3,  // X
    l: 4, r: 5, zl: 6, zr: 7,
    minus: 8, plus: 9,
    l3: 10, r3: 11,
    dup: 12, ddown: 13, dleft: 14, dright: 15,
    home: 16, capture: 17,
  },
};

// Best-effort raw-HID layout Chrome exposes for an UNRECOGNISED Switch Pro
// (mapping === ''). Order seen on the wire is B, A, Y, X, L, R, ZL, ZR, …, with
// the D-pad delivered as an 8-way hat on a high axis index instead of buttons.
const RAW_SWITCHPRO = {
  axes: { lx: 0, ly: 1, rx: 2, ry: 3, dpadHat: 9 },
  buttons: {
    south: 0,  // B
    east: 1,   // A
    west: 2,   // Y
    north: 3,  // X
    l: 4, r: 5, zl: 6, zr: 7,
    minus: 8, plus: 9,
    l3: 10, r3: 11,
    home: 12, capture: 13,
    // No reliable D-pad buttons in raw mode — see dpadHat above.
    dup: -1, ddown: -1, dleft: -1, dright: -1,
  },
};

// Nintendo's vendor (057e) and the Pro Controller's product id (2009) both show
// up in the Gamepad.id string regardless of mapping, plus the readable name.
function isSwitchPro(id = '') {
  const s = id.toLowerCase();
  return (
    (s.includes('057e') && (s.includes('2009') || s.includes('pro controller'))) ||
    s.includes('pro controller') ||
    s.includes('switch')
  );
}

export function describeGamepad(pad) {
  if (!pad) return { profile: 'none', label: 'no controller' };
  const sw = isSwitchPro(pad.id);
  return {
    profile: sw ? 'switch-pro' : 'standard',
    label: sw ? 'Switch Pro Controller' : pad.id.replace(/\s*\([^)]*\)\s*/g, ' ').trim() || 'Gamepad',
    mapping: pad.mapping || 'non-standard',
  };
}

// Radial deadzone: scales the WHOLE vector so a small push in any direction is
// ignored but diagonal magnitude isn't clipped. Re-normalises past the dead
// edge so the usable range is the full 0..1.
function radialDeadzone(x, y, dz = 0.18) {
  const m = Math.hypot(x, y);
  if (m < dz) return [0, 0];
  const scaled = (m - dz) / (1 - dz);
  const k = Math.min(1, scaled) / m;
  return [x * k, y * k];
}

// Decode an 8-way hat axis (values roughly -1..+1 around the circle, 8 detents)
// into the four cardinal booleans. ~1.x or NaN means "centre / not pressed".
function decodeHat(v) {
  const out = { up: false, down: false, left: false, right: false };
  if (v == null || v > 1.05 || Number.isNaN(v)) return out;
  // Map the detent ring to compass directions (this is the common Chrome layout).
  const a = Math.round(((v + 1) / 2) * 8) % 8; // 0..7
  if (a === 0 || a === 1 || a === 7) out.up = true;
  if (a === 3 || a === 4 || a === 5) out.down = true;
  if (a === 5 || a === 6 || a === 7) out.left = true;
  if (a === 1 || a === 2 || a === 3) out.right = true;
  return out;
}

function btn(pad, i) {
  if (i == null || i < 0) return false;
  const b = pad.buttons[i];
  return !!b && (b.pressed || b.value > 0.5);
}
function axis(pad, i) {
  return i == null ? 0 : (pad.axes[i] ?? 0);
}

// Read the first connected gamepad into a semantic snapshot, or null if none.
// Fields are intent-level so inputManager doesn't care which pad it is.
export function pollGamepad() {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
  let pad = null;
  for (const p of navigator.getGamepads()) {
    if (p && p.connected) { pad = p; break; }
  }
  if (!pad) return null;

  const standard = pad.mapping === 'standard';
  const map = standard ? STD : (isSwitchPro(pad.id) ? RAW_SWITCHPRO : STD);

  // Left stick -> screen space (stick up is -axis, screen "forward" is +y).
  let [lx, ly] = radialDeadzone(axis(pad, map.axes.lx), axis(pad, map.axes.ly));
  let moveX = lx;
  let moveY = -ly;

  // D-pad doubles as a digital move (buttons in standard mode, hat axis in raw).
  let dUp, dDown, dLeft, dRight;
  if (standard) {
    dUp = btn(pad, map.buttons.dup);
    dDown = btn(pad, map.buttons.ddown);
    dLeft = btn(pad, map.buttons.dleft);
    dRight = btn(pad, map.buttons.dright);
  } else {
    const h = decodeHat(axis(pad, map.axes.dpadHat));
    dUp = h.up; dDown = h.down; dLeft = h.left; dRight = h.right;
  }
  if (moveX === 0 && moveY === 0 && (dUp || dDown || dLeft || dRight)) {
    let dx = (dRight ? 1 : 0) - (dLeft ? 1 : 0);
    let dy = (dUp ? 1 : 0) - (dDown ? 1 : 0);
    const m = Math.hypot(dx, dy) || 1;
    moveX = dx / m; moveY = dy / m;
  }

  const b = map.buttons;
  return {
    id: pad.id,
    index: pad.index,
    ...describeGamepad(pad),
    moveX,
    moveY,
    // ZR / ZL triggers (or R bumper) for the sprint "turbo".
    sprint: btn(pad, b.zr) || btn(pad, b.zl),
    // Face buttons by Nintendo label: A shoot, X skip, Y lob, B is unused here.
    shootNormal: btn(pad, b.east),  // A
    shootSkip: btn(pad, b.north),   // X
    shootLob: btn(pad, b.west),     // Y
    pass: btn(pad, b.l),            // L bumper
    switchSteal: btn(pad, b.r),     // R bumper (switch player / lunge for steal)
    cycleCam: btn(pad, b.minus),    // − cycles the camera
    pause: btn(pad, b.plus),        // + reserved for a future pause
  };
}
