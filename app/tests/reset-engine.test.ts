// Reset after repeated misses, through the real progression engine and programme data.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getTarget } from '../src/lib/training';
import { EX_DEF_BY_ID } from '../src/data/programme';
import { log } from './helpers';

const ex: any = (EX_DEF_BY_ID as any)['ua1'];
const rMin: number = (ex.setPlan && ex.setPlan[0] ? ex.setPlan[0].rMin : ex.rMin);
const session = (d: number, week: number, reps: number) => log({ d, week, ex: [{ id: 'ua1', sets: [[100, reps], [100, reps]] }] });

describe('reset: in the progression engine', () => {
  it('prescribes a lower load after two misses at the same load', () => {
    const logs = [session(21, 3, rMin - 2), session(14, 2, rMin - 2)];
    const t: any = getTarget(ex, logs, 5, 'cut', undefined, false);
    assert.ok(t.weight < 100, `weight ${t.weight}`);
    assert.match(String(t.note), /^Reset/);
  });
  it('keeps the old behaviour after a single miss', () => {
    const logs = [session(21, 3, rMin - 2), session(14, 2, rMin)];
    const t: any = getTarget(ex, logs, 5, 'cut', undefined, false);
    assert.equal(t.weight, 100);
    assert.doesNotMatch(String(t.note), /^Reset/);
  });
  it('still prescribes the deload in a deload week', () => {
    const logs = [session(21, 3, rMin - 2), session(14, 2, rMin - 2)];
    const t: any = getTarget(ex, logs, 4, 'cut', undefined, true);
    assert.match(String(t.note), /^Deload/);
  });
});
