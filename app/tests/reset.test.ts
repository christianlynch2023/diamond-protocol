// Reset after repeated misses: when it triggers, by how much, and when it must not.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resetFromHistory } from '../src/lib/reset';

const s = (w: number, ...reps: number[]) => ({ sets: reps.map(r => ({ weight: w, reps: r })) });
const ex = { rMin: 8 };

describe('reset: when it triggers', () => {
  it('drops 10% after the first set misses the bottom of the range twice at the same load', () => {
    const r = resetFromHistory([s(100, 6, 6), s(100, 5, 5)], ex, 2.5);
    assert.equal(r?.weight, 90);
    assert.equal(r?.reps, 8);
    assert.match(r?.note ?? '', /^Reset: 5 and 6 reps at 100 kg, under 8 twice\. Drop 10% to 90 kg/);
  });
  it('drops only 5% when both misses were by a single rep', () => {
    assert.equal(resetFromHistory([s(100, 7), s(100, 7)], ex, 2.5)?.weight, 95);
  });
  it('rounds down to your weight jump and always drops at least one jump', () => {
    assert.equal(resetFromHistory([s(47, 7), s(47, 7)], ex, 5)?.weight, 40);
    assert.equal(resetFromHistory([s(20, 7), s(20, 7)], ex, 1)?.weight, 19);
    assert.equal(resetFromHistory([s(10, 7), s(10, 7)], ex, 2.5)?.weight, 7.5);
  });
  it('judges a top-set plan against the top set\u2019s own range', () => {
    const plan = { rMin: 10, setPlan: [{ rMin: 6 }, { rMin: 8 }] };
    assert.equal(resetFromHistory([s(140, 5, 9), s(140, 5, 9)], plan, 2.5)?.reps, 6);
    assert.equal(resetFromHistory([s(140, 6, 7), s(140, 6, 7)], plan, 2.5), null);   // top set hit 6
  });
});

describe('reset: when it must not trigger', () => {
  it('needs two misses in a row', () => {
    assert.equal(resetFromHistory([s(100, 6), s(100, 8)], ex, 2.5), null);
    assert.equal(resetFromHistory([s(100, 6)], ex, 2.5), null);
    assert.equal(resetFromHistory([], ex, 2.5), null);
  });
  it('needs the same load both times (a new heavier load gets its chance)', () => {
    assert.equal(resetFromHistory([s(102.5, 6), s(100, 6)], ex, 2.5), null);
  });
  it('ignores sessions where the first set was not the top set', () => {
    const odd = { sets: [{ weight: 80, reps: 6 }, { weight: 100, reps: 6 }] };
    assert.equal(resetFromHistory([odd, odd], ex, 2.5), null);
  });
  it('does not trigger when the bottom of the range was reached', () => {
    assert.equal(resetFromHistory([s(100, 8, 6), s(100, 8, 5)], ex, 2.5), null);
  });
});
