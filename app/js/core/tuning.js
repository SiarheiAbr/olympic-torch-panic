// @ts-check
// All gameplay tuning parameters, named exactly as in the business data model
// (specification/business/01-foundation/data-model/spec.md § Tuning Parameters).

export const TOTAL_DISTANCE = 5000; // meters to LA (victory)
// Pacing target: a clean run finishes in ~2.5 minutes (sum of 1000 m / speed
// per stage ≈ 149 s), so a "one more try" loop stays short and punchy.
export const BASE_SPEED = 25; // m/s in environment 1
export const SPEED_INCREMENT = 5; // m/s added per environment stage
// REQ-RUN-011: each stage's speed is scaled by a factor drawn from
// [1-SPEED_JITTER, 1+SPEED_JITTER] per run, so winning survival times vary
// instead of always summing to the same deterministic total (~149 s).
export const SPEED_JITTER = 0.07;
export const SHIELD_HALF_ARC = 60; // degrees; blocking comparison is inclusive
export const KEY_ROTATION_SPEED = 180; // degrees/s while A or D held, in environment 1
export const DEFLECT_LINGER = 0.3; // s a deflected hazard's harmless effect stays visible
export const REGEN_RATE = 8; // integrity/s during calm
export const REGEN_DELAY = 1.0; // s of calm before recovery starts
export const START_GRACE = 3.0; // hazard-free s at run start
export const RESUME_COUNTDOWN = 3; // s countdown before gameplay resumes
export const LEADERBOARD_SIZE = 10;

export const TORCH_START_ANGLE = 90; // torch resets to straight up each run
export const MAX_DT = 0.05; // s; frame delta clamp (architecture.md)
export const BANNER_DURATION = 2.5; // s the environment-transition cue stays visible
export const DEFAULT_INITIALS = 'YOU';

/**
 * Hazard catalog (specification/business/05-hazard-system/spec.md).
 * profile CONTINUOUS: drains `drainRate` integrity/s while ACTIVE and exposed.
 * profile IMPACT: `impacts` instant deductions of `damage`, `impactInterval` s apart,
 * the first at the moment the hazard becomes ACTIVE.
 */
export const HAZARD_TYPES = Object.freeze({
  WIND_GUST: Object.freeze({
    profile: 'CONTINUOUS',
    angles: Object.freeze([0, 180]),
    telegraph: 1.0,
    duration: 2.5,
    drainRate: 30,
  }),
  RAIN_SHOWER: Object.freeze({
    profile: 'CONTINUOUS',
    angles: Object.freeze([90]),
    telegraph: 1.2,
    duration: 3.5,
    drainRate: 25,
  }),
  DRONE_DOWNDRAFT: Object.freeze({
    profile: 'CONTINUOUS',
    angles: Object.freeze([45, 135]),
    telegraph: 0.9,
    duration: 2.0,
    drainRate: 35,
  }),
  BEACH_BALL: Object.freeze({
    profile: 'IMPACT',
    angles: Object.freeze([0, 45, 180]),
    telegraph: 1.5,
    impacts: 1,
    impactInterval: 0,
    damage: 20,
  }),
  FIREWORKS_BURST: Object.freeze({
    profile: 'IMPACT',
    angles: Object.freeze([0, 45]),
    telegraph: 1.3,
    impacts: 3,
    impactInterval: 0.4,
    damage: 10,
  }),
});

// Global hazard-frequency knob: every environment's spawn-interval range is
// multiplied by this. Scaling uniformly keeps the stage-to-stage interval
// RATIOS intact, so the difficulty-scaled key rotation speeds (REQ-TOR-002,
// derived from those ratios) are unchanged by design. 0.85 ≈ 18% more spawn
// attempts per second — compensates for deflect-on-block (Rework #1) making
// blocks terminal, which had left full runs too easy.
export const SPAWN_INTERVAL_SCALE = 0.85;

/**
 * Environment table (specification/business/03-run-lifecycle/spec.md).
 * Stages split TOTAL_DISTANCE into equal fifths; boundaries scale with it.
 * `weights` are the hazard-mix spawn weights (each row sums to 100).
 * Spawn intervals are tightened versus the original spec numbers so hazard
 * density per second stays challenging at the faster run pace above; the
 * ranges below are further scaled by SPAWN_INTERVAL_SCALE.
 */
export const ENVIRONMENTS = Object.freeze(
  [
    {
      name: 'Countryside Send-off',
      maxConcurrentHazards: 1,
      spawnIntervalMin: 2.5,
      spawnIntervalMax: 3.5,
      volleyChance: 0,
      weights: {
        WIND_GUST: 50,
        RAIN_SHOWER: 30,
        DRONE_DOWNDRAFT: 0,
        BEACH_BALL: 20,
        FIREWORKS_BURST: 0,
      },
    },
    {
      name: 'Storm Coast',
      maxConcurrentHazards: 2,
      spawnIntervalMin: 2.0,
      spawnIntervalMax: 3.0,
      volleyChance: 0,
      weights: {
        WIND_GUST: 30,
        RAIN_SHOWER: 40,
        DRONE_DOWNDRAFT: 20,
        BEACH_BALL: 10,
        FIREWORKS_BURST: 0,
      },
    },
    {
      name: 'Desert Highway',
      maxConcurrentHazards: 2,
      spawnIntervalMin: 1.6,
      spawnIntervalMax: 2.4,
      // REQ-HAZ-011: chance a spawn attempt is an unblockable two-hazard volley.
      volleyChance: 0.15,
      weights: {
        WIND_GUST: 35,
        RAIN_SHOWER: 0,
        DRONE_DOWNDRAFT: 30,
        BEACH_BALL: 20,
        FIREWORKS_BURST: 15,
      },
    },
    {
      name: 'Venice Beach Boardwalk',
      maxConcurrentHazards: 3,
      spawnIntervalMin: 1.3,
      spawnIntervalMax: 2.0,
      volleyChance: 0.25,
      weights: {
        WIND_GUST: 20,
        RAIN_SHOWER: 15,
        DRONE_DOWNDRAFT: 20,
        BEACH_BALL: 30,
        FIREWORKS_BURST: 15,
      },
    },
    {
      name: 'Downtown LA',
      maxConcurrentHazards: 3,
      spawnIntervalMin: 1.0,
      spawnIntervalMax: 1.6,
      volleyChance: 0.35,
      weights: {
        WIND_GUST: 20,
        RAIN_SHOWER: 10,
        DRONE_DOWNDRAFT: 25,
        BEACH_BALL: 15,
        FIREWORKS_BURST: 30,
      },
    },
  ].map((env, i, all) =>
    Object.freeze({
      ...env,
      index: i,
      speed: BASE_SPEED + i * SPEED_INCREMENT,
      spawnIntervalMin: env.spawnIntervalMin * SPAWN_INTERVAL_SCALE,
      spawnIntervalMax: env.spawnIntervalMax * SPAWN_INTERVAL_SCALE,
      // REQ-TOR-002: key rotation scales with hazard frequency — the ratio of
      // environment 1's mean spawn interval to this environment's, so denser
      // stages stay reactable (180°/s in stage 1 up to ~415°/s in Downtown LA).
      // The ratio uses the raw table rows, but SPAWN_INTERVAL_SCALE would
      // cancel out of it anyway — the frequency knob never moves these speeds.
      keyRotationSpeed:
        KEY_ROTATION_SPEED *
        ((all[0].spawnIntervalMin + all[0].spawnIntervalMax) /
          (env.spawnIntervalMin + env.spawnIntervalMax)),
      weights: Object.freeze(env.weights),
    })
  )
);
