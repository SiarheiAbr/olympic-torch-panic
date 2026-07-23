// @ts-check
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { clampAngle, isBlocked } from '../../app/js/core/angles.js';

describe('angles', () => {
  it('REQ-DM-003: clamps to 0-180', () => {
    assert.equal(clampAngle(-15), 0);
    assert.equal(clampAngle(200), 180);
    assert.equal(clampAngle(90), 90);
  });

  it('REQ-DM-005: blocking boundary is inclusive at exactly SHIELD_HALF_ARC', () => {
    assert.equal(isBlocked(90, 150), true); // difference exactly 60
    assert.equal(isBlocked(90, 30), true);
    assert.equal(isBlocked(90, 151), false); // difference 61
    assert.equal(isBlocked(90, 29), false);
  });

  it('blocks identical angles and small differences', () => {
    assert.equal(isBlocked(45, 45), true);
    assert.equal(isBlocked(0, 45), true);
    assert.equal(isBlocked(0, 180), false);
  });
});
