// Analytics accuracy, end to end through the real computeStalls (with the real programme data).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeStalls } from '../src/lib/sessions';

const DAY = 86400000;
const start = Date.UTC(2026, 7, 1);
// One session a week for a made-up lift, explicitly not deloads, with RIR logged on every set.
const logsFor = (sets: { weight: number; reps: number; rir: number }[], id = 'aa-test-lift') =>
  sets.map((s, i) => ({
    id: `${id}-${i}`, date: new Date(start + i * 7 * DAY).toISOString(), sessionId: 'upperA', week: i + 1, block: 1, deload: false,
    exercises: [{ id, name: id, sets: [s, s, s] }],
  })) as any;

// Same strength all block: RIR target falls 2 -> 0, so the same 100 kg goes for 8 -> 10 reps.
const holdingLift = logsFor([8, 8, 9, 9, 10, 10].map((reps, i) => ({ weight: 100, reps, rir: [2, 2, 1, 1, 0, 0][i] as number })));
// Genuinely getting stronger: load climbs at the same reps and effort.
const gainingLift = logsFor([100, 102.5, 105, 107.5, 110, 112.5].map(weight => ({ weight, reps: 8, rir: 2 })), 'aa-gaining-lift');

describe('analytics accuracy: stalls end to end', () => {
  it('sees a falling-RIR block at the same strength as holding, not progress', () => {
    const r = computeStalls(holdingLift, 3, null, 'cut');
    const all = [...(r?.stalled ?? []), ...(r?.progressing ?? []), ...(r?.holding ?? [])];
    assert.equal(all.length, 1);
    assert.equal(all[0]?.trend, 'holding');
    assert.equal(r?.progressing.length, 0);
  });
  it('does not flag a holding lift on a cut, but does outside one', () => {
    assert.equal(computeStalls(holdingLift, 3, null, 'cut')?.stalled.length, 0);
    assert.equal(computeStalls(holdingLift, 3, null, 'cut')?.holding.length, 1);
    assert.equal(computeStalls(holdingLift, 3, null, 'bulk')?.stalled.length, 1);
  });
  it('shows a lift with a rising load as progressing', () => {
    const r = computeStalls(gainingLift, 3, null, 'cut');
    assert.equal(r?.progressing.length, 1);
    assert.ok((r?.progressing[0]?.pct ?? 0) > 2);
  });
});
