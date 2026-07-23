// @ts-check
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../app/js/core/rng.js';

describe('rng', () => {
  it('is deterministic for a given seed', () => {
    const a = createRng(123);
    const b = createRng(123);
    for (let i = 0; i < 100; i++) assert.equal(a.next(), b.next());
  });

  it('range stays within bounds', () => {
    const rng = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng.range(1.5, 2.5);
      assert.ok(v >= 1.5 && v < 2.5);
    }
  });

  it('int is inclusive of both ends', () => {
    const rng = createRng(9);
    const seen = new Set();
    for (let i = 0; i < 500; i++) seen.add(rng.int(0, 2));
    assert.deepEqual([...seen].sort(), [0, 1, 2]);
  });

  it('weighted respects zero weights', () => {
    const rng = createRng(11);
    for (let i = 0; i < 200; i++) {
      const pick = rng.weighted([
        ['a', 50],
        ['b', 0],
        ['c', 50],
      ]);
      assert.notEqual(pick, 'b');
    }
  });
});
