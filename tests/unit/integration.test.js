// @ts-check
// Full-frame integration through the loop's fixed update order.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TOTAL_DISTANCE, ENVIRONMENTS, HAZARD_TYPES } from '../../app/js/core/tuning.js';
import { SESSION, OUTCOME, HAZARD_STATE } from '../../app/js/core/state.js';
import { step } from '../../app/js/core/loop.js';
import * as runLifecycle from '../../app/js/systems/runLifecycle.js';
import { isBlocked } from '../../app/js/core/angles.js';
import { makeCtx, makeRunningState, simulate } from '../helpers/sim.js';

function activeWind(approachAngle) {
  return {
    id: 99,
    type: 'WIND_GUST',
    approachAngle,
    profile: 'CONTINUOUS',
    state: HAZARD_STATE.ACTIVE,
    telegraphRemaining: 0,
    telegraphTotal: 1,
    activeElapsed: 0,
    activeSecondsThisFrame: 0,
    impactsThisFrame: [],
    impactsDelivered: 0,
    blocked: false,
    blockedImpactFx: false,
  };
}

describe('integration (full frame order)', () => {
  it('an unattended run eventually extinguishes with distance and time recorded', () => {
    const state = makeRunningState();
    const ctx = makeCtx(7);
    simulate(state, 600, ctx);
    assert.equal(state.session, SESSION.RUN_ENDED);
    assert.equal(state.run.outcome, OUTCOME.EXTINGUISHED);
    assert.ok(state.run.distance > 0);
    assert.ok(state.run.elapsedTime > 0);
    assert.ok(state.run.distance < TOTAL_DISTANCE);
  });

  it('a skilled run reaches LA (victory end-to-end)', () => {
    // Greedy bot: each frame pick the torch angle (hazard angles + pair
    // midpoints) that minimizes the threat left unblocked. Proves the game is
    // winnable and exercises the full victory path through real spawning.
    function threatWeight(h) {
      const def = HAZARD_TYPES[h.type];
      if (h.state === HAZARD_STATE.ACTIVE) {
        return h.profile === 'CONTINUOUS' ? def.drainRate : def.damage * 3;
      }
      const soon = h.telegraphRemaining < 0.4 ? 0.9 : 0.25;
      return (def.drainRate ?? def.damage * 3) * soon;
    }
    function bestAngle(state) {
      const live = state.hazards.filter((h) => h.state !== HAZARD_STATE.RESOLVED);
      if (live.length === 0) return null;
      const candidates = new Set(live.map((h) => h.approachAngle));
      for (const a of live) {
        for (const b of live) {
          if (Math.abs(a.approachAngle - b.approachAngle) <= 120) {
            candidates.add((a.approachAngle + b.approachAngle) / 2);
          }
        }
      }
      let best = null;
      let bestLoss = Infinity;
      for (const angle of candidates) {
        let loss = 0;
        for (const h of live) if (!isBlocked(angle, h.approachAngle)) loss += threatWeight(h);
        if (loss < bestLoss) {
          bestLoss = loss;
          best = angle;
        }
      }
      return best;
    }

    const state = makeRunningState();
    const ctx = makeCtx(11);
    const dt = 1 / 60;
    let guard = 0;
    while (state.session === SESSION.RUNNING && guard++ < 80_000) {
      const target = bestAngle(state);
      if (target !== null) {
        state.input.queue.push({ kind: 'pointerFraction', fraction: 1 - target / 180 });
      }
      step(state, dt, ctx);
    }
    assert.equal(state.session, SESSION.RUN_ENDED);
    assert.equal(state.run.outcome, OUTCOME.REACHED_LA);
    assert.equal(state.run.distance, TOTAL_DISTANCE);
    assert.ok(state.flame.integrity > 0);
  });

  it('victory wins the frame when integrity is still above zero at the crossing', () => {
    const state = makeRunningState();
    const ctx = makeCtx();
    state.run.distance = TOTAL_DISTANCE - 0.01;
    state.run.environmentIndex = ENVIRONMENTS.length - 1;
    state.flame.integrity = 1;
    state.torch.angle = 0;
    state.hazards.push(activeWind(180)); // exposed, draining 30/s
    state.spawner.nextSpawnIn = 1000;
    step(state, 1 / 60, ctx);
    assert.equal(state.run.outcome, OUTCOME.REACHED_LA);
  });

  it('extinguish wins when integrity hits zero in the crossing frame', () => {
    const state = makeRunningState();
    const ctx = makeCtx();
    state.run.distance = TOTAL_DISTANCE - 0.01;
    state.run.environmentIndex = ENVIRONMENTS.length - 1;
    state.flame.integrity = 0.05; // 30/s x 1/60 s = 0.5 loss -> 0
    state.torch.angle = 0;
    state.hazards.push(activeWind(180));
    state.spawner.nextSpawnIn = 1000;
    step(state, 1 / 60, ctx);
    assert.equal(state.run.outcome, OUTCOME.EXTINGUISHED);
  });

  it('pause mid-hazard grants no free blocking window and no double drain', () => {
    const state = makeRunningState();
    const ctx = makeCtx();
    state.torch.angle = 0;
    const wind = activeWind(180);
    state.hazards.push(wind);
    state.spawner.nextSpawnIn = 1000;

    simulate(state, 0.5, ctx); // 0.5 s of exposure
    const integrityAtPause = state.flame.integrity;
    runLifecycle.pause(state);
    simulate(state, 10, ctx); // paused: nothing moves
    assert.equal(state.flame.integrity, integrityAtPause);
    runLifecycle.beginResume(state);
    simulate(state, 3.01, ctx); // countdown, still frozen
    assert.equal(state.session, SESSION.RUNNING);

    simulate(state, 0.5, ctx); // second half of the exposure
    const expected = 100 - HAZARD_TYPES.WIND_GUST.drainRate * 1.0;
    assert.ok(
      Math.abs(state.flame.integrity - expected) < 1.5,
      `drain must equal RUNNING-time only, got ${state.flame.integrity}`
    );
  });

  it('torch angle survives a pause/resume cycle', () => {
    const state = makeRunningState();
    const ctx = makeCtx();
    state.torch.angle = 135;
    runLifecycle.pause(state);
    simulate(state, 5, ctx);
    runLifecycle.beginResume(state);
    simulate(state, 3.01, ctx);
    assert.equal(state.torch.angle, 135);
  });
});
