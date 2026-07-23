// @ts-check
// Angle convention and blocking geometry — defined once, used by systems and UI
// (specification/business/01-foundation/data-model/spec.md § Angle & Direction Convention).

import { SHIELD_HALF_ARC } from './tuning.js';

/**
 * REQ-DM-003: torch angle is always clamped to 0-180 degrees.
 * @param {number} angle
 * @returns {number}
 */
export function clampAngle(angle) {
  return Math.min(180, Math.max(0, angle));
}

/**
 * REQ-DM-005: a hazard is blocked iff |torchAngle - approachAngle| <= SHIELD_HALF_ARC.
 * The boundary is inclusive.
 * @param {number} torchAngle
 * @param {number} approachAngle
 * @returns {boolean}
 */
export function isBlocked(torchAngle, approachAngle) {
  return Math.abs(torchAngle - approachAngle) <= SHIELD_HALF_ARC;
}
