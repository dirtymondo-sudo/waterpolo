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
    fov: 50,
    near: 0.1,
    far: 400,
  },
};
