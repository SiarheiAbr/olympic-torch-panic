// @ts-check
// The ONLY randomness source for game logic (conventions.md hard boundary #2).
// mulberry32: tiny, seedable, good-enough distribution for gameplay.

/**
 * @typedef {Object} Rng
 * @property {number} seed
 * @property {() => number} next - float in [0, 1)
 * @property {(min: number, max: number) => number} range - float in [min, max)
 * @property {(min: number, max: number) => number} int - integer in [min, max] inclusive
 * @property {(pairs: Array<[string, number]>) => string} weighted - weighted pick of keys
 */

/**
 * @param {number} seed - 32-bit integer seed
 * @returns {Rng}
 */
export function createRng(seed) {
  let s = seed >>> 0;
  function next() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    seed: seed >>> 0,
    next,
    range(min, max) {
      return min + next() * (max - min);
    },
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    },
    weighted(pairs) {
      const total = pairs.reduce((sum, [, w]) => sum + w, 0);
      let roll = next() * total;
      for (const [key, w] of pairs) {
        roll -= w;
        if (roll < 0) return key;
      }
      return pairs[pairs.length - 1][0];
    },
  };
}
