// @ts-check
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LEADERBOARD_SIZE } from '../../js/core/tuning.js';
import { OUTCOME } from '../../js/core/state.js';
import * as scoring from '../../js/systems/scoring.js';
import { emptySaveDoc } from '../../js/storage/saveStore.js';
import { makeNowSequence } from '../helpers/sim.js';

function run(distance, elapsedTime, outcome = OUTCOME.EXTINGUISHED) {
  return { distance, elapsedTime, environmentIndex: 0, outcome };
}

describe('scoring', () => {
  it('REQ-SCO-001: distance rounds down, survival to 0.1 s', () => {
    const now = makeNowSequence();
    const entry = scoring.buildEntry(run(1999.94, 320.55), now);
    assert.equal(entry.distance, 1999);
    assert.equal(entry.survivalTime, 320.6);
    assert.equal(entry.reachedLA, false);
  });

  it('a REACHED_LA run carries the badge', () => {
    const entry = scoring.buildEntry(run(5000, 845.2, OUTCOME.REACHED_LA), makeNowSequence());
    assert.equal(entry.reachedLA, true);
  });

  it('REQ-SCO-003: initials sanitation', () => {
    assert.equal(scoring.sanitizeInitials('abc'), 'ABC');
    assert.equal(scoring.sanitizeInitials('A1Z'), 'A1Z');
    assert.equal(scoring.sanitizeInitials('A!'), 'YOU');
    assert.equal(scoring.sanitizeInitials(''), 'YOU');
    assert.equal(scoring.sanitizeInitials('ABCD'), 'YOU');
    assert.equal(scoring.sanitizeInitials(null), 'YOU');
  });

  it('qualification: room on the board, or strictly beating the last rank', () => {
    const doc = emptySaveDoc();
    const now = makeNowSequence();
    assert.equal(scoring.qualifies(doc.leaderboard, scoring.buildEntry(run(10, 2), now)), true);
    for (let i = 0; i < LEADERBOARD_SIZE; i++) {
      scoring.finalizeEntry(doc, scoring.buildEntry(run(1000 + i * 100, 60), now), 'AAA');
    }
    // full board, last rank is 1000
    assert.equal(scoring.qualifies(doc.leaderboard, scoring.buildEntry(run(1000, 60), now)), false); // tie
    assert.equal(scoring.qualifies(doc.leaderboard, scoring.buildEntry(run(1001, 60), now)), true);
  });

  it('ranking: distance descending, ties broken by earlier achievedAt', () => {
    const doc = emptySaveDoc();
    const now = makeNowSequence();
    const older = scoring.buildEntry(run(2400, 100), now);
    const newer = scoring.buildEntry(run(2400, 300), now);
    scoring.finalizeEntry(doc, older, 'OLD');
    scoring.finalizeEntry(doc, newer, 'NEW');
    assert.equal(doc.leaderboard[0].initials, 'OLD');
    assert.equal(doc.leaderboard[1].initials, 'NEW');
  });

  it('REQ-SCO-004: the board keeps at most LEADERBOARD_SIZE entries', () => {
    const doc = emptySaveDoc();
    const now = makeNowSequence();
    for (let i = 1; i <= LEADERBOARD_SIZE + 1; i++) {
      scoring.finalizeEntry(doc, scoring.buildEntry(run(i * 100, 30), now), 'AAA');
    }
    assert.equal(doc.leaderboard.length, LEADERBOARD_SIZE);
    // the shortest run (100 m) fell off
    assert.equal(doc.leaderboard[LEADERBOARD_SIZE - 1].distance, 200);
  });

  it('REQ-SCO-007: meters short counts the extra meter needed to pass', () => {
    const doc = emptySaveDoc();
    const now = makeNowSequence();
    for (let i = 0; i < LEADERBOARD_SIZE; i++) {
      scoring.finalizeEntry(doc, scoring.buildEntry(run(1200 + i, 60), now), 'AAA');
    }
    const result = scoring.recordRun(run(1150, 40), doc, now);
    assert.equal(result.qualifies, false);
    assert.equal(result.metersShort, 51);
  });

  it('REQ-SCO-005: longest survival updates regardless of qualification', () => {
    const doc = emptySaveDoc();
    const now = makeNowSequence();
    for (let i = 0; i < LEADERBOARD_SIZE; i++) {
      scoring.finalizeEntry(doc, scoring.buildEntry(run(2000 + i, 200), now), 'AAA');
    }
    const result = scoring.recordRun(run(900, 210.3), doc, now);
    assert.equal(result.qualifies, false);
    assert.equal(result.newLongestSurvival, true);
    assert.equal(doc.longestSurvival, 210.3);
  });

  it('finalizeEntry returns the rank and stamps sanitized initials', () => {
    const doc = emptySaveDoc();
    const now = makeNowSequence();
    scoring.finalizeEntry(doc, scoring.buildEntry(run(500, 100), now), 'AAA');
    const entry = scoring.buildEntry(run(800, 160), now);
    const rank = scoring.finalizeEntry(doc, entry, 'xy1');
    assert.equal(rank, 1);
    assert.equal(doc.leaderboard[0].initials, 'XY1');
  });
});
