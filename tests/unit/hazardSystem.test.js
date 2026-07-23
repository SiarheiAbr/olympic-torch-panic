// @ts-check
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { HAZARD_TYPES, ENVIRONMENTS, START_GRACE } from '../../app/js/core/tuning.js';
import { HAZARD_STATE } from '../../app/js/core/state.js';
import * as hazardSystem from '../../app/js/systems/hazardSystem.js';
import { createRng } from '../../app/js/core/rng.js';
import { makeCtx, makeRunningState, simulate } from '../helpers/sim.js';

/** Puts the spawner to sleep so crafted hazards can be progressed in isolation. */
function quietSpawner(state) {
  state.spawner.graceRemaining = 0;
  state.spawner.nextSpawnIn = 10_000;
}

describe('hazard system', () => {
  it('REQ-HAZ-005: no hazard exists during START_GRACE', () => {
    const state = makeRunningState();
    const ctx = makeCtx();
    simulate(state, START_GRACE - 0.1, ctx);
    assert.equal(state.hazards.length, 0);
  });

  it('the first hazard appears within [grace+min, grace+max] and never earlier', () => {
    const state = makeRunningState();
    const ctx = makeCtx();
    const dt = 1 / 60;
    let t = 0;
    while (state.hazards.length === 0 && t < 20) {
      simulate(state, dt, ctx);
      t += dt;
    }
    assert.ok(
      t >= START_GRACE + ENVIRONMENTS[0].spawnIntervalMin - 0.05,
      `first hazard too early: ${t.toFixed(2)}s`
    );
    assert.ok(
      t <= START_GRACE + ENVIRONMENTS[0].spawnIntervalMax + 0.05,
      `first hazard too late: ${t.toFixed(2)}s`
    );
  });

  it('REQ-HAZ-005: concurrency cap blocks the spawn attempt', () => {
    const state = makeRunningState();
    quietSpawner(state);
    const env = ENVIRONMENTS[0]; // cap 1
    const rng = createRng(1);
    assert.notEqual(hazardSystem.attemptSpawn(state, env, rng), null);
    assert.equal(hazardSystem.attemptSpawn(state, env, rng), null);
    assert.equal(state.hazards.length, 1);
  });

  it('REQ-HAZ-008: never two live hazards on the same approach angle', () => {
    const state = makeRunningState();
    quietSpawner(state);
    const windOnly = {
      ...ENVIRONMENTS[4],
      maxConcurrentHazards: 5,
      weights: { WIND_GUST: 100, RAIN_SHOWER: 0, DRONE_DOWNDRAFT: 0, BEACH_BALL: 0, FIREWORKS_BURST: 0 },
    };
    const rng = createRng(2);
    const first = hazardSystem.attemptSpawn(state, windOnly, rng);
    const second = hazardSystem.attemptSpawn(state, windOnly, rng);
    assert.notEqual(first.approachAngle, second.approachAngle);
    // both WIND_GUST angles occupied -> no free angle anywhere -> skip
    assert.equal(hazardSystem.attemptSpawn(state, windOnly, rng), null);
  });

  it('REQ-HAZ-006: type mix follows the environment weights (seeded statistics)', () => {
    const counts = { WIND_GUST: 0, RAIN_SHOWER: 0, DRONE_DOWNDRAFT: 0, BEACH_BALL: 0, FIREWORKS_BURST: 0 };
    const rng = createRng(1234);
    const draws = 600;
    for (let i = 0; i < draws; i++) {
      const state = makeRunningState();
      quietSpawner(state);
      const hazard = hazardSystem.attemptSpawn(state, ENVIRONMENTS[0], rng);
      counts[hazard.type]++;
    }
    assert.equal(counts.DRONE_DOWNDRAFT, 0);
    assert.equal(counts.FIREWORKS_BURST, 0);
    assert.ok(Math.abs(counts.WIND_GUST / draws - 0.5) < 0.1, `wind ${counts.WIND_GUST}`);
    assert.ok(Math.abs(counts.RAIN_SHOWER / draws - 0.3) < 0.1, `rain ${counts.RAIN_SHOWER}`);
    assert.ok(Math.abs(counts.BEACH_BALL / draws - 0.2) < 0.1, `ball ${counts.BEACH_BALL}`);
  });

  it('REQ-HAZ-001/003: telegraph runs its full duration, then continuous danger for its duration', () => {
    const state = makeRunningState();
    quietSpawner(state);
    const rng = createRng(3);
    const gustEnv = {
      ...ENVIRONMENTS[0],
      weights: { WIND_GUST: 100, RAIN_SHOWER: 0, DRONE_DOWNDRAFT: 0, BEACH_BALL: 0, FIREWORKS_BURST: 0 },
    };
    const hazard = hazardSystem.attemptSpawn(state, gustEnv, rng);
    const def = HAZARD_TYPES.WIND_GUST;
    const dt = 1 / 60;
    const ctx = makeCtx();

    let telegraphTime = 0;
    while (hazard.state === HAZARD_STATE.TELEGRAPHED) {
      hazardSystem.update(state, dt, ctx);
      telegraphTime += dt;
      assert.ok(telegraphTime < def.telegraph + 3 * dt, 'telegraph should end on time');
    }
    assert.ok(telegraphTime >= def.telegraph - 1e-9, 'became active no earlier than telegraph');

    let activeTotal = hazard.activeSecondsThisFrame; // activation frame may include active time
    while (state.hazards.includes(hazard) && hazard.state === HAZARD_STATE.ACTIVE) {
      hazardSystem.update(state, dt, ctx);
      activeTotal += hazard.activeSecondsThisFrame;
    }
    assert.ok(Math.abs(activeTotal - def.duration) < 0.001, `active for ${activeTotal}s`);
  });

  it('FIREWORKS_BURST delivers 3 impacts 0.4 s apart, then resolves', () => {
    const state = makeRunningState();
    quietSpawner(state);
    const rng = createRng(4);
    const fwEnv = {
      ...ENVIRONMENTS[4],
      weights: { WIND_GUST: 0, RAIN_SHOWER: 0, DRONE_DOWNDRAFT: 0, BEACH_BALL: 0, FIREWORKS_BURST: 100 },
    };
    const hazard = hazardSystem.attemptSpawn(state, fwEnv, rng);
    const ctx = makeCtx();
    const dt = 1 / 60;
    const impactTimes = [];
    let t = 0;
    while (state.hazards.includes(hazard) && t < 5) {
      hazardSystem.update(state, dt, ctx);
      t += dt;
      // count only while the hazard is still live — a removed hazard's
      // per-frame arrays are stale leftovers from its final frame
      if (state.hazards.includes(hazard)) {
        for (const _ of hazard.impactsThisFrame) impactTimes.push(t);
      }
    }
    assert.equal(impactTimes.length, 3);
    assert.equal(hazard.state, HAZARD_STATE.RESOLVED);
    assert.ok(Math.abs(impactTimes[1] - impactTimes[0] - 0.4) < 0.05);
    assert.ok(Math.abs(impactTimes[2] - impactTimes[1] - 0.4) < 0.05);
  });

  it('BEACH_BALL impacts exactly once at the end of its telegraph', () => {
    const state = makeRunningState();
    quietSpawner(state);
    const rng = createRng(5);
    const ballEnv = {
      ...ENVIRONMENTS[0],
      weights: { WIND_GUST: 0, RAIN_SHOWER: 0, DRONE_DOWNDRAFT: 0, BEACH_BALL: 100, FIREWORKS_BURST: 0 },
    };
    const hazard = hazardSystem.attemptSpawn(state, ballEnv, rng);
    const ctx = makeCtx();
    const dt = 1 / 60;
    let impacts = 0;
    let t = 0;
    while (state.hazards.includes(hazard) && t < 3) {
      hazardSystem.update(state, dt, ctx);
      t += dt;
      if (state.hazards.includes(hazard)) impacts += hazard.impactsThisFrame.length;
    }
    assert.equal(impacts, 1);
    assert.ok(Math.abs(t - HAZARD_TYPES.BEACH_BALL.telegraph) < 0.05);
  });

  it('every spawned angle is allowed for its type', () => {
    const rng = createRng(6);
    for (let i = 0; i < 300; i++) {
      const state = makeRunningState();
      quietSpawner(state);
      const envIndex = i % ENVIRONMENTS.length;
      const hazard = hazardSystem.attemptSpawn(state, ENVIRONMENTS[envIndex], rng);
      assert.ok(HAZARD_TYPES[hazard.type].angles.includes(hazard.approachAngle));
    }
  });
});
