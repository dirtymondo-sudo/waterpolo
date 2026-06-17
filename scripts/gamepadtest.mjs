// gamepad-test.mjs — headless check of the Switch Pro Controller mapping.
//
// gamepad.js is pure (it only reads `navigator.getGamepads()`), so we can fake a
// Gamepad in Node and assert that sticks, triggers, face buttons and the D-pad
// land on the right intents — for both `mapping:"standard"` and the raw-HID
// fallback. No browser needed.

import assert from 'node:assert';

// Minimal Gamepad factory: 18 buttons + 10 axes, both worlds supported.
function makePad({ id = '057e-2009-Pro Controller', mapping = 'standard',
                   axes = [], buttons = [] } = {}) {
  const ax = Array.from({ length: 10 }, (_, i) => axes[i] ?? 0);
  const bt = Array.from({ length: 18 }, (_, i) => ({
    pressed: !!buttons[i], value: buttons[i] ? 1 : 0,
  }));
  return { id, mapping, connected: true, index: 0, axes: ax, buttons: bt };
}

let current = null;
// Node 22 exposes `navigator` as a read-only global, so define our fake over it.
Object.defineProperty(globalThis, 'navigator', {
  value: { getGamepads: () => [current] }, configurable: true, writable: true,
});

const { pollGamepad } = await import('../src/input/gamepad.js');

function withPad(pad, fn) { current = pad; const s = pollGamepad(); fn(s); }

let passed = 0;
const ok = (name, cond) => { assert.ok(cond, name); passed++; };

// --- standard mapping: the primary path for a Switch Pro on modern Chrome ---
withPad(makePad({ axes: [0, -1] }), (s) => {       // left stick full up
  ok('std: profile is switch-pro', s.profile === 'switch-pro');
  ok('std: stick up -> +moveY', s.moveY > 0.9 && Math.abs(s.moveX) < 1e-6);
});
withPad(makePad({ axes: [1, 0] }), (s) => {        // left stick full right
  ok('std: stick right -> +moveX', s.moveX > 0.9 && Math.abs(s.moveY) < 1e-6);
});
withPad(makePad({ axes: [0.1, 0.1] }), (s) => {    // inside the deadzone
  ok('std: deadzone kills tiny input', s.moveX === 0 && s.moveY === 0);
});
// Face buttons by Nintendo label: A=east(1), X=north(3), Y=west(2).
withPad(makePad({ buttons: { 1: 1 } }), (s) => ok('std: A -> normal shot', s.shootNormal && !s.shootSkip && !s.shootLob));
withPad(makePad({ buttons: { 3: 1 } }), (s) => ok('std: X -> skip shot', s.shootSkip));
withPad(makePad({ buttons: { 2: 1 } }), (s) => ok('std: Y -> lob shot', s.shootLob));
withPad(makePad({ buttons: { 4: 1 } }), (s) => ok('std: L -> pass', s.pass));
withPad(makePad({ buttons: { 5: 1 } }), (s) => ok('std: R -> switch/steal', s.switchSteal));
withPad(makePad({ buttons: { 7: 1 } }), (s) => ok('std: ZR -> sprint', s.sprint));
withPad(makePad({ buttons: { 6: 1 } }), (s) => ok('std: ZL -> sprint', s.sprint));
withPad(makePad({ buttons: { 8: 1 } }), (s) => ok('std: minus -> camera', s.cycleCam));
withPad(makePad({ buttons: { 12: 1 } }), (s) => ok('std: D-pad up -> +moveY', s.moveY > 0.9));
withPad(makePad({ buttons: { 15: 1 } }), (s) => ok('std: D-pad right -> +moveX', s.moveX > 0.9));

// --- raw-HID fallback: unrecognised pad reporting mapping:"" ---
withPad(makePad({ mapping: '', axes: [-1, 0] }), (s) => {
  ok('raw: still detected as switch-pro', s.profile === 'switch-pro');
  ok('raw: stick left -> -moveX', s.moveX < -0.9);
});
withPad(makePad({ mapping: '', buttons: { 1: 1 } }), (s) => ok('raw: A -> normal shot', s.shootNormal));

current = null;
ok('no pad -> null', pollGamepad() === null);

console.log(`gamepad-test: ${passed} checks passed`);
