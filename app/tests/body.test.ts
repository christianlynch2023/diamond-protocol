// Round 2 Body summary tiles and chart axis labels.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { newest, agoLabel, lastDays } from '../src/lib/body';
import { tickLabel } from '../src/lib/chartMath';

const now = new Date('2026-10-15T09:00:00');

describe('body: summary tiles', () => {
  it('finds the newest live entry whatever the stored order, skipping deleted and undated ones', () => {
    const list = [{ date: '2026-10-01', v: 1 }, { date: '2026-10-12', v: 2, deletedAt: 5 }, { date: '2026-10-09', v: 3 }, { v: 4 } as { date?: string; v: number }];
    assert.equal(newest(list)?.v, 3);
    assert.equal(newest(list, e => e.v === 1)?.v, 1);
    assert.equal(newest([]), null);
  });
  it('says how long ago in plain words, by calendar day', () => {
    assert.equal(agoLabel('2026-10-15', now), 'today');
    assert.equal(agoLabel('2026-10-14T23:30:00', now), 'yesterday');
    assert.equal(agoLabel('2026-10-10', now), '5 days ago');
    assert.equal(agoLabel('2026-09-24', now), '3 weeks ago');
    assert.equal(agoLabel('2026-05-12', now), '5 months ago');
    assert.equal(agoLabel('nonsense', now), '');
  });
  it('totals the last 7 days including today, and nothing older', () => {
    const cardio = [{ date: '2026-10-15', minutes: 30 }, { date: '2026-10-09', minutes: 40 }, { date: '2026-10-08', minutes: 99 }, { date: '2026-10-12', minutes: 26, deletedAt: 1 }];
    assert.deepEqual(lastDays(cardio, now, 7, 'minutes'), { sum: 70, count: 2 });
  });
});

describe('charts: axis labels', () => {
  it('shows tenths on a bodyweight-sized axis and whole numbers on a calorie-sized one', () => {
    assert.equal(tickLabel(88.44, 6), '88.4');
    assert.equal(tickLabel(2134.6, 1500), '2135');
    assert.equal(tickLabel(5.125, 1.5), '5.13');
    assert.equal(tickLabel(NaN, 6), '');
  });
});
