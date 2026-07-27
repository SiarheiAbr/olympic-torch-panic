// @ts-check
// The game loop: fixed update order and dt clamping (architecture.md).
// `step` is the pure orchestration used by tests; `createLoop` binds it to
// requestAnimationFrame in the browser.

import { MAX_DT } from './tuning.js';
import { SESSION } from './state.js';
import * as torchControl from '../systems/torchControl.js';
import * as runLifecycle from '../systems/runLifecycle.js';
import * as hazardSystem from '../systems/hazardSystem.js';
import * as flameIntegrity from '../systems/flameIntegrity.js';

/**
 * One simulation step. Authoritative order (conventions.md):
 * input -> torchControl -> runLifecycle -> hazardSystem -> flameIntegrity ->
 * run-end check (victory before extinguish). Rendering is the caller's job.
 * REQ-DM-006: nothing advances unless RUNNING; queued input is discarded
 * in any other state so stale events cannot apply on resume (REQ-TOR-006).
 * @param {import('./state.js').GameState} state
 * @param {number} dt - seconds, already clamped
 * @param {{rng: import('./rng.js').Rng}} ctx
 */
export function step(state, dt, ctx) {
  if (state.session === SESSION.RUNNING) {
    torchControl.update(state, dt);
    runLifecycle.update(state, dt, ctx);
    hazardSystem.update(state, dt, ctx);
    flameIntegrity.update(state, dt);
    runLifecycle.checkRunEnd(state);
  } else {
    state.input.queue.length = 0;
    runLifecycle.tickResume(state, dt);
  }
}

/**
 * @param {Object} opts
 * @param {import('./state.js').GameState} opts.state
 * @param {{rng: import('./rng.js').Rng}} opts.ctx
 * @param {(state: import('./state.js').GameState, dt: number) => void} opts.render
 * @param {(state: import('./state.js').GameState) => void} [opts.onRunEnded]
 */
export function createLoop({ state, ctx, render, onRunEnded }) {
  let lastTimestamp = null;
  let rafId = 0;
  let running = false;

  /** @param {number} timestamp */
  function frame(timestamp) {
    const dt = lastTimestamp === null ? 0 : Math.min(MAX_DT, (timestamp - lastTimestamp) / 1000);
    lastTimestamp = timestamp;
    const wasRunning = state.session === SESSION.RUNNING;
    step(state, dt, ctx);
    if (wasRunning && state.session === SESSION.RUN_ENDED && onRunEnded) {
      onRunEnded(state);
    }
    render(state, dt);
    if (running) rafId = requestAnimationFrame(frame);
  }

  return {
    start() {
      if (running) return;
      running = true;
      lastTimestamp = null;
      rafId = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(rafId);
    },
  };
}
