// Equipment settings and plates per side.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { guessKind, incOverrides, platesPerSide, sanitize } from '../src/lib/plates';

describe('equipment: settings', () => {
  it('keeps sensible values and drops the rest', () => {
    const m = sanitize({ lp: { inc: 5, kind: 'plates', base: 30 }, cc: { inc: 0, kind: 'laser' }, bad: 'x', big: { inc: 999, base: -4 } });
    assert.deepEqual(m, { lp: { inc: 5, kind: 'plates', base: 30 } });
    assert.deepEqual(sanitize(null), {});
    assert.deepEqual(sanitize([1, 2]), {});
  });
  it('gives the engine only the jumps that were set', () => {
    assert.deepEqual(incOverrides({ a: { inc: 2.5 }, b: { kind: 'stack' } }), { a: 2.5 });
  });
  it('guesses the kind of kit from the name', () => {
    assert.equal(guessKind('Leg Press'), 'plates');
    assert.equal(guessKind('Incline DB Press'), 'dumbbells');
    assert.equal(guessKind('Weighted Pull-up'), 'bodyweight');
    assert.equal(guessKind('Cable Lateral Raise'), 'stack');
  });
});

describe('equipment: plates per side', () => {
  it('splits the plate weight evenly, heaviest plates first', () => {
    assert.deepEqual(platesPerSide(140), { side: [25, 25, 20], leftover: 0 });
    assert.deepEqual(platesPerSide(100, 20), { side: [25, 15], leftover: 0 });
  });
  it('reports any weight the plates cannot make', () => {
    assert.deepEqual(platesPerSide(101, 0), { side: [25, 25], leftover: 0.5 });
    assert.deepEqual(platesPerSide(65, 0, [20, 10]), { side: [20, 10], leftover: 2.5 });
  });
  it('handles nothing loaded and impossible totals', () => {
    assert.deepEqual(platesPerSide(20, 20), { side: [], leftover: 0 });   // empty bar or sled
    assert.equal(platesPerSide(10, 20), null);
    assert.equal(platesPerSide(NaN), null);
  });
});
