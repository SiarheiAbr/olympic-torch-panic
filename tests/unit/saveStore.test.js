// @ts-check
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createSaveStore, emptySaveDoc } from '../../js/storage/saveStore.js';

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _map: map,
  };
}

const validDoc = {
  leaderboard: [
    {
      distance: 1200,
      survivalTime: 240.5,
      initials: 'ABC',
      reachedLA: false,
      achievedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
  longestSurvival: 240.5,
};

describe('save store', () => {
  it('round-trips a document', () => {
    const storage = fakeStorage();
    const store = createSaveStore(storage);
    assert.equal(store.save(validDoc), true);
    assert.deepEqual(store.load(), validDoc);
  });

  it('first visit loads an empty document', () => {
    const store = createSaveStore(fakeStorage());
    assert.deepEqual(store.load(), emptySaveDoc());
  });

  it('REQ-ERR-006: malformed JSON is discarded and removed', () => {
    const storage = fakeStorage({ 'otp.save.v1': '{not json' });
    const store = createSaveStore(storage);
    assert.deepEqual(store.load(), emptySaveDoc());
    assert.equal(storage._map.has('otp.save.v1'), false);
    assert.equal(store.isAvailable(), true);
  });

  it('REQ-ERR-006: structurally invalid data is discarded', () => {
    for (const bad of [
      '{"leaderboard": "nope", "longestSurvival": 0}',
      '{"leaderboard": [{"distance": -5}], "longestSurvival": 0}',
      '{"leaderboard": [{"distance": 10, "survivalTime": 5, "initials": "TOOLONG", "reachedLA": false, "achievedAt": "x"}], "longestSurvival": 0}',
      '{"leaderboard": []}',
      'null',
    ]) {
      const store = createSaveStore(fakeStorage({ 'otp.save.v1': bad }));
      assert.deepEqual(store.load(), emptySaveDoc(), bad);
    }
  });

  it('REQ-ERR-005: absent storage backend -> unavailable, in-memory play continues', () => {
    const store = createSaveStore(null);
    assert.equal(store.isAvailable(), false);
    assert.deepEqual(store.load(), emptySaveDoc());
    assert.equal(store.save(validDoc), false);
  });

  it('REQ-ERR-005: storage that throws -> flagged unavailable', () => {
    const store = createSaveStore({
      getItem() {
        throw new Error('denied');
      },
      setItem() {
        throw new Error('denied');
      },
      removeItem() {},
    });
    assert.deepEqual(store.load(), emptySaveDoc());
    assert.equal(store.isAvailable(), false);
  });

  it('a save failure after a working start flips availability', () => {
    let allow = true;
    const store = createSaveStore({
      getItem: () => null,
      setItem() {
        if (!allow) throw new Error('quota');
      },
      removeItem() {},
    });
    assert.equal(store.save(validDoc), true);
    allow = false;
    assert.equal(store.save(validDoc), false);
    assert.equal(store.isAvailable(), false);
  });
});
