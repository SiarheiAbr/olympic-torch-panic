// @ts-check
// All gameplay tuning parameters, named exactly as in the business data model
// (specification/business/01-foundation/data-model/spec.md § Tuning Parameters).

export const TOTAL_DISTANCE = 5000; // meters to LA (victory)
export const BASE_SPEED = 8; // m/s in environment 1 (raised from 5 to quicken pacing)
export const SPEED_INCREMENT = 1.0; // m/s added per environment stage (raised from 0.5)
export const SHIELD_HALF_ARC = 60; // degrees; blocking comparison is inclusive
export const KEY_ROTATION_SPEED = 180; // degrees/s while A or D held
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

/**
 * Environment table (specification/business/03-run-lifecycle/spec.md).
 * Stages split TOTAL_DISTANCE into equal fifths; boundaries scale with it.
 * `weights` are the hazard-mix spawn weights (each row sums to 100).
 */
export const ENVIRONMENTS = Object.freeze(
  [
    {
      name: 'Countryside Send-off',
      maxConcurrentHazards: 1,
      spawnIntervalMin: 3.5,
      spawnIntervalMax: 5.0,
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
      spawnIntervalMin: 3.0,
      spawnIntervalMax: 4.5,
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
      spawnIntervalMin: 2.5,
      spawnIntervalMax: 4.0,
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
      spawnIntervalMin: 2.0,
      spawnIntervalMax: 3.0,
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
      spawnIntervalMin: 1.5,
      spawnIntervalMax: 2.5,
      weights: {
        WIND_GUST: 20,
        RAIN_SHOWER: 10,
        DRONE_DOWNDRAFT: 25,
        BEACH_BALL: 15,
        FIREWORKS_BURST: 30,
      },
    },
  ].map((env, i) =>
    Object.freeze({
      ...env,
      index: i,
      speed: BASE_SPEED + i * SPEED_INCREMENT,
      weights: Object.freeze(env.weights),
    })
  )
);
