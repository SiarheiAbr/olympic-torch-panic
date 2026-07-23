// @ts-check
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { REGEN_RATE, REGEN_DELAY, HAZARD_TYPES } from '../../app/js/core/tuning.js';
import { FLAME_STATE, HAZARD_STATE, deriveFlameState } from '../../app/js/core/state.js';
import * as flameIntegrity from '../../app/js/systems/flameIntegrity.js';
import { makeRunningState } from '../helpers/sim.js';

/** Crafted hazard carrying this frame's exposure data, as hazardSystem produces it. */
function hazardFrame({ type, approachAngle, activeSeconds = 0, impacts = [] }) {
  return {
    id: 1,
    type,
    approachAngle,
    profile: HAZARD_TYPES[type].profile,
    state: HAZARD_STATE.ACTIVE,
    telegraphRemaining: 0,
    telegraphTotal: 1,
    activeElapsed: 0,
    activeSecondsThisFrame: activeSeconds,
    impactsThisFrame: impacts,
    impactsDelivered: 0,
    blocked: false,
    blockedImpactFx: false,
  };
}

describe('flame integrity', () => {
  it('REQ-FLM-001: exposed continuous drain = rate x active time', () => {
    const state = makeRunningState();
    state.torch.angle = 0;
    state.hazards = [hazardFrame({ type: 'WIND_GUST', approachAngle: 180, activeSeconds: 0.5 })];
    flameIntegrity.update(state, 1 / 60);
    assert.ok(Math.abs(state.flame.integrity - (100 - 30 * 0.5)) < 1e-9);
  });

  it('REQ-FLM-002: simultaneous exposed hazards drain additively', () => {
    const state = makeRunningState();
    state.torch.angle = 90; // blocks nothing at 0 or 180... 90±60 covers 30-150
    state.hazards = [
      hazardFrame({ type: 'WIND_GUST', approachAngle: 180, activeSeconds: 1 }),
      hazardFrame({ type: 'WIND_GUST', approachAngle: 0, activeSeconds: 1 }),
    ];
    flameIntegrity.update(state, 1 / 60);
    assert.ok(Math.abs(state.flame.integrity - (100 - 60)) < 1e-9);
  });

  it('REQ-FLM-003: a blocked hazard drains nothing', () => {
    const state = makeRunningState();
    state.torch.angle = 180;
    state.hazards = [hazardFrame({ type: 'WIND_GUST', approachAngle: 180, activeSeconds: 1 })];
    flameIntegrity.update(state, 1 / 60);
    assert.equal(state.flame.integrity, 100);
    assert.equal(state.hazards[0].blocked, true);
  });

  it('REQ-DM-005: the inclusive 60-degree boundary blocks; 61 degrees does not', () => {
    const state = makeRunningState();
    state.torch.angle = 30; // rain at 90: |30-90| = 60 -> blocked
    state.hazards = [hazardFrame({ type: 'RAIN_SHOWER', approachAngle: 90, activeSeconds: 1 })];
    flameIntegrity.update(state, 1 / 60);
    assert.equal(state.flame.integrity, 100);
    state.torch.angle = 29;
    flameIntegrity.update(state, 1 / 60);
    assert.ok(state.flame.integrity < 100);
  });

  it('REQ-FLM-004: impacts are all-or-nothing at the impact moment', () => {
    const exposed = makeRunningState();
    exposed.torch.angle = 180;
    exposed.hazards = [hazardFrame({ type: 'BEACH_BALL', approachAngle: 45, impacts: [20] })];
    flameIntegrity.update(exposed, 1 / 60);
    assert.equal(exposed.flame.integrity, 80);

    const blocked = makeRunningState();
    blocked.torch.angle = 90; // 45 within 60 of 90
    blocked.hazards = [hazardFrame({ type: 'BEACH_BALL', approachAngle: 45, impacts: [20] })];
    flameIntegrity.update(blocked, 1 / 60);
    assert.equal(blocked.flame.integrity, 100);
    assert.equal(blocked.hazards[0].blockedImpactFx, true);
  });

  it('REQ-FLM-005: recovery starts after REGEN_DELAY and runs at REGEN_RATE', () => {
    const state = makeRunningState();
    state.flame.integrity = 40;
    state.regen.timeSinceLoss = 0;
    const dt = 1 / 60;
    for (let t = 0; t < 6; t += dt) flameIntegrity.update(state, dt);
    const expected = 40 + (6 - REGEN_DELAY) * REGEN_RATE;
    assert.ok(Math.abs(state.flame.integrity - expected) < 0.5, `got ${state.flame.integrity}`);
  });

  it('recovery clamps at exactly 100', () => {
    const state = makeRunningState();
    state.flame.integrity = 99;
    state.regen.timeSinceLoss = 100;
    for (let i = 0; i < 120; i++) flameIntegrity.update(state, 1 / 60);
    assert.equal(state.flame.integrity, 100);
  });

  it('REQ-FLM-006: a loss restarts the calm clock; a blocked impact does not', () => {
    const state = makeRunningState();
    state.flame.integrity = 50;
    state.regen.timeSinceLoss = 5;

    // blocked impact -> no loss -> clock keeps growing, regen continues
    state.torch.angle = 45;
    state.hazards = [hazardFrame({ type: 'BEACH_BALL', approachAngle: 45, impacts: [20] })];
    flameIntegrity.update(state, 1 / 60);
    assert.ok(state.regen.timeSinceLoss > 5);
    assert.ok(state.flame.integrity > 50);

    // exposed impact -> loss -> clock resets to zero
    state.hazards = [hazardFrame({ type: 'BEACH_BALL', approachAngle: 180, impacts: [20] })];
    flameIntegrity.update(state, 1 / 60);
    assert.equal(state.regen.timeSinceLoss, 0);
  });

  it('REQ-DM-002: integrity clamps at 0, never negative', () => {
    const state = makeRunningState();
    state.flame.integrity = 5;
    state.torch.angle = 0;
    state.hazards = [hazardFrame({ type: 'DRONE_DOWNDRAFT', approachAngle: 135, activeSeconds: 1 })];
    flameIntegrity.update(state, 1 / 60);
    assert.equal(state.flame.integrity, 0);
    assert.equal(state.flame.state, FLAME_STATE.EXTINGUISHED);
  });

  it('REQ-DM-004: flame state thresholds', () => {
    assert.equal(deriveFlameState(100), FLAME_STATE.STRONG);
    assert.equal(deriveFlameState(70), FLAME_STATE.STRONG);
    assert.equal(deriveFlameState(69.9), FLAME_STATE.FLICKERING);
    assert.equal(deriveFlameState(30), FLAME_STATE.FLICKERING);
    assert.equal(deriveFlameState(29.9), FLAME_STATE.CRITICAL);
    assert.equal(deriveFlameState(0.1), FLAME_STATE.CRITICAL);
    assert.equal(deriveFlameState(0), FLAME_STATE.EXTINGUISHED);
  });

  it('no regeneration while a hazard is actively draining', () => {
    const state = makeRunningState();
    state.flame.integrity = 50;
    state.regen.timeSinceLoss = 10;
    state.torch.angle = 0;
    state.hazards = [hazardFrame({ type: 'RAIN_SHOWER', approachAngle: 90, activeSeconds: 1 / 60 })];
    flameIntegrity.update(state, 1 / 60);
    assert.ok(state.flame.integrity < 50);
  });
});
