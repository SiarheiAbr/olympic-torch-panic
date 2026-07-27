// @ts-check
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  TOTAL_DISTANCE,
  ENVIRONMENTS,
  START_GRACE,
  RESUME_COUNTDOWN,
  SPEED_JITTER,
} from '../../app/js/core/tuning.js';
import { SESSION, OUTCOME, HAZARD_STATE, createInitialState } from '../../app/js/core/state.js';
import * as runLifecycle from '../../app/js/systems/runLifecycle.js';
import { step } from '../../app/js/core/loop.js';
import { makeCtx, makeRunningState, simulate } from '../helpers/sim.js';

describe('run lifecycle', () => {
  it('REQ-RUN-001: start resets distance, time, integrity, torch angle', () => {
    const state = createInitialState();
    state.torch.angle = 170;
    state.flame.integrity = 12;
    runLifecycle.startRun(state);
    assert.equal(state.session, SESSION.RUNNING);
    assert.equal(state.run.distance, 0);
    assert.equal(state.run.elapsedTime, 0);
    assert.equal(state.flame.integrity, 100);
    assert.equal(state.torch.angle, 90);
    assert.equal(state.hazards.length, 0);
    assert.equal(state.spawner.graceRemaining, START_GRACE);
  });

  it('REQ-RUN-002/003: distance and time accrue at jittered environment speed while RUNNING', () => {
    const state = makeRunningState();
    const ctx = makeCtx();
    simulate(state, 2, ctx);
    const factor = state.run.speedFactor;
    assert.ok(factor >= 1 - SPEED_JITTER && factor <= 1 + SPEED_JITTER, `factor ${factor}`);
    assert.ok(Math.abs(state.run.distance - ENVIRONMENTS[0].speed * factor * 2) < 0.01);
    assert.ok(Math.abs(state.run.elapsedTime - 2) < 0.01);
  });

  it('REQ-RUN-011: victory survival times differ between runs (per-stage speed jitter)', () => {
    const times = new Set();
    for (const seed of [1, 2, 3]) {
      const state = makeRunningState();
      const ctx = makeCtx(seed);
      // suppress hazards so each run is a clean, full-length victory
      state.spawner.graceRemaining = 0;
      state.spawner.nextSpawnIn = 1e9;
      let guard = 0;
      while (state.session === SESSION.RUNNING && guard++ < 15_000) {
        step(state, 1 / 6, ctx); // coarse steps keep the test fast
      }
      assert.equal(state.run.outcome, OUTCOME.REACHED_LA, `seed ${seed} must win`);
      // total time stays inside the jitter envelope around the ~149 s baseline
      const baseline = ENVIRONMENTS.reduce(
        (s, env) => s + TOTAL_DISTANCE / ENVIRONMENTS.length / env.speed,
        0
      );
      assert.ok(
        state.run.elapsedTime > baseline / (1 + SPEED_JITTER) - 1 &&
          state.run.elapsedTime < baseline / (1 - SPEED_JITTER) + 1,
        `seed ${seed}: ${state.run.elapsedTime.toFixed(1)}s outside envelope`
      );
      times.add(state.run.elapsedTime.toFixed(1));
    }
    assert.ok(times.size >= 2, `times should differ across seeds, got ${[...times]}`);
  });

  it('REQ-RUN-004/005: environment changes at the boundary and shows a banner', () => {
    const state = makeRunningState();
    const ctx = makeCtx();
    state.run.distance = TOTAL_DISTANCE / ENVIRONMENTS.length - 0.01;
    step(state, 1 / 60, ctx);
    assert.equal(state.run.environmentIndex, 1);
    assert.equal(state.banner.name, ENVIRONMENTS[1].name);
  });

  it('REQ-RUN-006: reaching TOTAL_DISTANCE with integrity > 0 is a victory', () => {
    const state = makeRunningState();
    const ctx = makeCtx();
    state.run.distance = TOTAL_DISTANCE - 0.01;
    state.run.environmentIndex = ENVIRONMENTS.length - 1;
    step(state, 1 / 60, ctx);
    assert.equal(state.run.outcome, OUTCOME.REACHED_LA);
    assert.equal(state.session, SESSION.RUN_ENDED);
    assert.equal(state.run.distance, TOTAL_DISTANCE); // never exceeds
  });

  it('REQ-RUN-007/008: extinguish ends the run and discards hazards the same frame', () => {
    const state = makeRunningState();
    const ctx = makeCtx();
    state.run.distance = 1234.5;
    state.flame.integrity = 0;
    state.hazards.push({
      id: 1,
      type: 'WIND_GUST',
      approachAngle: 0,
      profile: 'CONTINUOUS',
      state: HAZARD_STATE.ACTIVE,
      telegraphRemaining: 0,
      telegraphTotal: 1,
      activeElapsed: 1,
      activeSecondsThisFrame: 0,
      impactsThisFrame: [],
      impactsDelivered: 0,
      blocked: false,
      blockedImpactFx: false,
    });
    step(state, 1 / 60, ctx);
    assert.equal(state.run.outcome, OUTCOME.EXTINGUISHED);
    assert.equal(state.session, SESSION.RUN_ENDED);
    assert.equal(state.hazards.length, 0);
    assert.ok(state.run.distance >= 1234.5); // final values preserved
  });

  it('REQ-DM-006: nothing advances while PAUSED', () => {
    const state = makeRunningState();
    const ctx = makeCtx();
    simulate(state, 1, ctx);
    runLifecycle.pause(state);
    const snapshot = JSON.stringify({
      d: state.run.distance,
      t: state.run.elapsedTime,
      i: state.flame.integrity,
      h: state.hazards,
    });
    simulate(state, 10, ctx);
    assert.equal(state.session, SESSION.PAUSED);
    assert.equal(
      JSON.stringify({
        d: state.run.distance,
        t: state.run.elapsedTime,
        i: state.flame.integrity,
        h: state.hazards,
      }),
      snapshot
    );
  });

  it('REQ-ERR-003: resume requires beginResume then a full countdown', () => {
    const state = makeRunningState();
    const ctx = makeCtx();
    runLifecycle.pause(state);
    simulate(state, 5, ctx);
    assert.equal(state.session, SESSION.PAUSED); // no self-resume
    runLifecycle.beginResume(state);
    simulate(state, RESUME_COUNTDOWN - 0.1, ctx);
    assert.equal(state.session, SESSION.PAUSED); // still counting
    simulate(state, 0.2, ctx);
    assert.equal(state.session, SESSION.RUNNING);
  });

  it('an interruption during the countdown cancels it and stays PAUSED', () => {
    const state = makeRunningState();
    const ctx = makeCtx();
    runLifecycle.pause(state);
    runLifecycle.beginResume(state);
    simulate(state, 1, ctx);
    runLifecycle.pause(state); // e.g. tab hidden again
    assert.equal(state.resumeCountdown, null);
    simulate(state, 10, ctx);
    assert.equal(state.session, SESSION.PAUSED);
  });

  it('REQ-RUN-010: quit from PAUSED discards the run', () => {
    const state = makeRunningState();
    runLifecycle.pause(state);
    runLifecycle.quitToMenu(state);
    assert.equal(state.session, SESSION.MAIN_MENU);
    assert.equal(state.run, null);
    assert.equal(state.hazards.length, 0);
  });

  it('environment derivation covers all stages including the finish line', () => {
    assert.equal(runLifecycle.environmentIndexForDistance(0), 0);
    assert.equal(runLifecycle.environmentIndexForDistance(999.99), 0);
    assert.equal(runLifecycle.environmentIndexForDistance(1000), 1);
    assert.equal(runLifecycle.environmentIndexForDistance(4999), 4);
    assert.equal(runLifecycle.environmentIndexForDistance(TOTAL_DISTANCE), 4);
  });
});
