// @ts-check
// localStorage adapter for the save document otp.save.v1.
// Failure behavior per specification/business/01-foundation/error-handling/spec.md:
// unavailable storage -> in-memory session (REQ-ERR-005); corrupted data ->
// discard and start empty (REQ-ERR-006). The storage backend is injected so
// tests can pass a fake.

const KEY = 'otp.save.v1';

/**
 * @typedef {Object} SaveDoc
 * @property {import('../core/state.js').ScoreEntry[]} leaderboard
 * @property {number} longestSurvival
 */

/** @returns {SaveDoc} */
export function emptySaveDoc() {
  return { leaderboard: [], longestSurvival: 0 };
}

/** @param {*} doc @returns {boolean} */
function isValidDoc(doc) {
  if (!doc || typeof doc !== 'object') return false;
  if (!Array.isArray(doc.leaderboard)) return false;
  if (typeof doc.longestSurvival !== 'number' || !Number.isFinite(doc.longestSurvival))
    return false;
  return doc.leaderboard.every(
    (e) =>
      e &&
      typeof e === 'object' &&
      typeof e.distance === 'number' &&
      Number.isFinite(e.distance) &&
      e.distance >= 0 &&
      typeof e.survivalTime === 'number' &&
      Number.isFinite(e.survivalTime) &&
      e.survivalTime >= 0 &&
      typeof e.initials === 'string' &&
      /^[A-Z0-9]{3}$/.test(e.initials) &&
      typeof e.reachedLA === 'boolean' &&
      typeof e.achievedAt === 'string'
  );
}

/**
 * @param {?Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>} storage - injected backend, null when the browser denies access
 */
export function createSaveStore(storage) {
  let available = storage !== null && storage !== undefined;

  return {
    /** True while the backing store is usable; UI shows one notice when it is not. */
    isAvailable() {
      return available;
    },

    /** @returns {SaveDoc} */
    load() {
      if (!available) return emptySaveDoc();
      let raw;
      try {
        raw = storage.getItem(KEY);
      } catch {
        available = false;
        return emptySaveDoc();
      }
      if (raw === null || raw === undefined) return emptySaveDoc();
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = null;
      }
      if (!isValidDoc(parsed)) {
        // REQ-ERR-006: discard corrupted data silently; next save overwrites it.
        try {
          storage.removeItem(KEY);
        } catch {
          // ignore - the overwrite on next save handles it
        }
        return emptySaveDoc();
      }
      return parsed;
    },

    /** @param {SaveDoc} doc @returns {boolean} true when persisted */
    save(doc) {
      if (!available) return false;
      try {
        storage.setItem(KEY, JSON.stringify(doc));
        return true;
      } catch {
        available = false;
        return false;
      }
    },
  };
}
