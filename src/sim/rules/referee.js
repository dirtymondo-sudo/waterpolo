// referee.js — clocks, goal detection, and restarts.
//
// Headless and deterministic. Reads/writes only plain state. Goal detection runs
// AFTER ball physics each tick: the ball walls leave the goal mouth open, so a
// ball on target has already crossed the line by the time we check here.

import { POOL, MATCH } from '../../config/rules.js';
import { kickoff } from '../world.js';

const HALF_L = POOL.length / 2;
const GOAL_PAUSE = 1.3; // seconds of "GOAL!" celebration before the restart

export function updateReferee(state, dt) {
  state.periodClock = Math.max(0, state.periodClock - dt);

  checkGoal(state);
  if (state.phase !== 'play') return; // a goal was just scored this tick

  // Shot clock only runs while a team is in possession of the ball.
  if (state.possession !== null) {
    state.shotClock = Math.max(0, state.shotClock - dt);
    if (state.shotClock <= 0) turnover(state);
  }
}

function checkGoal(state) {
  const b = state.ball;
  if (b.held) return;
  const gw = POOL.goalWidth / 2;
  const gh = POOL.goalHeight;
  if (Math.abs(b.z) >= gw || b.y >= gh) return;

  if (b.x > HALF_L) score(state, 0); // crossed team 1's line -> team 0 scores
  else if (b.x < -HALF_L) score(state, 1);
}

function score(state, team) {
  state.score[team] += 1;
  state.lastGoalTeam = team;
  state.phase = 'goal';
  state.goalTimer = GOAL_PAUSE;
  state.possession = null;
  // Park the ball just inside the net so the render shows where it went in.
  state.ball.vx = state.ball.vy = state.ball.vz = 0;
  state.ball.held = false;
}

// Drop the ball where it is and reset the clock; nearby opponents recover it.
function turnover(state) {
  const b = state.ball;
  if (b.held) {
    b.lastOwnerId = b.ownerId;
    b.held = false;
    b.ownerId = null;
    b.inAir = false;
    b.pickupCooldown = 0.2;
  }
  state.possession = null;
  state.shotClock = MATCH.shotClockSeconds;
}

// Called from step() while in the 'goal' phase to run the celebration pause.
export function tickGoalPause(state, dt) {
  state.goalTimer -= dt;
  if (state.goalTimer <= 0) {
    kickoff(state);
    state.phase = 'play';
  }
}
