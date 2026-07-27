// @ts-check
// Capability 05 — Hazard System
// (specification/business/05-hazard-system/spec.md)

import { HAZARD_TYPES, ENVIRONMENTS } from '../core/tuning.js';
import { HAZARD_STATE, PROFILE } from '../core/state.js';

/**
 * Per-frame hazard progression and spawning. Runs only while RUNNING.
 * @param {import('../core/state.js').GameState} state
 * @param {number} dt
 * @param {{rng: import('../core/rng.js').Rng}} ctx
 */
export function update(state, dt, ctx) {
  // Hazards resolved last frame have had their final effects consumed; drop them.
  if (state.hazards.some((h) => h.state === HAZARD_STATE.RESOLVED)) {
    state.hazards = state.hazards.filter((h) => h.state !== HAZARD_STATE.RESOLVED);
  }

  for (const hazard of state.hazards) {
    progressHazard(hazard, dt);
  }

  const env = ENVIRONMENTS[state.run.environmentIndex];
  const spawner = state.spawner;
  if (spawner.graceRemaining > 0) {
    // REQ-HAZ-005: no spawning during START_GRACE. The timer must not "bank"
    // spawn attempts during grace — the first interval starts when grace ends.
    spawner.graceRemaining -= dt;
    if (spawner.graceRemaining <= 0) {
      // Carry the (negative) leftover into the first interval draw.
      spawner.nextSpawnIn = drawInterval(env, ctx.rng) + spawner.graceRemaining;
      spawner.graceRemaining = 0;
    }
  } else {
    spawner.nextSpawnIn -= dt;
    while (spawner.nextSpawnIn <= 0) {
      attemptSpawn(state, env, ctx.rng);
      // REQ-HAZ-007: a fresh delay is drawn after every attempt, spawned or skipped.
      spawner.nextSpawnIn += drawInterval(env, ctx.rng);
    }
  }
}

/** @param {(typeof ENVIRONMENTS)[number]} env @param {import('../core/rng.js').Rng} rng */
function drawInterval(env, rng) {
  return rng.range(env.spawnIntervalMin, env.spawnIntervalMax);
}

/**
 * Advances one hazard through TELEGRAPHED -> ACTIVE -> RESOLVED, recording
 * `activeSecondsThisFrame` (continuous exposure time) and `impactsThisFrame`
 * (impact damage values) for flameIntegrity to judge against the shield arc.
 * @param {import('../core/state.js').Hazard} hazard
 * @param {number} dt
 */
function progressHazard(hazard, dt) {
  hazard.activeSecondsThisFrame = 0;
  hazard.impactsThisFrame = [];
  hazard.blockedImpactFx = false;

  if (hazard.state === HAZARD_STATE.DEFLECTED) {
    // REQ-HAZ-010: deflected hazards are harmless — they only run down the
    // deflection-effect timer and then resolve.
    hazard.deflectRemaining -= dt;
    if (hazard.deflectRemaining <= 0) hazard.state = HAZARD_STATE.RESOLVED;
    return;
  }

  let remainingFrameTime = dt;
  if (hazard.state === HAZARD_STATE.TELEGRAPHED) {
    if (hazard.telegraphRemaining > remainingFrameTime) {
      hazard.telegraphRemaining -= remainingFrameTime;
      return;
    }
    // REQ-HAZ-001: dangerous only after the full telegraph has elapsed.
    remainingFrameTime -= hazard.telegraphRemaining;
    hazard.telegraphRemaining = 0;
    hazard.state = HAZARD_STATE.ACTIVE;
  }

  if (hazard.state !== HAZARD_STATE.ACTIVE || remainingFrameTime <= 0) {
    // A hazard activating exactly on the frame boundary still fires zero-time
    // impacts below on the next frame; impact profiles handle t=0 there.
    if (hazard.state === HAZARD_STATE.ACTIVE && hazard.profile === PROFILE.IMPACT) {
      fireDueImpacts(hazard);
    }
    return;
  }

  if (hazard.profile === PROFILE.CONTINUOUS) {
    const def = HAZARD_TYPES[hazard.type];
    const before = hazard.activeElapsed;
    hazard.activeElapsed += remainingFrameTime;
    // REQ-HAZ-003: dangerous for exactly the active duration.
    hazard.activeSecondsThisFrame = Math.min(
      remainingFrameTime,
      Math.max(0, def.duration - before)
    );
    if (hazard.activeElapsed >= def.duration) hazard.state = HAZARD_STATE.RESOLVED;
  } else {
    hazard.activeElapsed += remainingFrameTime;
    fireDueImpacts(hazard);
  }
}

/** @param {import('../core/state.js').Hazard} hazard */
function fireDueImpacts(hazard) {
  const def = HAZARD_TYPES[hazard.type];
  // Impacts are scheduled at 0, interval, 2*interval, ... after activation.
  while (
    hazard.impactsDelivered < def.impacts &&
    hazard.activeElapsed >= hazard.impactsDelivered * def.impactInterval
  ) {
    hazard.impactsThisFrame.push(def.damage);
    hazard.impactsDelivered += 1;
  }
  if (hazard.impactsDelivered >= def.impacts) hazard.state = HAZARD_STATE.RESOLVED;
}

/**
 * One spawn attempt (business flow "Spawning a hazard"). Returns the hazard
 * or null when the attempt is skipped (cap reached / no free angle).
 * @param {import('../core/state.js').GameState} state
 * @param {(typeof ENVIRONMENTS)[number]} env
 * @param {import('../core/rng.js').Rng} rng
 * @returns {?import('../core/state.js').Hazard}
 */
export function attemptSpawn(state, env, rng) {
  const live = state.hazards.filter((h) => h.state !== HAZARD_STATE.RESOLVED);
  // REQ-HAZ-005: concurrency cap.
  if (live.length >= env.maxConcurrentHazards) return null;

  const occupied = new Set(live.map((h) => h.approachAngle));
  /** @type {Array<[string, number]>} */
  const weightedTypes = Object.entries(env.weights).filter(([, w]) => w > 0);

  // REQ-HAZ-006: weighted type pick; if the picked type has no free angle,
  // re-pick among types that do (business flow step 3).
  let type = rng.weighted(weightedTypes);
  if (!hasFreeAngle(type, occupied)) {
    const candidates = weightedTypes.filter(([t]) => hasFreeAngle(t, occupied));
    if (candidates.length === 0) return null;
    type = rng.weighted(candidates);
  }

  const def = HAZARD_TYPES[type];
  const freeAngles = def.angles.filter((a) => !occupied.has(a));
  // REQ-HAZ-008 holds by construction: only unoccupied angles are eligible.
  const approachAngle = freeAngles[rng.int(0, freeAngles.length - 1)];

  /** @type {import('../core/state.js').Hazard} */
  const hazard = {
    id: state.hazardSeq++,
    type,
    approachAngle,
    profile: def.profile,
    state: HAZARD_STATE.TELEGRAPHED,
    telegraphRemaining: def.telegraph,
    telegraphTotal: def.telegraph,
    activeElapsed: 0,
    activeSecondsThisFrame: 0,
    impactsThisFrame: [],
    impactsDelivered: 0,
    blocked: false,
    blockedImpactFx: false,
    deflectRemaining: 0,
  };
  state.hazards.push(hazard);
  return hazard;
}

/** @param {string} type @param {Set<number>} occupied */
function hasFreeAngle(type, occupied) {
  return HAZARD_TYPES[type].angles.some((a) => !occupied.has(a));
}
