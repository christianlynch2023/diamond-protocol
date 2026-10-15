// Analytics accuracy: effort-adjusted e1RM and the gaining / holding / declining trend.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyTrend, e1rmEffort, e1rmSet, needsAttention, rirNum, trendChange } from '../src/lib/strength';

const DAY = 86400000;
const epleyOld = (w: number, r: number) => (r <= 1 ? w : Math.round(w * (1 + r / 30)));

describe('strength: effort-adjusted e1RM', () => {
  it('counts reps in reserve as reps you could have done', () => {
    assert.equal(e1rmEffort(100, 8, 2), Math.round(100 * (1 + 10 / 30)));
    assert.equal(e1rmEffort(100, 8, 0), epleyOld(100, 8));
    assert.equal(e1rmEffort(100, 8, '4+'), Math.round(100 * (1 + 12 / 30)));
  });
  it('caps reserve at 4 and treats unreadable RIR as missing', () => {
    assert.equal(rirNum(7), 4);
    assert.equal(rirNum('x'), null);
    assert.equal(e1rmEffort(100, 8, 'x'), epleyOld(100, 8));
  });
  it('uses the programmed RIR when a set has none logged', () => {
    assert.equal(e1rmEffort(100, 8, null, 2), e1rmEffort(100, 8, 2));
    assert.equal(e1rmSet(100, { reps: 8 }), e1rmEffort(100, 8, 1));
  });
  it('returns 0 for empty sets and the load itself for a true single', () => {
    assert.equal(e1rmEffort(100, 0, 2), 0);
    assert.equal(e1rmEffort(0, 8, 2), 0);
    assert.equal(e1rmEffort(140, 1, 0), 140);
  });
  it('removes the block-long bias: same strength, RIR falling 2 to 0, reps rising 8 to 10', () => {
    // Real strength unchanged. Each week the RIR target drops, so the same load goes for more reps.
    const week = (i: number, reps: number, rir: number) => ({ t: i * 7 * DAY, reps, rir });
    const sets = [week(0, 8, 2), week(1, 8, 2), week(2, 9, 1), week(3, 9, 1), week(4, 10, 0), week(5, 10, 0)];
    const oldTrend = trendChange(sets.map(s => ({ t: s.t, v: epleyOld(100, s.reps) })));
    const newTrend = trendChange(sets.map(s => ({ t: s.t, v: e1rmEffort(100, s.reps, s.rir) })));
    assert.equal(classifyTrend(oldTrend?.changePct ?? 0), 'gaining', `old formula reports a gain of ${oldTrend?.changePct}%`);
    assert.equal(classifyTrend(newTrend?.changePct ?? 99), 'holding');
    assert.equal(newTrend?.changePct, 0);
  });
});

describe('strength: trend over recent sessions', () => {
  const series = (vals: number[]) => vals.map((v, i) => ({ t: i * 7 * DAY, v }));
  it('needs four sessions before giving a verdict', () => {
    assert.equal(trendChange(series([100, 101, 102])), null);
    assert.ok(trendChange(series([100, 101, 102, 103])));
  });
  it('calls steady improvement gaining and steady loss declining', () => {
    const up = trendChange(series([100, 101, 102, 103, 104, 105]));
    const down = trendChange(series([105, 104, 103, 102, 101, 100]));
    assert.equal(classifyTrend(up?.changePct ?? 0), 'gaining');
    assert.equal(classifyTrend(down?.changePct ?? 0), 'declining');
  });
  it('is not fooled by one good or bad day', () => {
    // Flat with a single spike: "best of the last two" would have called this a 6% gain.
    const spike = trendChange(series([100, 101, 100, 99, 106, 100]));
    assert.equal(classifyTrend(spike?.changePct ?? 99), 'holding');
    const dip = trendChange(series([100, 101, 100, 92, 100, 101]));
    assert.equal(classifyTrend(dip?.changePct ?? -99), 'holding');
  });
  it('treats a small drift inside the noise band as holding', () => {
    // About +1% over six sessions: a rep here or there, not a real change.
    const small = trendChange(series([100, 100.2, 100.4, 100.6, 100.8, 101]));
    assert.ok((small?.changePct ?? 0) > 0.5 && (small?.changePct ?? 0) < 2);
    assert.equal(classifyTrend(small?.changePct ?? 99), 'holding');
  });
  it('only looks at the latest six sessions, in any stored order', () => {
    const old = [{ t: -50 * DAY, v: 50 }, { t: -40 * DAY, v: 60 }];
    const recent = series([100, 100, 100, 100, 100, 100]).reverse();
    assert.equal(trendChange([...recent, ...old])?.changePct, 0);
  });
});

describe('strength: what needs attention', () => {
  it('flags only declining lifts on a cut', () => {
    assert.equal(needsAttention('holding', 'cut'), false);
    assert.equal(needsAttention('declining', 'cut'), true);
  });
  it('flags holding and declining lifts outside a cut', () => {
    assert.equal(needsAttention('holding', 'bulk'), true);
    assert.equal(needsAttention('holding', null), true);
    assert.equal(needsAttention('gaining', 'bulk'), false);
  });
});
