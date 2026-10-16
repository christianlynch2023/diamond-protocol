// Weekly review: strength picture, recovery vs normal, logging, and the week's focus.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loggingWeek, strengthMix, weekVsNormal, weeklyFocus } from '../src/lib/weekly';
import type { ReviewItem } from '../src/lib/weekly';

const item = (k: string, verdict: ReviewItem['verdict']): ReviewItem => ({ k, v: '', note: '', verdict });

describe('weekly review: the week in numbers', () => {
  it('counts lifts gaining, holding and declining from the trend lists', () => {
    const m = strengthMix({ progressing: [{ name: 'Press', trend: 'gaining' }], holding: [{ name: 'Row', trend: 'holding' }], stalled: [{ name: 'Squat', trend: 'declining' }, { name: 'Curl', trend: 'holding' }] });
    assert.deepEqual(m, { gaining: 1, holding: 2, declining: ['Squat'], total: 4 });
    assert.deepEqual(strengthMix(null), { gaining: 0, holding: 0, declining: [], total: 0 });
  });
  it('places the week\u2019s average against your normal range', () => {
    assert.deepEqual(weekVsNormal([60, null, 70, 65], { lo: 55, hi: 70 }), { avg: 65, n: 3, where: 'within' });
    assert.equal(weekVsNormal([40, 45], { lo: 55, hi: 70 }).where, 'below');
    assert.equal(weekVsNormal([null, null], null).avg, null);
  });
  it('counts days with food logged and days weighed, over the last seven days', () => {
    const food = [{ date: '2026-10-15' }, { date: '2026-10-12' }, { date: '2026-10-08' }, { date: '2026-10-14', deletedAt: 5 }];
    const weigh = [{ date: '2026-10-15T07:00:00' }, { date: '2026-10-15T07:05:00' }, { date: '2026-10-10' }];
    assert.deepEqual(loggingWeek(food, weigh, '2026-10-15'), { foodDays: 2, weighDays: 2 });
  });
});

describe('weekly review: this week\u2019s focus', () => {
  it('puts misses before near-misses, most important first, and stops at two', () => {
    const items = [item('Calories', 'miss'), item('Protein', 'miss'), item('Sessions', 'ok'), item('Volume', 'miss')];
    const a = weeklyFocus(items, { pDelta: -32, calDelta: 180, sessionsShort: 1, underMuscles: [{ name: 'calves', have: 6, min: 8 }] });
    assert.deepEqual(a.map(x => x.area), ['Protein', 'Volume']);
    assert.match(a[0]?.text ?? '', /32 g a day under/);
  });
  it('uses your cut rules for the rate of loss', () => {
    const fast = weeklyFocus([item('Weight', 'miss')], { phase: 'cut', weightPct: -1.3 });
    assert.match(fast[0]?.text ?? '', /add about 150 kcal of carbs/);
    const slow = weeklyFocus([item('Weight', 'ok')], { phase: 'cut', weightPct: -0.1 });
    assert.match(slow[0]?.text ?? '', /2,000 steps/);
  });
  it('names declining lifts and never tells you to add load', () => {
    const a = weeklyFocus([item('Stalled lifts', 'ok')], { declining: ['Hack squat'] });
    assert.match(a[0]?.text ?? '', /Hack squat is declining/);
    assert.doesNotMatch(a[0]?.text ?? '', /add (weight|load)/i);
  });
  it('says nothing when everything is on target', () => {
    assert.deepEqual(weeklyFocus([item('Sessions', 'good'), item('Protein', 'good')], {}), []);
  });
});
