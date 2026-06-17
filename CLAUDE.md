# CLAUDE.md

Water polo — a browser Three.js, 2K-style PvP-leaning sports game. Full design
doc: `docs/PLAN.md`. Read it before doing significant work.

## The one rule everything hangs off
**The simulation is the source of truth; rendering is just a view of it.**
- `src/sim/` is authoritative, headless, and PLAIN SERIALIZABLE DATA — no
  Three.js objects, no behaviour-bearing class instances. Never import `three`
  into `sim/`.
- `src/render/` only reads sim state and interpolates between the last two
  ticks. No game logic here.
- Input becomes wire-ready **command** objects (`src/input/commands.js`);
  nothing mutates sim state directly. The loop is fixed-timestep (60Hz) in
  `src/main.js`.

This keeps the door open for the eventual authoritative-server multiplayer
(`src/net/`) without a rewrite.

## Tune the feel here first
`src/config/tunables.js` is the single home for every "feel" number (swim accel,
drag, max speed, stamina, camera damping). `src/config/rules.js` holds pool
dimensions + clock.

## Workflow
- Dev branch: `claude/affectionate-bohr-lxrbbi`. Commit + push your work.
- `npm run dev` to play; `npm run build && node scripts/smoke.mjs` to verify it
  boots in headless WebGL with no console errors (uses Playwright +
  `--use-gl=swiftshader`).
- `node_modules/`, `dist/`, `shots/` are gitignored.

## Roadmap position
Milestone 0 (pool, water, swimmer, camera, loop) is DONE.
Milestone 1 (core loop) is DONE: ball ballistics (`sim/ball.js`), passing, THREE
charge-shot types (normal/skip/lob), goalie save, goal detection + score + shot
clock.
Milestone 2 (match flow) is DONE: state machine in `sim/rules/referee.js`
(swimOff → play → goal → play … → periodEnd → swimOff/fullTime), 4 periods +
period clock, post-goal centre restart to the conceding team, win screen.
Milestone 3 (depth) is DONE: **7v7** (6 field + goalie per side), formation-based
AI (`sim/formations.js` slot tables; off-ball attackers fill their slot, one
defender presses while the rest hold a zone, nearest player chases loose balls),
**exclusion fouls + man-up/man-down** (a mistimed steal in your own 6m is a 20s
sin-bin → `commitFoul` in `sim/ball.js`; lesser fouls give a protected free
throw; excluded players return after 20s or when the man-up team scores), and
switching polish (Tab cycles team-0 field players by proximity; control auto-
snaps to the nearest defender when the opponent wins the ball). A real **CPU**
and **steal mechanic** (`trySteal`) carry over from M2.
Controls: WASD swim, Shift sprint, Space=shoot / E=skip / Q=lob (hold to charge),
F=pass, Tab=switch player (with no ball, a shoot press lunges for a steal),
C=camera (broadcast/side/dynamic/endline).
Next: Milestone 4 — visual upgrade (GLTF models + animation + spring-bone jiggle;
custom water shader with caustics/foam/wake; replays). See `docs/PLAN.md` §8.

Tuning tips: shot feel lives in `TUNABLES.shot` (each type owns its own gravity);
CPU/steal/foul feel in `TUNABLES.ai` / `TUNABLES.steal` / `TUNABLES.foul`; pacing
in `TUNABLES.match`; team shape in `sim/formations.js`.
`node scripts/shot-test.mjs` checks all three trajectories headlessly (the sim is
pure data, so no browser needed) — use it when tuning.
