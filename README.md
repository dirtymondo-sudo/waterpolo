# waterpolo

A browser-based, fast-paced, 2K-style water polo game built with Three.js.

The full design doc lives in [`docs/PLAN.md`](docs/PLAN.md).

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
```

`npm run build` produces a static bundle in `dist/`; `npm run preview` serves it.

### Controls (Milestone 0)

- **W A S D** / arrows — swim (camera-relative)
- **Shift** — sprint (drains stamina)
- **C** — cycle camera (broadcast → side → dynamic)
- Gamepad: left stick swim, RB/RT sprint, Y cycle camera

## Status — Milestone 0: Running prototype ✅

Pool + custom water shader (Gerstner waves, Fresnel, animated caustics), one
keyboard/gamepad-controllable swimmer, and a damped broadcast camera that tracks
and leads the action — all running on the multiplayer-ready architecture.

Next up is **Milestone 1: Core gameplay loop** (ball, passing, charge-shoot,
goalie save, goal detection, score, shot clock). See `docs/PLAN.md` §8.

## Architecture (read before extending)

**The simulation is the source of truth. Rendering is just a view of it.** This
is enforced from day one so multiplayer never requires a rewrite:

```
Input → Commands → Simulation (authoritative, fixed 60Hz) → State → Render (interpolated)
```

```
src/
  main.js              bootstrap + fixed-timestep loop + interpolation
  config/
    tunables.js        THE "feel" knobs — tune the game here first
    rules.js           pool dimensions, periods, shot clock
  sim/                 AUTHORITATIVE. headless, no Three.js, all serializable
    world.js           plain-data state container
    step.js            step(state, commands, dt) -> state
    movement.js        swim kinematics, drag, stamina
  input/
    inputManager.js    keyboard/gamepad -> screen-space intent
    commands.js        wire-ready command schema
  render/              THREE.js VIEW only — no game logic, interpolates state
    renderer.js  cameraRig.js  lighting.js
    water/water.js     custom water ShaderMaterial
    entities/          poolView, playerView
scripts/smoke.mjs      headless WebGL boot + input smoke test (Playwright)
```

Rules that must hold:

1. `sim/` state is plain serializable data (no Three.js objects, no class
   instances with behaviour) — it can be JSON-stringified for the wire/replays.
2. `render/` only reads sim state and interpolates between the last two ticks.
3. Input becomes timestamped **command** objects; nothing mutates sim state
   directly.

## Verify

```bash
npm run build
node scripts/smoke.mjs   # boots the build headlessly, drives input, checks for errors
```
