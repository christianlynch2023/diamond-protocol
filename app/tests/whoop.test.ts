// WHOOP parsing: wrong dates or naps counted as sleep would skew every recovery signal.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseWhoopSleeps, parseWhoopHistory, mergeHistory } from '../src/lib/whoop';

const localISO = (y: number, m: number, d: number, h: number) => new Date(y, m, d, h).toISOString();
const sleep = (o: any) => ({ score_state: 'SCORED', nap: false, end: localISO(2026, 9, 5, 7), ...o,
  score: { stage_summary: { total_light_sleep_time_milli: 4 * 3600e3, total_slow_wave_sleep_time_milli: 1.5 * 3600e3, total_rem_sleep_time_milli: 1.5 * 3600e3 },
           sleep_needed: { baseline_milli: 8 * 3600e3 }, sleep_performance_percentage: 88.4, respiratory_rate: 15.26, ...(o.score || {}) } });

describe('whoop: sleeps', () => {
  it('skips naps and unscored sleeps', () => {
    const out = parseWhoopSleeps({ records: [sleep({}), sleep({ nap: true }), sleep({ score_state: 'PENDING_SCORE' })] });
    assert.equal(out.length, 1);
  });
  it('dates a sleep by the local day it ended, and converts stages to hours', () => {
    const [s] = parseWhoopSleeps({ records: [sleep({})] });
    assert.equal(s.date, '2026-10-05');
    assert.equal(s.sleepHrs, 7);
    assert.equal(s.deepHrs, 1.5);
    assert.equal(s.sleepDebt, 1);              // needed 8h, slept 7h
    assert.equal(s.respRate, 15.3);
    assert.equal(s.sleepPerf, 88);
  });
});

describe('whoop: recovery history', () => {
  it('uses the local date and drops records without a recovery score', () => {
    const out = parseWhoopHistory({ records: [
      { created_at: localISO(2026, 9, 6, 6), score: { recovery_score: 71.6, hrv_rmssd_milli: 44.4, resting_heart_rate: 52, skin_temp_celsius: 33.66 } },
      { created_at: localISO(2026, 9, 7, 6), score: {} },
    ] });
    assert.equal(out.length, 1);
    assert.deepEqual([out[0].date, out[0].recovery, out[0].hrv, out[0].rhr, out[0].skinTemp], ['2026-10-06', 72, 44, 52, 33.7]);
  });
  it('merges different feeds for the same day without blanks erasing values', () => {
    const out = mergeHistory([{ date: '2026-10-05', recovery: 70, sleepHrs: null }], [{ date: '2026-10-05', recovery: null, sleepHrs: 7.2 }]);
    assert.deepEqual([out.length, out[0].recovery, out[0].sleepHrs], [1, 70, 7.2]);
  });
  it('keeps days in date order and only the most recent 60', () => {
    const days = Array.from({ length: 70 }, (_, i) => ({ date: `2026-${String(7 + Math.floor(i / 28)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`, recovery: 50 }));
    const out = mergeHistory(days.slice().reverse(), []);
    assert.equal(out.length, 60);
    assert.ok(out[0].date < out[59].date);
  });
});
