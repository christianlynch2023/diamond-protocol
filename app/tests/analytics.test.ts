// Recovery / alcohol / deload analytics. These are where silent wrong answers have hidden before.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { relPerfByBucket, computeRecoveryPerformance, computeAlcoholImpact } from '../src/lib/associations';
import { computeDeloadRebound, sessionRealSets, sessionPerformed } from '../src/lib/sessions';
import { log, ymd } from './helpers';
import type { PerfRow } from '../src/types';

describe('analytics: progress is removed before comparing conditions (per-lift detrend)', () => {
  it('a lift that simply gets stronger every week shows no fake "condition" effect', () => {
    // Steady progress, alternating buckets. Without detrending, the later bucket would look ~2% stronger.
    const rows: PerfRow[] = Array.from({ length: 8 }, (_, i) => ({ pid: 'ua1', e1rm: 100 + 2.5 * i, bucket: i % 2 ? 'b' : 'a', sid: 's' + i, date: ymd(i * 7) }));
    const r = relPerfByBucket(rows)!;
    assert.ok(Math.abs(r.a.mean!) < 0.05 && Math.abs(r.b.mean!) < 0.05, `means were ${r.a.mean} / ${r.b.mean}`);
  });
  it('a real effect still shows up: sessions 5% below trend', () => {
    const rows: PerfRow[] = Array.from({ length: 9 }, (_, i) => ({ pid: 'ua1', e1rm: (100 + 2 * i) * (i % 3 === 0 ? 0.95 : 1), bucket: i % 3 === 0 ? 'tired' : 'fresh', sid: 's' + i, date: ymd(i * 7) }));
    const r = relPerfByBucket(rows)!;
    assert.ok(r.tired.mean! < -2 && r.fresh.mean! > 0, `tired ${r.tired.mean}, fresh ${r.fresh.mean}`);
  });
});

describe('analytics: recovery vs performance', () => {
  it('plots one scatter point per session (regression: points were always empty before Phase 3b)', () => {
    const recs = [85, 50, 20];
    const logs = Array.from({ length: 12 }, (_, i) => log({ d: i * 2, ex: [{ id: 'ua1', sets: [[100 + i, 8]] }, { id: 'ua3', sets: [[80 + i, 8]] }] }));
    const whoop = logs.map((l, i) => ({ date: l.date.slice(0, 10), recovery: recs[i % 3] }));
    const r = computeRecoveryPerformance(logs, whoop)!;
    assert.ok(r, 'expected a result');
    assert.equal(r.points.length, 12);
  });
});

describe('analytics: alcohol', () => {
  it('splits sessions into after-drinking and clear, with the counts the Progress card prints', () => {
    const logs = Array.from({ length: 10 }, (_, i) => log({ d: i * 3, ex: [{ id: 'ua1', sets: [[100 + i, 8]] }] }));
    const drinks = [0, 3, 6, 9].map(i => ({ date: logs[i].date, units: 4 }));
    const r = computeAlcoholImpact(logs, drinks)!;
    assert.deepEqual([r.after.sessions, r.clear.sessions], [4, 6]);
  });
});

describe('analytics: deload rebound', () => {
  it('compares each lift with itself the week before and after a deload, and reports the lift count', () => {
    const ex = (a: number, b: number) => [{ id: 'ua1', sets: [[a, 8]] as [number, number][] }, { id: 'ua3', sets: [[b, 8]] as [number, number][] }];
    const logs = [log({ d: 28, week: 5, ex: ex(105, 84) }), log({ d: 21, week: 4, deload: true, ex: ex(80, 60) }), log({ d: 14, week: 3, ex: ex(100, 80) })];
    const r = computeDeloadRebound(logs)!;
    assert.equal(r.events.length, 1);
    const e = r.events[0];
    assert.deepEqual([e.block, e.week, e.lifts], [1, 4, 2]);        // the Progress row shows "+x% · 2 lifts"
    // Both lifts rose exactly 5% in load at the same reps and programmed effort, so the true rebound is 5.0%. (The old formula's whole-kilo rounding gave 4.8.)
    assert.ok(Math.abs(e.pct - 5.0) < 0.11, `pct ${e.pct}`);
  });
});

describe('analytics: what counts as a performed session', () => {
  it('counts only sets with reps, and needs at least 3 to count as performed', () => {
    const l = log({ d: 0, ex: [{ id: 'ua1', sets: [[60, 8], [60, 0]] }, { id: 'ua3', sets: [[40, 10]] }] });
    assert.equal(sessionRealSets(l), 2);
    assert.equal(sessionPerformed(l), false);
    assert.equal(sessionPerformed(log({ d: 0, ex: [{ id: 'ua1', sets: [[60, 8], [60, 8], [60, 8]] }] })), true);
  });
});
