// The progression engine decides "increase / beat / keep". Wrong answers here change your training.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { epley, getProgRec, dailyMedianWeights, makeBwResolver, theilSenSlope } from '../src/lib/training';
import { log, day } from './helpers';

const ua1 = (d: number, sets: [number, number][], extra: { deload?: boolean; week?: number } = {}) => log({ d, ...extra, ex: [{ id: 'ua1', sets }] });

describe('training: estimated 1RM', () => {
  it('uses the Epley formula and treats singles as the weight itself', () => {
    assert.equal(epley(100, 10), 133);
    assert.equal(epley(140, 1), 140);
  });
});

describe('training: progression engine', () => {
  it('says "first" with no history', () => {
    assert.equal(getProgRec('ua1', 10, [], 'bulk').type, 'first');
  });
  it('says increase when every set hit the rep cap at the same load', () => {
    const r = getProgRec('ua1', 10, [ua1(1, [[60, 10], [60, 10], [60, 10]])], 'bulk');
    assert.deepEqual([r.type, r.wt], ['inc', 60]);
  });
  it('words the increase as optional during a cut', () => {
    assert.match(getProgRec('ua1', 10, [ua1(1, [[60, 10], [60, 10]])], 'cut').msg, /if it's there/);
  });
  it('says beat when only some sets hit the cap, keep when none did', () => {
    assert.equal(getProgRec('ua1', 10, [ua1(1, [[60, 10], [60, 8]])], 'bulk').type, 'beat');
    assert.equal(getProgRec('ua1', 10, [ua1(1, [[60, 7], [60, 6]])], 'bulk').type, 'keep');
  });
  it('ignores deload sessions (flagged, or in a deload week on older logs)', () => {
    const logs = [ua1(8, [[50, 10], [50, 10]], { deload: true }), ua1(1, [[60, 7], [60, 6]])];
    assert.equal(getProgRec('ua1', 10, logs, 'bulk').type, 'keep');
    const legacy = [{ ...ua1(8, [[50, 10], [50, 10]]), deload: undefined, week: 4 }, ua1(1, [[60, 7], [60, 6]])];
    assert.equal(getProgRec('ua1', 10, legacy as any, 'bulk').type, 'keep');
  });
  it('judges a top set + back-offs against each slot\u2019s own cap (top set 6-8, back-offs 8-10)', () => {
    const ex = { rMax: 10, setPlan: [{ label: 'Top', sets: 1, rMin: 6, rMax: 8, pct: 1 }, { label: 'Back-off', sets: 2, rMin: 8, rMax: 10, pct: 0.9 }] };
    const logs = [ua1(1, [[60, 8], [55, 10], [55, 10]])];
    assert.equal(getProgRec('ua1', ex, logs, 'bulk').type, 'inc');     // every slot capped
    assert.equal(getProgRec('ua1', 10, logs, 'bulk').type, 'beat');    // a single envelope cap would never reward this
  });
});

describe('training: bodyweight', () => {
  it('takes the median of several weigh-ins on the same day', () => {
    const at = (h: number) => new Date(Date.UTC(2026, 8, 5, h)).toISOString();
    const out = dailyMedianWeights([{ date: at(9), weight: 90 }, { date: at(12), weight: 91.5 }, { date: at(15), weight: 92 }]);
    assert.equal(out.length, 1);
    assert.equal(out[0].weight, 91.5);
  });
  it('resolves the weigh-in nearest a date, or the latest when no date is given', () => {
    const bw = makeBwResolver([{ date: day(0), weight: 92 }, { date: day(10), weight: 90 }, { date: day(20), weight: 88 }])!;
    assert.equal(bw(day(9)), 90);
    assert.equal(bw(day(1)), 92);
    assert.equal(bw(), 88);
  });
  it('estimates a weight trend robustly (Theil-Sen ignores one bad weigh-in)', () => {
    const pts = [0, 1, 2, 3, 4, 5, 6].map(t => ({ t, w: 90 - 0.1 * t }));
    pts[3].w = 95;                                                   // a single bad reading
    assert.ok(Math.abs(theilSenSlope(pts)! - -0.1) < 1e-9);
  });
});
