// @ts-check
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { KEY_ROTATION_SPEED, ENVIRONMENTS } from '../../app/js/core/tuning.js';
import { SESSION } from '../../app/js/core/state.js';
import * as torchControl from '../../app/js/systems/torchControl.js';
import { step } from '../../app/js/core/loop.js';
import { makeCtx, makeRunningState } from '../helpers/sim.js';

describe('torch control', () => {
  it('REQ-TOR-001: pointer maps linearly — right edge 0°, center 90°, left edge 180°', () => {
    const state = makeRunningState();
    for (const [fraction, expected] of [
      [1, 0],
      [0.5, 90],
      [0, 180],
      [0.25, 135],
    ]) {
      state.input.queue.push({ kind: 'pointerFraction', fraction });
      torchControl.update(state, 1 / 60);
      assert.ok(Math.abs(state.torch.angle - expected) < 1e-9, `fraction ${fraction}`);
    }
  });

  it('REQ-TOR-002: A rotates toward 180 and D toward 0 at KEY_ROTATION_SPEED', () => {
    const state = makeRunningState();
    state.torch.angle = 90;
    state.input.keys.a = true;
    torchControl.update(state, 0.1);
    assert.ok(Math.abs(state.torch.angle - (90 + KEY_ROTATION_SPEED * 0.1)) < 1e-9);
    state.input.keys.a = false;
    state.input.keys.d = true;
    torchControl.update(state, 0.2);
    assert.ok(Math.abs(state.torch.angle - (108 - KEY_ROTATION_SPEED * 0.2)) < 1e-9);
  });

  it('REQ-TOR-002: key rotation speed scales with the environment hazard frequency', () => {
    // Speed ratio must equal the spawn-frequency ratio (env 1 mean interval /
    // env N mean interval); environment 1 is exactly KEY_ROTATION_SPEED.
    const e0 = ENVIRONMENTS[0];
    assert.equal(e0.keyRotationSpeed, KEY_ROTATION_SPEED);
    for (const env of ENVIRONMENTS) {
      const expectedRatio =
        (e0.spawnIntervalMin + e0.spawnIntervalMax) / (env.spawnIntervalMin + env.spawnIntervalMax);
      assert.ok(Math.abs(env.keyRotationSpeed / KEY_ROTATION_SPEED - expectedRatio) < 1e-9);
    }
    assert.ok(ENVIRONMENTS[4].keyRotationSpeed > KEY_ROTATION_SPEED * 2);

    const state = makeRunningState();
    state.run.environmentIndex = 4;
    state.torch.angle = 90;
    state.input.keys.a = true;
    torchControl.update(state, 0.1);
    const expected = 90 + ENVIRONMENTS[4].keyRotationSpeed * 0.1;
    assert.ok(Math.abs(state.torch.angle - expected) < 1e-9);
  });

  it('REQ-TOR-003: both keys held -> no rotation', () => {
    const state = makeRunningState();
    state.torch.angle = 45;
    state.input.keys.a = true;
    state.input.keys.d = true;
    torchControl.update(state, 1);
    assert.equal(state.torch.angle, 45);
  });

  it('REQ-TOR-004: full-width drag equals 180°, dragging right rotates toward 0', () => {
    const state = makeRunningState();
    state.torch.angle = 90;
    state.input.queue.push({ kind: 'dragDelta', dxFraction: 0.25 });
    torchControl.update(state, 1 / 60);
    assert.equal(state.torch.angle, 45);
    state.input.queue.push({ kind: 'dragDelta', dxFraction: -0.5 });
    torchControl.update(state, 1 / 60);
    assert.equal(state.torch.angle, 135);
  });

  it('REQ-DM-003: key rotation clamps at 0 and 180', () => {
    const state = makeRunningState();
    state.torch.angle = 10;
    state.input.keys.d = true;
    torchControl.update(state, 1); // would be -170 unclamped
    assert.equal(state.torch.angle, 0);
    state.input.keys.d = false;
    state.input.keys.a = true;
    torchControl.update(state, 2);
    assert.equal(state.torch.angle, 180);
  });

  it('REQ-TOR-005: the most recent queued event wins', () => {
    const state = makeRunningState();
    state.input.queue.push({ kind: 'pointerFraction', fraction: 1 });
    state.input.queue.push({ kind: 'dragDelta', dxFraction: -0.25 });
    torchControl.update(state, 1 / 60);
    assert.equal(state.torch.angle, 45); // 0 from pointer, then +45 from drag
  });

  it('REQ-TOR-006: input queued while paused is discarded, angle unchanged', () => {
    const state = makeRunningState();
    const ctx = makeCtx();
    state.torch.angle = 60;
    state.session = SESSION.PAUSED;
    state.input.queue.push({ kind: 'pointerFraction', fraction: 0 });
    step(state, 1 / 60, ctx);
    assert.equal(state.torch.angle, 60);
    assert.equal(state.input.queue.length, 0);
  });
});
