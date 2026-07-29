// @ts-check
// Capability 07 — Scoring & Leaderboard
// (specification/business/07-scoring-leaderboard/spec.md)

import { LEADERBOARD_SIZE, DEFAULT_INITIALS } from '../core/tuning.js';
import { OUTCOME } from '../core/state.js';

/**
 * Initials must be exactly 3 chars A-Z/0-9 (uppercased); anything else -> "YOU".
 * @param {*} raw
 * @returns {string}
 */
export function sanitizeInitials(raw) {
  if (typeof raw !== 'string') return DEFAULT_INITIALS;
  const upper = raw.trim().toUpperCase();
  return /^[A-Z0-9]{3}$/.test(upper) ? upper : DEFAULT_INITIALS;
}

/**
 * REQ-SCO-001: distance rounded down to whole meters, survival at 0.1 s precision.
 * @param {import('../core/state.js').Run} run
 * @param {() => string} now - injected clock, returns an ISO date-time string
 * @returns {import('../core/state.js').ScoreEntry}
 */
export function buildEntry(run, now) {
  return {
    distance: Math.floor(run.distance),
    survivalTime: Math.round(run.elapsedTime * 10) / 10,
    initials: DEFAULT_INITIALS,
    reachedLA: run.outcome === OUTCOME.REACHED_LA,
    achievedAt: now(),
  };
}

/**
 * Ranking rules: distance descending; ties -> earlier achievedAt first.
 * @param {import('../core/state.js').ScoreEntry} a
 * @param {import('../core/state.js').ScoreEntry} b
 */
function compareEntries(a, b) {
  if (b.distance !== a.distance) return b.distance - a.distance;
  return a.achievedAt < b.achievedAt ? -1 : a.achievedAt > b.achievedAt ? 1 : 0;
}

/**
 * An entry qualifies when the board has room or it strictly beats the
 * last-ranked distance.
 * @param {import('../core/state.js').ScoreEntry[]} leaderboard - kept sorted
 * @param {import('../core/state.js').ScoreEntry} entry
 * @returns {boolean}
 */
export function qualifies(leaderboard, entry) {
  if (leaderboard.length < LEADERBOARD_SIZE) return true;
  return entry.distance > leaderboard[leaderboard.length - 1].distance;
}

/**
 * REQ-SCO-007: meters short of the lowest-ranked entry (a tie does not qualify,
 * so the gap includes the extra meter needed to pass it).
 * @param {import('../core/state.js').ScoreEntry[]} leaderboard
 * @param {import('../core/state.js').ScoreEntry} entry
 * @returns {number}
 */
export function metersShort(leaderboard, entry) {
  const last = leaderboard[leaderboard.length - 1];
  return last.distance + 1 - entry.distance;
}

/**
 * REQ-SCO-004: insert by ranking rules, keep at most LEADERBOARD_SIZE.
 * @param {import('../core/state.js').ScoreEntry[]} leaderboard
 * @param {import('../core/state.js').ScoreEntry} entry
 * @returns {{leaderboard: import('../core/state.js').ScoreEntry[], rank: ?number}}
 */
export function insertEntry(leaderboard, entry) {
  const next = [...leaderboard, entry].sort(compareEntries).slice(0, LEADERBOARD_SIZE);
  const index = next.indexOf(entry);
  return { leaderboard: next, rank: index === -1 ? null : index + 1 };
}

/**
 * @typedef {Object} RunResult
 * @property {import('../core/state.js').ScoreEntry} entry
 * @property {boolean} qualifies
 * @property {?number} metersShort - set when the board is full and the entry does not qualify
 * @property {boolean} newLongestSurvival
 */

/**
 * Turns an ended run into a result and applies the longest-survival record
 * (REQ-SCO-005 — updated regardless of leaderboard qualification). Leaderboard
 * insertion happens separately via finalizeEntry once initials are known.
 * @param {import('../core/state.js').Run} run
 * @param {import('../storage/saveStore.js').SaveDoc} saveDoc - mutated in place
 * @param {() => string} now
 * @returns {RunResult}
 */
export function recordRun(run, saveDoc, now) {
  const entry = buildEntry(run, now);
  const q = qualifies(saveDoc.leaderboard, entry);
  const newLongestSurvival = entry.survivalTime > saveDoc.longestSurvival;
  if (newLongestSurvival) saveDoc.longestSurvival = entry.survivalTime;
  return {
    entry,
    qualifies: q,
    metersShort:
      !q && saveDoc.leaderboard.length > 0 ? metersShort(saveDoc.leaderboard, entry) : null,
    newLongestSurvival,
  };
}

/**
 * REQ-SCO-003/004: stamp (sanitized) initials and insert into the leaderboard.
 * @param {import('../storage/saveStore.js').SaveDoc} saveDoc - mutated in place
 * @param {import('../core/state.js').ScoreEntry} entry
 * @param {*} rawInitials
 * @returns {?number} final rank, or null if it ranked out
 */
export function finalizeEntry(saveDoc, entry, rawInitials) {
  entry.initials = sanitizeInitials(rawInitials);
  const { leaderboard, rank } = insertEntry(saveDoc.leaderboard, entry);
  saveDoc.leaderboard = leaderboard;
  return rank;
}
