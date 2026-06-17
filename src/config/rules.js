// rules.js — match structure & field dimensions.
//
// FINA water polo is played in a 30m x 20m field of play. We model the pool to
// those proportions. Periods / shot clock live here too so referee + state
// machine (added in later milestones) read from one place.

export const POOL = {
  length: 30, // X axis, goal line to goal line
  width: 20, // Z axis, side to side
  // Visual deck/gutter margin around the field of play (cosmetic only).
  margin: 3,
  goalWidth: 3, // 3m between the posts
  goalHeight: 0.9, // 0.9m above the surface
  fiveMeter: 5,
  twoMeter: 2,
};

export const MATCH = {
  periods: 4,
  periodSeconds: 120, // arcade-shortened default (real is 8:00)
  shotClockSeconds: 30,
};
