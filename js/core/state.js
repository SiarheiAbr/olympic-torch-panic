// @ts-check
// The GameState contract — mirrors the Layer 1 shared data model
// (specification/business/01-foundation/data-model/spec.md).

import { TORCH_START_ANGLE } from './tuning.js';

export const SESSION = Object.freeze({
  MAIN_MENU: 'MAIN_MENU',
  RUNNING: 'RUNNING',
  PAUSED: 'PAUSED',
  RUN_ENDED: 'RUN_ENDED',
});

export const OUTCOME = Object.freeze({
  EXTINGUISHED: 'EXTINGUISHED',
  REACHED_LA: 'REACHED_LA',
});

export const FLAME_STATE = Object.freeze({
  STRONG: 'STRONG',
  FLICKERING: 'FLICKERING',
  CRITICAL: 'CRITICAL',
  EXTINGUISHED: 'EXTINGUISHED',
});

export const HAZARD_STATE = Object.freeze({
  TELEGRAPHED: 'TELEGRAPHED',
  ACTIVE: 'ACTIVE',
  DEFLECTED: 'DEFLECTED', // blocked; harmless, lingers DEFLECT_LINGER s as pure visuals
  RESOLVED: 'RESOLVED',
});

export const PROFILE = Object.freeze({
  CONTINUOUS: 'CONTINUOUS',
  IMPACT: 'IMPACT',
});

/**
 * @typedef {Object} Run
 * @property {number} distance - meters, monotonically increasing while RUNNING
 * @property {number} elapsedTime - seconds in RUNNING state only (survival time)
 * @property {number} environmentIndex - 0-based stage index, derived from distance
 * @property {number} speedFactor - per-stage jitter multiplier (REQ-RUN-012); 0 = not yet drawn
 * @property {?string} outcome - null | OUTCOME.*, set exactly once
 */

/**
 * @typedef {Object} Hazard
 * @property {number} id
 * @property {string} type - key of HAZARD_TYPES
 * @property {number} approachAngle - 0 | 45 | 90 | 135 | 180
 * @property {string} profile - PROFILE.*
 * @property {string} state - HAZARD_STATE.*
 * @property {number} telegraphRemaining - s until ACTIVE
 * @property {number} telegraphTotal
 * @property {number} activeElapsed - s spent in ACTIVE phase
 * @property {number} activeSecondsThisFrame - exposure-relevant active time this frame
 * @property {number[]} impactsThisFrame - damage values of impacts fired this frame
 * @property {number} impactsDelivered
 * @property {boolean} blocked - last blocking evaluation (for rendering/audio)
 * @property {boolean} blockedImpactFx - an impact bounced off this frame
 * @property {number} deflectRemaining - s of deflection effect left (DEFLECTED only)
 */

/**
 * @typedef {Object} ScoreEntry
 * @property {number} distance - whole meters, rounded down
 * @property {number} survivalTime - seconds, 0.1 precision
 * @property {string} initials - exactly 3 chars A-Z/0-9
 * @property {boolean} reachedLA
 * @property {string} achievedAt - ISO date-time
 */

/**
 * @typedef {Object} GameState
 * @property {string} session - SESSION.*
 * @property {?Run} run
 * @property {{angle: number}} torch - degrees, clamped 0-180
 * @property {{integrity: number, state: string}} flame
 * @property {Hazard[]} hazards
 * @property {{queue: Array<Object>, keys: {a: boolean, d: boolean}}} input
 * @property {{graceRemaining: number, nextSpawnIn: number}} spawner
 * @property {{timeSinceLoss: number}} regen
 * @property {?number} resumeCountdown - s left in the resume countdown, null when inactive
 * @property {?{name: string, remaining: number}} banner - environment-transition cue
 * @property {number} hazardSeq
 */

/** @returns {GameState} */
export function createInitialState() {
  return {
    session: SESSION.MAIN_MENU,
    run: null,
    torch: { angle: TORCH_START_ANGLE },
    flame: { integrity: 100, state: FLAME_STATE.STRONG },
    hazards: [],
    input: { queue: [], keys: { a: false, d: false } },
    spawner: { graceRemaining: 0, nextSpawnIn: 0 },
    regen: { timeSinceLoss: Infinity },
    resumeCountdown: null,
    banner: null,
    hazardSeq: 1,
  };
}

/**
 * REQ-DM-004: flame state derives from integrity thresholds.
 * @param {number} integrity
 * @returns {string}
 */
export function deriveFlameState(integrity) {
  if (integrity <= 0) return FLAME_STATE.EXTINGUISHED;
  if (integrity < 30) return FLAME_STATE.CRITICAL;
  if (integrity < 70) return FLAME_STATE.FLICKERING;
  return FLAME_STATE.STRONG;
}
