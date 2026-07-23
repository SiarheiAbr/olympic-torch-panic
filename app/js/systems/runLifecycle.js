// @ts-check
// Capability 03 — Run Lifecycle & Progression
// (specification/business/03-run-lifecycle/spec.md)

import {
  TOTAL_DISTANCE,
  ENVIRONMENTS,
  START_GRACE,
  RESUME_COUNTDOWN,
  TORCH_START_ANGLE,
  BANNER_DURATION,
} from '../core/tuning.js';
import { SESSION, OUTCOME, FLAME_STATE, deriveFlameState } from '../core/state.js';

/**
 * Environment is fully derived from distance; stages split TOTAL_DISTANCE
 * into equal segments (business environment table).
 * @param {number} distance
 * @returns {number}
 */
export function environmentIndexForDistance(distance) {
  const segment = TOTAL_DISTANCE / ENVIRONMENTS.length;
  return Math.min(ENVIRONMENTS.length - 1, Math.floor(distance / segment));
}

/** @param {import('../core/state.js').GameState} state */
export function currentEnvironment(state) {
  return ENVIRONMENTS[state.run ? state.run.environmentIndex : 0];
}

/**
 * REQ-RUN-001: fresh run — distance 0, elapsedTime 0, integrity 100, torch at 90 deg.
 * Valid from MAIN_MENU (Start) and RUN_ENDED (Retry, REQ-SCO-009).
 * @param {import('../core/state.js').GameState} state
 */
export function startRun(state) {
  state.session = SESSION.RUNNING;
  state.run = { distance: 0, elapsedTime: 0, environmentIndex: 0, outcome: null };
  state.torch.angle = TORCH_START_ANGLE;
  state.flame = { integrity: 100, state: FLAME_STATE.STRONG };
  state.hazards = [];
  state.input.queue.length = 0;
  state.input.keys = { a: false, d: false };
  state.spawner = { graceRemaining: START_GRACE, nextSpawnIn: 0 };
  state.regen = { timeSinceLoss: Infinity };
  state.resumeCountdown = null;
  state.banner = null;
}

/**
 * REQ-RUN-002/003/004/005: distance and time accrue only while RUNNING;
 * environment derives from distance and its change shows a banner cue.
 * @param {import('../core/state.js').GameState} state
 * @param {number} dt
 */
export function update(state, dt) {
  const run = state.run;
  const env = ENVIRONMENTS[environmentIndexForDistance(run.distance)];
  run.distance = Math.min(TOTAL_DISTANCE, run.distance + env.speed * dt);
  run.elapsedTime += dt;

  const newIndex = environmentIndexForDistance(run.distance);
  if (newIndex !== run.environmentIndex) {
    run.environmentIndex = newIndex;
    state.banner = { name: ENVIRONMENTS[newIndex].name, remaining: BANNER_DURATION };
  }
  if (state.banner) {
    state.banner.remaining -= dt;
    if (state.banner.remaining <= 0) state.banner = null;
  }
}

/**
 * Run-end evaluation, after all systems have updated this frame.
 * REQ-RUN-006 (victory) is checked before REQ-RUN-007 (extinguish) —
 * architecture.md: victory wins when integrity is still > 0 at the crossing.
 * REQ-RUN-008: hazards stop in the same frame (they are discarded here).
 * @param {import('../core/state.js').GameState} state
 */
export function checkRunEnd(state) {
  const run = state.run;
  if (run.distance >= TOTAL_DISTANCE && state.flame.integrity > 0) {
    endRun(state, OUTCOME.REACHED_LA);
  } else if (state.flame.integrity <= 0) {
    endRun(state, OUTCOME.EXTINGUISHED);
  }
}

/** @param {import('../core/state.js').GameState} state @param {string} outcome */
function endRun(state, outcome) {
  state.run.outcome = outcome;
  state.session = SESSION.RUN_ENDED;
  state.hazards = []; // REQ-HAZ-009
  state.banner = null;
  state.flame.state = deriveFlameState(state.flame.integrity);
}

/** REQ-RUN-009 / REQ-ERR-001: RUNNING -> PAUSED; also cancels an in-flight resume countdown. */
export function pause(state) {
  if (state.session === SESSION.RUNNING) state.session = SESSION.PAUSED;
  if (state.session === SESSION.PAUSED) state.resumeCountdown = null;
}

/** REQ-ERR-003: resuming requires explicit action, then a countdown before gameplay. */
export function beginResume(state) {
  if (state.session !== SESSION.PAUSED) return;
  if (RESUME_COUNTDOWN <= 0) {
    state.session = SESSION.RUNNING;
    state.resumeCountdown = null;
  } else {
    state.resumeCountdown = RESUME_COUNTDOWN;
  }
}

/**
 * Ticks the resume countdown while PAUSED. The session stays PAUSED (all
 * gameplay frozen, REQ-DM-006) until the countdown completes.
 * @param {import('../core/state.js').GameState} state
 * @param {number} dt
 */
export function tickResume(state, dt) {
  if (state.session !== SESSION.PAUSED || state.resumeCountdown === null) return;
  state.resumeCountdown -= dt;
  if (state.resumeCountdown <= 0) {
    state.resumeCountdown = null;
    state.session = SESSION.RUNNING;
  }
}

/** REQ-RUN-010: quitting from PAUSED discards the run without a ScoreEntry. */
export function quitToMenu(state) {
  if (state.session !== SESSION.PAUSED) return;
  state.session = SESSION.MAIN_MENU;
  state.run = null;
  state.hazards = [];
  state.resumeCountdown = null;
  state.banner = null;
}
