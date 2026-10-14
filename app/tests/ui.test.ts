// Chart helpers behind the round 2 sparklines and normal-range bars.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sparkPath, pctOf, percentile, normalRange } from '../src/lib/chartMath';
import type { SparkPath } from '../src/lib/chartMath';

const must = (s: SparkPath | null): SparkPath => { if (!s) throw new Error('expected a sparkline'); return s; };

describe('chart: sparklines', () => {
  it('draws nothing with fewer than two real points', () => {
    assert.equal(sparkPath([], 96, 28), null);
    assert.equal(sparkPath([5], 96, 28), null);
    assert.equal(sparkPath([null, 5, undefined], 96, 28), null);
  });
  it('skips gaps but keeps them on the x axis', () => {
    const s = must(sparkPath([10, null, 20], 100, 20, 0));
    assert.equal(s.d, 'M0 20 L100 0');
    assert.equal(s.cx, 100);
    assert.equal(s.cy, 0);
  });
  it('keeps every point inside the box, padding included', () => {
    const s = must(sparkPath([61, 72, 55, 80, 77, 69, 84], 96, 28, 3));
    const nums = s.d.replace(/[ML]/g, ' ').trim().split(/\s+/).map(Number);
    for (let i = 0; i < nums.length; i += 2) {
      assert.ok(nums[i]! >= 3 && nums[i]! <= 93, 'x in range');
      assert.ok(nums[i + 1]! >= 3 && nums[i + 1]! <= 25, 'y in range');
    }
  });
  it('draws a flat series through the middle, not along the floor', () => {
    const s = must(sparkPath([5, 5, 5], 90, 30, 3));
    assert.equal(s.cy, 15);
  });
});

describe('chart: scales and ranges', () => {
  it('clamps positions to the bar', () => {
    assert.equal(pctOf(5, 0, 10), 50);
    assert.equal(pctOf(-3, 0, 10), 0);
    assert.equal(pctOf(30, 0, 10), 100);
    assert.equal(pctOf(5, 10, 10), 50);
  });
  it('interpolates percentiles and ignores gaps', () => {
    assert.equal(percentile([1, 2, 3, 4], 0.5), 2.5);
    assert.equal(percentile([4, null, 1, 3, 2], 0.25), 1.75);
    assert.equal(percentile([], 0.5), null);
  });
  it('needs a week of readings before it calls anything normal', () => {
    assert.equal(normalRange([55, 60, 52, 63, 61, 58]), null);
    assert.deepEqual(normalRange([52, 55, 58, 60, 61, 63, 64, 70]), { lo: 57.25, hi: 63.25 });
  });
});
