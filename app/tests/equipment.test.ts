// Your weight jump per exercise reaches the progression engine; the name-based guess stays the fallback.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getDefaultIncrement, getIncrement, setIncrementOverrides } from '../src/lib/training';

describe('equipment: weight jumps', () => {
  it('uses your jump for an exercise when set, and the old guess otherwise', () => {
    setIncrementOverrides({ 'eq-leg-press': 5 });
    assert.equal(getIncrement({ id: 'eq-leg-press', name: 'Leg Press' }), 5);
    assert.equal(getIncrement({ id: 'eq-curl', name: 'Cable Curl' }), getDefaultIncrement({ name: 'Cable Curl' }));
    assert.equal(getIncrement({ name: 'Leg Press' }), 2.5);
    setIncrementOverrides({});
  });
  it('ignores nonsense jumps', () => {
    setIncrementOverrides({ a: 0, b: -5, c: 999, d: Number.NaN });
    for (const id of ['a', 'b', 'c', 'd']) assert.equal(getIncrement({ id, name: 'Leg Press' }), 2.5);
    setIncrementOverrides({});
  });
});
