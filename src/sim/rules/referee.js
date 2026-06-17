// referee.js — clocks, goal detection, and the match-flow state machine.
//
// Headless and deterministic. Reads/writes only plain state. Goal detection runs
// AFTER ball physics each tick: the ball walls leave the goal mouth open, so a
// ball on target has already crossed the line by the time we check here.
//
// Phases: swimOff -> play -> (goal -> play) ... -> periodEnd -> swimOff/fullTime.

import { POOL, MATCH } from '../../config/rules.js';
import { TUNABLES } from '../../config/tunables.js';
import { setSwimOff, kickoffTo } from '../world.js';

const HALF_L = POOL.length / 2;

// In-play referee: clocks, goals, end of period. Called only while phase==='play'.
export function updateReferee(state, dt) {
  checkGoal(state);
  if (state.phase !== 'play') return; // a goal ended the play this tick

  // Shot clock only runs while a team is in possession.
  if (state.possession !== null) {
    state.shotClock = Math.max(0, state.shotClock - dt);
    if (state.shotClock <= 0) turnover(state);
  }

  state.periodClock = Math.max(0, state.periodClock - dt);
  if (state.periodClock <= 0) endPeriod(state);
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
  state.phaseTimer = TUNABLES.match.goalPauseSeconds;
  state.possession = null;
  state.ball.vx = state.ball.vy = state.ball.vz = 0;
  state.ball.held = false;
}

function endPeriod(state) {
  state.phase = 'periodEnd';
  state.phaseTimer = TUNABLES.match.periodEndSeconds;
  state.possession = null;
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

// --- Non-play phase tickers (called from step while frozen) -------------------

// Swim-off whistle: when the countdown hits zero, unlock the ball and play on.
export function tickSwimOff(state, dt) {
  state.phaseTimer -= dt;
  if (state.phaseTimer <= 0) {
    state.ball.locked = false;
    state.phase = 'play';
  }
}

export function tickGoalPause(state, dt) {
  state.phaseTimer -= dt;
  if (state.phaseTimer <= 0) {
    // The team that conceded restarts from the centre.
    kickoffTo(state, 1 - state.lastGoalTeam);
    state.phase = 'play';
  }
}

export function tickPeriodEnd(state, dt) {
  state.phaseTimer -= dt;
  if (state.phaseTimer <= 0) {
    if (state.period >= MATCH.periods) {
      state.phase = 'fullTime';
    } else {
      state.period += 1;
      state.periodClock = MATCH.periodSeconds;
      setSwimOff(state);
    }
  }
}
