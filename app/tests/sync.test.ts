// Cloud sync and import depend on these merge rules. A mistake here loses or resurrects data silently.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pickNewer, mergeByKey, live, ensureIds, pruneTombstones, mergeLogs } from '../src/lib/sync';
import { log } from './helpers';

const byId = (e: { id?: string }) => e.id as string;

describe('sync: picking the newer copy', () => {
  it('the copy with the later updatedAt wins', () => {
    assert.equal(pickNewer({ id: 'a', updatedAt: 1 }, { id: 'a', updatedAt: 2 }).updatedAt, 2);
  });
  it('a tie keeps the local (first) copy, so merges are deterministic', () => {
    const local = { id: 'a', updatedAt: 5, v: 'local' }, cloud = { id: 'a', updatedAt: 5, v: 'cloud' };
    assert.equal(pickNewer(local, cloud).v, 'local');
  });
  it('a record with no updatedAt counts as oldest', () => {
    assert.equal(pickNewer({ id: 'a' }, { id: 'a', updatedAt: 1 }).updatedAt, 1);
  });
});

describe('sync: merging two devices', () => {
  it('keeps the union of records and the newer copy of each', () => {
    const phone = [{ id: 'a', date: '2026-09-01', updatedAt: 2, w: 90 }, { id: 'b', date: '2026-09-02', updatedAt: 1, w: 89 }];
    const cloud = [{ id: 'a', date: '2026-09-01', updatedAt: 1, w: 99 }, { id: 'c', date: '2026-09-03', updatedAt: 1, w: 88 }];
    const out = mergeByKey(phone, cloud, byId);
    assert.deepEqual(out.map(e => e.id), ['c', 'b', 'a']);           // newest date first
    assert.equal(out.find(e => e.id === 'a')!.w, 90);                 // newer copy kept
  });
  it('a delete on one device is not undone by an older live copy from another', () => {
    const phone = [{ id: 'a', date: '2026-09-01', updatedAt: 10, deletedAt: 10 }];   // deleted on phone
    const cloud = [{ id: 'a', date: '2026-09-01', updatedAt: 5 }];                  // older live copy
    const out = mergeByKey(phone, cloud, byId);
    assert.equal(live(out).length, 0);
  });
  it('an edit made after a delete brings the record back (last write wins)', () => {
    const out = mergeByKey([{ id: 'a', date: 'x', updatedAt: 5, deletedAt: 5 }], [{ id: 'a', date: 'x', updatedAt: 9 }], byId);
    assert.equal(live(out).length, 1);
  });
});

describe('sync: tombstones and ids', () => {
  it('live() hides deleted and empty entries', () => {
    assert.deepEqual(live([{ id: 'a' }, { id: 'b', deletedAt: 1 }, null as any]).map(e => e.id), ['a']);
  });
  it('pruneTombstones drops deletes older than 90 days by default, keeps recent ones and live records', () => {
    const old = Date.now() - 100 * 86400000, recent = Date.now() - 10 * 86400000;
    const out = pruneTombstones([{ id: 'live' }, { id: 'old', deletedAt: old }, { id: 'recent', deletedAt: recent }]);
    assert.deepEqual(out.map(e => e.id), ['live', 'recent']);
    assert.deepEqual(pruneTombstones([{ id: 'recent', deletedAt: recent }], 5).map(e => e.id), []);
  });
  it('ensureIds gives id-less records a stable id and leaves already-identified lists untouched', () => {
    const a = ensureIds([{ date: '2026-09-01', weight: 90 } as any], 'bm')!;
    const b = ensureIds([{ date: '2026-09-01', weight: 90 } as any], 'bm')!;
    assert.ok(a[0].id && a[0].id.startsWith('lg_bm_'));
    assert.equal(a[0].id, b[0].id);                                   // same record, same id on every device
    const withIds = [{ id: 'x' }];
    assert.equal(ensureIds(withIds, 'bm'), withIds);                  // same array back: no needless re-render
  });
  it('mergeLogs de-duplicates sessions by id, keeps the newer copy and sorts newest first', () => {
    const a = [{ ...log({ id: 's1', d: 1 }), updatedAt: 1 }, log({ id: 's2', d: 3 })];
    const b = [{ ...log({ id: 's1', d: 1 }), updatedAt: 2, note: 'edited' }];
    const out = mergeLogs(a, b);
    assert.deepEqual(out.map(l => l.id), ['s2', 's1']);
    assert.equal(out.find(l => l.id === 's1')!.note, 'edited');
  });
});
