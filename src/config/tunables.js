// tunables.js — THE single source of "feel".
//
// Every number that affects how the game *feels* lives here so we can iterate
// toward fun fast. Sim code imports from here; nothing here imports sim code.
// Units: metres, seconds, metres/second. World is X (length) by Z (width),
// Y is up. The water surface sits at y = 0.

export const TUNABLES = {
  // --- Simulation ---
  sim: {
    hz: 60, // authoritative fixed timestep
  },

  // --- Swim movement (kinematic, hand-tuned — not rigid-body physics) ---
  swim: {
    accel: 22, // m/s^2 toward the input direction
    maxSpeed: 4.2, // m/s cruising
    sprintMaxSpeed: 6.4, // m/s while sprinting
    sprintAccel: 32, // m/s^2 while sprinting
    drag: 3.2, // velocity damping per second (water resistance)
    turnRate: 9, // rad/s the heading chases the velocity direction
    deadzone: 0.12, // ignore tiny analog/stick noise
  },

  // --- Stamina (drained by sprinting, regenerates otherwise) ---
  stamina: {
    max: 1,
    sprintDrain: 0.28, // per second while sprinting
    regen: 0.18, // per second while not sprinting
    minToSprint: 0.05, // can't kick into sprint below this
  },

  // --- Camera: elevated 3/4 broadcast rig. All damped, never snappy. ---
  camera: {
    height: 16, // metres above the water
    distance: 19, // metres back from the look target
    lead: 2.6, // how far ahead of the player's velocity the cam looks
    leadClamp: 6, // max lead offset (metres)
    posDamp: 2.6, // critically-damped follow stiffness (higher = tighter)
    lookDamp: 4.0, // look-target follow stiffness
    // "endline" mode: stand behind your team's goal and look down the long axis
    // so the pool reads vertically (portrait), like a player's-eye end view.
    endlineHeight: 7, // metres above the water for the end view
    endlineDistance: 9, // metres back behind the goal line
    endlineTeam: 0, // which team's end to stand at (0 defends -X, 1 defends +X)
    fov: 50,
    near: 0.1,
    far: 400,
  },

  // --- Ball physics (custom lightweight ballistics, air vs water) ---
  ball: {
    radius: 0.11, // ~size-5 ball
    airDrag: 0.12, // light drag while flying
    waterDrag: 2.8, // heavy drag once floating on the surface
    carryDist: 0.45, // metres in front of the carrier's hands
    carryHeight: 0.42, // height the carried ball rides at
  },

  // --- Possession (pickups, saves, steals of loose balls) ---
  possession: {
    pickupRadius: 0.85, // field player reach (horizontal)
    pickupHeight: 0.9, // can only grab a ball below this height
    shotCooldown: 0.4, // the shooter/passer can't re-grab for this long
  },

  // --- Shooting: hold to charge, release to fire. Three trajectories. ---
  // speed multiplies (baseSpeed + charge*chargeSpeed); each type owns its own
  // gravity so the FEEL of each shot is independent and tunable.
  shot: {
    baseSpeed: 13, // m/s horizontal at zero charge
    chargeSpeed: 10, // extra m/s at full charge
    chargeTime: 0.85, // seconds of hold to reach full power
    releaseHeight: 0.45, // height the shot leaves the hand
    types: {
      // Flat, fast laser. Barely arcs — the bread-and-butter shot.
      normal: { speed: 1.0, vy: 1.2, gravity: 3.5, bounces: 0, restitution: 0 },
      // High, slow arc that climbs over the keeper and drops into the goal.
      // Deliberately loopy (low horizontal speed, steep gravity) — a finesse
      // shot for the 5-6m range, not a long bomb.
      lob: { speed: 0.34, vy: 8.2, gravity: 20, bounces: 0, restitution: 0 },
      // Driven down into the water so it skips up past the keeper.
      skip: { speed: 1.05, vy: -1.4, gravity: 9, bounces: 1, restitution: 0.6 },
    },
  },

  // --- Passing: quick, flat, leads the receiver slightly ---
  pass: {
    speed: 15, // m/s
    vy: 0.6, // tiny loft so it clears the water
    gravity: 2.0,
    lead: 0.22, // seconds of receiver-velocity lead
  },

  // --- AI ---
  goalie: {
    lineOffset: 0.7, // metres in front of its own goal line
    zClamp: 1.75, // how far off-centre it slides to track the ball
    reach: 1.4, // horizontal save reach (bigger than a field player)
    reachHeight: 1.6, // vertical save reach
  },
  defense: {
    pressDist: 1.2, // how tightly a defender sits off the ball carrier
  },
};
