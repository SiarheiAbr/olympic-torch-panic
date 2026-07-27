// @ts-check
// Capability 06 — Flame Integrity
// (specification/business/06-flame-integrity/spec.md)

import { REGEN_RATE, REGEN_DELAY, DEFLECT_LINGER, HAZARD_TYPES } from '../core/tuning.js';
import { isBlocked } from '../core/angles.js';
import { PROFILE, HAZARD_STATE, deriveFlameState } from '../core/state.js';

/**
 * Judges every hazard against the shield arc and applies drain, impact damage,
 * and calm recovery. Runs after hazardSystem in the frame order, so each
 * hazard carries its exposure-relevant time and impacts for this frame.
 * @param {import('../core/state.js').GameState} state
 * @param {number} dt
 */
export function update(state, dt) {
  let loss = 0;

  for (const hazard of state.hazards) {
    const blocked = isBlocked(state.torch.angle, hazard.approachAngle);
    hazard.blocked = blocked; // consumed by renderer/audio (REQ-HAZ-004 feedback)

    if (
      hazard.state === HAZARD_STATE.ACTIVE &&
      hazard.profile === PROFILE.CONTINUOUS &&
      hazard.activeSecondsThisFrame > 0
    ) {
      if (blocked) {
        // REQ-FLM-003 / REQ-HAZ-010: a block deflects the hazard for good —
        // no drain this frame and none ever again.
        deflect(hazard);
      } else {
        // REQ-FLM-001/002: drain accrues only while ACTIVE and exposed;
        // simultaneous exposed hazards add.
        loss += HAZARD_TYPES[hazard.type].drainRate * hazard.activeSecondsThisFrame;
      }
    }

    for (const damage of hazard.impactsThisFrame) {
      // REQ-FLM-004: blocking is evaluated at the impact moment, all-or-nothing;
      // a blocked impact deflects the hazard, cancelling remaining impacts.
      if (blocked) {
        hazard.blockedImpactFx = true;
        deflect(hazard);
      } else {
        loss += damage;
      }
    }
  }

  if (loss > 0) {
    // REQ-DM-002: clamp at 0. REQ-FLM-006: any decrease restarts the calm clock.
    state.flame.integrity = Math.max(0, state.flame.integrity - loss);
    state.regen.timeSinceLoss = 0;
  } else {
    const calmBefore = state.regen.timeSinceLoss;
    state.regen.timeSinceLoss = calmBefore + dt;
    if (state.flame.integrity > 0 && state.flame.integrity < 100) {
      // REQ-FLM-005: recover at REGEN_RATE once REGEN_DELAY of calm has passed,
      // counting only the part of this frame beyond the delay.
      const regenTime = Math.min(dt, Math.max(0, calmBefore + dt - REGEN_DELAY));
      if (regenTime > 0) {
        state.flame.integrity = Math.min(100, state.flame.integrity + REGEN_RATE * regenTime);
      }
    }
  }

  // REQ-DM-004 / REQ-FLM-007: state derives from integrity every change;
  // the run-end check that follows this system ends the run at 0 (same frame).
  state.flame.state = deriveFlameState(state.flame.integrity);
}

/**
 * REQ-HAZ-010: a blocked hazard is dismissed — it lingers only as a harmless
 * deflection effect. Idempotent within a frame (a fireworks burst can be
 * blocked in the same frame the stream is).
 * @param {import('../core/state.js').Hazard} hazard
 */
function deflect(hazard) {
  if (hazard.state === HAZARD_STATE.DEFLECTED) return;
  hazard.state = HAZARD_STATE.DEFLECTED;
  hazard.deflectRemaining = DEFLECT_LINGER;
}
