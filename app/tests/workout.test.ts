// Round 2 session screens: the set table, the inline rest bar and the pain summary.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { setRows, restLeft, painFlags } from '../src/lib/workout';

const s = (weight: number, reps: number, rir = 1) => ({ weight, reps, rir });

describe('workout: set table', () => {
  it('pairs each planned set with the same set last time, and marks the next one to log', () => {
    const rows = setRows(3, [s(140, 14)], [s(140, 13), s(140, 12), s(140, 11)], null);
    assert.deepEqual(rows.map(r => r.state), ['done', 'current', 'todo']);
    assert.deepEqual(rows.map(r => r.last?.reps), [13, 12, 11]);
    assert.equal(rows[0]?.today?.reps, 14);
  });
  it('flags a beat only for more reps at the same or heavier load, or more load for the same reps', () => {
    const last = [s(100, 10), s(100, 10), s(100, 10), s(100, 10)];
    const rows = setRows(4, [s(100, 11), s(102.5, 10), s(95, 12), s(100, 10)], last, null);
    assert.deepEqual(rows.map(r => r.beat), [true, true, false, false]);
  });
  it('shows extra sets logged beyond the plan rather than hiding them', () => {
    assert.equal(setRows(2, [s(50, 10), s(50, 10), s(50, 8)], [], null).length, 3);
  });
  it('marks the set being edited, and has no current row while editing', () => {
    const rows = setRows(3, [s(60, 12), s(60, 11)], null, 0);
    assert.deepEqual(rows.map(r => r.state), ['editing', 'done', 'todo']);
  });
  it('copes with no history for a new or swapped exercise', () => {
    const rows = setRows(2, [], undefined, null);
    assert.deepEqual(rows.map(r => [r.last, r.beat]), [[null, false], [null, false]]);
  });
});

describe('workout: rest and pain', () => {
  it('turns the timer ring into time left, clamped', () => {
    assert.equal(restLeft(0, 100), 1);
    assert.equal(restLeft(25, 100), 0.75);
    assert.equal(restLeft(150, 100), 0);
    assert.equal(restLeft(10, 0), 0);
  });
  it('lists flagged exercises worst first and ignores none', () => {
    const names: Record<string, string> = { a: 'Leg press', b: 'Cable curl', c: 'Hip thrust' };
    assert.deepEqual(painFlags({ a: 1, b: 2, c: 0 }, id => names[id] ?? id), [{ name: 'Cable curl', level: 2 }, { name: 'Leg press', level: 1 }]);
    assert.deepEqual(painFlags(null, id => id), []);
  });
});
