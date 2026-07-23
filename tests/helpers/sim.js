// @ts-check
// Deterministic simulation helpers for unit/integration tests (conventions.md).

import { createRng } from '../../app/js/core/rng.js';
import { createInitialState } from '../../app/js/core/state.js';
import { step } from '../../app/js/core/loop.js';
import * as runLifecycle from '../../app/js/systems/runLifecycle.js';

/** @param {number} [seed] */
export function makeCtx(seed = 42) {
  return { rng: createRng(seed), now: () => '2026-01-01T00:00:00.000Z' };
}

/** Fresh state with a run already started. */
export function makeRunningState() {
  const state = createInitialState();
  runLifecycle.startRun(state);
  return state;
}

/**
 * Advances the full simulation in fixed steps (default ~60 fps).
 * @param {import('../../app/js/core/state.js').GameState} state
 * @param {number} seconds
 * @param {{rng: import('../../app/js/core/rng.js').Rng}} ctx
 * @param {number} [stepS]
 */
export function simulate(state, seconds, ctx, stepS = 1 / 60) {
  let remaining = seconds;
  while (remaining > 1e-9) {
    const dt = Math.min(stepS, remaining);
    step(state, dt, ctx);
    remaining -= dt;
  }
}

/** An ISO-timestamp factory that increments per call, for ranking tests. */
export function makeNowSequence(startMs = 1735689600000) {
  let t = startMs;
  return () => new Date((t += 1000)).toISOString();
}
