# Water Polo Game — Development Plan

A browser-based, fast-paced, 2K-style water polo game built with Three.js. Control one player at a time, switch players on the fly, with a tracking broadcast camera. Visual priority is the water and the player models.

---

## 1. Vision & design pillars

- **Fast, arcade-leaning, addictive.** The core loop is *swim → pass → shoot → score* under a 30-second shot clock. Urgency comes from the clock; swing moments come from exclusion fouls (man-up / man-down), which are water polo's version of a power play.
- **Semi-realistic, slightly stylized.** Not a sim, not cartoon. Believable water and athletes, but readable and snappy.
- **2K-style control.** One active player, fluid switching, context-sensitive actions, a camera that follows and leads the ball.
- **Water and models are the showcase.** Most of the visual budget goes here.

> **Key insight:** water polo players are mostly submerged — you primarily see head, cap, shoulders, upper arms, and the reaching arm on a shot. This dramatically reduces the modeling and animation burden and focuses effort on the upper body, the water surface, and the waterline.

---

## 2. Tech stack

| Area | Choice | Notes |
|---|---|---|
| Rendering | Three.js (WebGL) | Custom water shader; GLTF models |
| Language | Vanilla JS, ES modules | No game framework |
| Build | Vite | HMR, fast dev, proper module project from day one |
| Physics | **Custom lightweight** | Kinematic players + simple ball ballistics. Avoid a physics engine — "feel" comes from hand-tuned movement, not emergent rigid-body sim. (Rapier optional later if we want emergent contact/pileups.) |
| Networking | Authoritative server + prediction (later) | See architecture below |

---

## 3. Architecture — the one principle everything hangs off

**The simulation is the source of truth. Rendering is just a view of it.**

Because online multiplayer is a goal, the netcode path is an **authoritative server with client-side prediction, server reconciliation, and entity interpolation** (the Source / Overwatch model) — *not* deterministic lockstep (cross-browser float determinism is brittle and lockstep adds input lag).

Three rules go in from day one so we never have to rewrite for multiplayer:

1. **The simulation is headless and pure-ish:** `step(state, inputs, dt) → newState`. State is plain serializable data — no Three.js objects inside it.
2. **Rendering is a view** that reads sim state and interpolates between the last two states. The Three.js scene is never the source of truth.
3. **Inputs are timestamped command objects** (move vector + buttons), not direct mutations. Commands are exactly what gets sent over the wire later.

This costs almost nothing now and pays off even in single-player: deterministic replays (for the goal cam), testable logic, and clean rollback later.

**Data flow:** `Input → Commands → Simulation (authoritative, fixed 60Hz) → Sim State (serializable) → Render (interpolated view)`. When online, commands go to the server, the server runs the authoritative sim, and snapshots come back to clients for reconciliation.

---

## 4. File structure

```
src/
  main.js                bootstrap: sim + renderer + input, runs the loop
  config/
    tunables.js          the "feel" knobs (speed, drag, shot curve, cam damping)
    rules.js             periods, 30s shot clock, foul definitions
    teams.js             rosters + player ratings (2K-style attributes)
  sim/                   AUTHORITATIVE. headless, no three.js, all serializable
    world.js             state container: players, ball, clock, score
    step.js              step(state, inputs, dt) -> newState
    movement.js          swim kinematics, drag, stamina
    ball.js              ballistics (air vs water), possession
    rng.js               seeded RNG (reproducible replays + sync-safe)
    rules/
      referee.js         fouls, out-of-bounds, goal detection, shot clock
      stateMachine.js    swim-off -> play -> deadball -> restarts -> periods
    ai/
      offense.js  defense.js  goalie.js
  render/                THREE.js VIEW of sim state. interpolates. no game logic
    renderer.js  cameraRig.js  lighting.js
    water/               surface shader, reflection/refraction, caustics, foam, wake
    springBones.js       generic secondary motion ("jiggle" — chest, hair, straps)
    entities/
      playerView.js      mesh + anim state machine, drives springBones from accel
      ballView.js  goalView.js  poolView.js
    fx/                  splashes, bubbles, replays, slow-mo
  input/
    inputManager.js      keyboard+mouse+gamepad -> command object per frame
    commands.js          command schema (wire-ready)
  ui/
    hud.js  menus.js
  net/                   (empty for now) transport, snapshots, prediction
  assets/                gltf models, normal/caustic maps, sounds
index.html   vite.config.js   package.json
```

**The single most important file long-term is `config/tunables.js`** — every "feel" number (swim accel, max speed, drag, shot power curve, pass speed, goalie reaction time, camera damping) lives in one place so we can iterate toward *fun* fast.

Note: `springBones.js` lives in `render/`, not `sim/`. Secondary motion is pure visual flair — it never touches authoritative state and never syncs over the network (each client computes its own).

---

## 5. The three hard problems

### Water
Start with Three.js's built-in `Water` to get moving, then upgrade to a custom `ShaderMaterial` combining:
- Planar reflection (Reflector) + refraction by sampling a render target of the underwater scene
- Fresnel mix between reflection and refraction
- Animated normals from two scrolling normal maps (+ optional gentle Gerstner displacement)
- Depth-based color darkening (deeper = darker blue)

Two cheap tricks that sell it:
- **Caustics** — an animated/scrolling caustic texture projected onto the pool floor.
- **Foam ring at the waterline** — computed in screen space: sample the depth buffer and draw foam where body geometry meets the water plane. This is the key to making bodies look like they're *in* the water.

Plus: splash particle bursts on shots/entries, and a wake trail behind swimmers.

### Models
Two phases:
- **Phase 1 (prototype):** procedural primitives — capsule torso + sphere head + colored cap + simple arms. Ugly but enough to nail controls and camera immediately.
- **Phase 2 (V1):** one rigged GLTF base mesh with **morph targets for male/female body type**, a separate cap mesh tinted per team, swimsuit texture. Keep poly count modest since most of the body is submerged.

**Jiggle / secondary motion:** a generic **spring-bone system** (damped springs driven by each bone's acceleration). One reusable system drives chest, hair, and cap/suit straps off the player's movement and the tread-water bob — not a one-off.

Animation clips needed (few): tread-idle, sprint-swim, pass, shoot, lob, arms-up block, goalie ready, goalie dive (L/R/up). Blend with a small state machine. Arm IK reaching toward the ball is later polish.

### Controls & camera (2K-style)
- **Input abstraction** supporting keyboard+mouse and gamepad from day one (the 2K feel wants a controller).
- **Active-player system:** ring marker under the controlled player, manual cycle (Tab / bumper), auto-switch to nearest defender on the ball, switch to nearest on a loose ball.
- **Offense:** pass (game picks best teammate in facing/stick direction), shoot (hold-to-charge, aim, release), lob/skip on a modifier, pump-fake, sprint (stamina).
- **Defense:** press/swim, raise arms (a block cone that cuts shot/pass lanes), steal, sprint.
- **Camera:** elevated 3/4 broadcast rig that tracks and slightly *leads* the ball, zooms in the attacking third, snaps behind the shooter on charge, goes cinematic on goals. All critically-damped lerps — never snappy. Multiple modes (broadcast / side / dynamic).

---

## 6. Rules → systems mapping

Implemented by `sim/rules/referee.js` and driven through `stateMachine.js`:

- **Teams:** 7 in the pool (goalie + 6 field), 13 on roster, substitutions.
- **Clock:** 4 periods; arcade-shortened by default, real lengths optional. **30-second shot clock** (possession limit).
- **Scoring:** goal when the whole ball crosses the line between the posts; no direct goal from a free throw unless taken from 6m+ without undue delay.
- **Fouls:**
  - *Minor* → free throw (taken from the spot, or the 2m line if inside it).
  - *Exclusion* → 20s man-up / man-down (the strategic core). Player returns early if the other team scores, or after 20s.
  - *Penalty* → 5m penalty throw for a major foul in the 5/6m area.
- **Restarts:** swim-off to start periods; out-of-bounds → goal throw / corner throw; neutral throw for simultaneous fouls.
- **Discipline:** 3 personal fouls = out for the game; brutality/misconduct = ejection (full handling is a later feature).

---

## 7. Feature roadmap

### MVP — the addictive core
- Pool + good-enough water + goals
- 6v6 + goalies with procedural placeholder models
- Swim movement, player switching, broadcast camera
- Pass and charge-shoot with goalie save AI
- Goal detection + score; period clock + 30s shot clock
- Basic out-of-bounds restarts + one simple foul → free throw
- HUD (score / clock / shot clock / possession), swim-off start, win screen
- Core sounds: splash, whistle, crowd, goal horn

### V1 — depth & polish
- Exclusion fouls + 20s man-up / man-down (the strategic hook)
- GLTF male/female models + animation state machine + spring-bone secondary motion
- Upgraded water shader: caustics, foam ring, wake
- Player attributes/ratings (speed, shot power, accuracy, stamina) — 2K flavor
- Smarter AI: off-ball movement, set offense, man/zone defense, goalie reads
- Penalty / corner / goal / neutral throws; stamina + substitutions
- Camera polish, goal replays, slow-mo

### Later — stretch
- Roster / season / tournament modes; create-a-player; playbooks
- Difficulty levels
- Local multiplayer (2 controllers) → **online multiplayer** (fill in `net/`)
- Mobile / touch controls
- Full brutality/misconduct refereeing

---

## 8. Build milestones (ordered)

0. **Running prototype.** Scaffold Vite; pool + passable water; one keyboard-controllable swimmer; broadcast camera tracking it; sim/render loop wired correctly. Proves the architecture runs and the water looks right.
1. **Core gameplay loop.** Ball, passing, charge-shoot, goalie save, goal detection, score, shot clock. The first *fun* build.
2. **Match flow.** State machine: swim-off → play → deadball → restarts → periods; HUD; win screen; basic fouls.
3. **Depth.** Exclusion fouls + man-up/man-down; AI for teammates/defenders/goalie; player switching polish.
4. **Visual upgrade.** GLTF models + animation + spring-bone jiggle; custom water shader with caustics/foam/wake; replays.
5. **Ratings & modes.** Player attributes, team data, difficulty, set plays.
6. **Multiplayer.** Local first, then online (prediction + reconciliation + interpolation).

---

## 9. Decisions log

- **Art direction:** semi-realistic, slightly stylized; female models get jiggle (spring-bone secondary motion).
- **Build:** modular Vite project from the start.
- **Multiplayer:** online eventually → authoritative-server architecture, sim/render/command separation enforced from day one.
- **Physics:** custom lightweight, not a physics engine.

## 10. Open questions / risks

- Determinism vs forgiveness in netcode — confirm authoritative-server prediction model holds up for the contact-heavy gameplay before investing in `net/`.
- Asset pipeline for GLTF models (Blender source, morph targets) — decide tooling before Milestone 4.
- Performance budget for the custom water shader on lower-end GPUs — may need a quality toggle.
- How "arcade" vs "realistic" the foul system should be — tune once the core loop is fun.
