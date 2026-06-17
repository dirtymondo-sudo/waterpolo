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
Milestone 0 (running prototype: pool, water, swimmer, camera, loop) is DONE.
Next: Milestone 1 — ball, passing, charge-shoot, goalie save, goal detection,
score, shot clock. See `docs/PLAN.md` §8 for the ordered milestones.
