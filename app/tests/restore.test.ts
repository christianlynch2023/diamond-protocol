// Restore points in cloud sync: one dated copy per day, the latest 14 kept, erased with the snapshot.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createSyncHandler, rpIndexKey, rpKey, syncKey, RESTORE_KEEP } from '../../netlify/lib/sync';
import type { BlobStore } from '../../netlify/lib/sync';

const CODE = 'test-code-1234';
const KEY = syncKey(CODE);
const DAY = 86400000;
function setup(start = Date.UTC(2026, 9, 1, 9)) {
  const blobs = new Map<string, string>();
  const store: BlobStore & { failSetFor?: string } = {
    async get(k) { return blobs.has(k) ? (blobs.get(k) as string) : null; },
    async set(k, v) { if (store.failSetFor && k.includes(store.failSetFor)) throw new Error('blob down'); blobs.set(k, v); },
    async delete(k) { blobs.delete(k); },
  };
  let t = start;
  const h = createSyncHandler({ getStore: () => store, env: {}, now: () => t });
  const call = (httpMethod: string, extra: { body?: string; restore?: string } = {}) =>
    h({ httpMethod, headers: { 'x-sync-code': CODE }, body: extra.body ?? null, queryStringParameters: extra.restore ? { restore: extra.restore } : null });
  const snap = (n: number) => JSON.stringify({ logs: [{ n }], nutrition: [] });
  return { blobs, store, call, snap, tick: (days: number) => { t += days * DAY; } };
}
const json = (r: { body: string }) => JSON.parse(r.body);

describe('sync: restore points', () => {
  it('keeps the first save of each day as that day\u2019s restore point', async () => {
    const s = setup();
    assert.equal(json(await s.call('POST', { body: s.snap(1) })).restorePoint, 'saved');
    assert.equal(json(await s.call('POST', { body: s.snap(2) })).restorePoint, 'exists');
    assert.equal(s.blobs.get(rpKey(KEY, '2026-10-01')), s.snap(1));
    assert.equal(s.blobs.get(KEY), s.snap(2));          // the live snapshot still updates every time
  });
  it('lists restore points newest first and returns one by date', async () => {
    const s = setup();
    await s.call('POST', { body: s.snap(1) }); s.tick(1);
    await s.call('POST', { body: s.snap(2) });
    assert.deepEqual(json(await s.call('GET', { restore: 'list' })).dates, ['2026-10-02', '2026-10-01']);
    assert.deepEqual(json(await s.call('GET', { restore: '2026-10-01' })), JSON.parse(s.snap(1)));
    assert.equal((await s.call('GET', { restore: '2026-09-01' })).statusCode, 404);
    assert.equal((await s.call('GET', { restore: '../etc' })).statusCode, 400);
  });
  it(`keeps only the latest ${RESTORE_KEEP} days and deletes the rest`, async () => {
    const s = setup();
    for (let i = 0; i < RESTORE_KEEP + 3; i++) { await s.call('POST', { body: s.snap(i) }); s.tick(1); }
    const dates = json(await s.call('GET', { restore: 'list' })).dates as string[];
    assert.equal(dates.length, RESTORE_KEEP);
    assert.equal(dates[0], '2026-10-17');
    assert.equal(s.blobs.has(rpKey(KEY, '2026-10-01')), false);
    assert.equal(s.blobs.has(rpKey(KEY, '2026-10-04')), true);
  });
  it('does not keep an empty or broken snapshot as a restore point', async () => {
    const s = setup();
    assert.equal(json(await s.call('POST', { body: '{}' })).restorePoint, 'skipped');
    assert.equal(json(await s.call('POST', { body: 'not json' })).restorePoint, 'skipped');
    assert.equal(s.blobs.has(rpIndexKey(KEY)), false);
  });
  it('still saves the sync when a restore point cannot be written', async () => {
    const s = setup();
    s.store.failSetFor = '_rp_';
    const r = await s.call('POST', { body: s.snap(1) });
    assert.equal(r.statusCode, 200);
    assert.equal(json(r).restorePoint, 'failed');
    assert.equal(s.blobs.get(KEY), s.snap(1));
  });
  it('erases every restore point with the snapshot when data is cleared', async () => {
    const s = setup();
    await s.call('POST', { body: s.snap(1) }); s.tick(1); await s.call('POST', { body: s.snap(2) });
    assert.equal(json(await s.call('DELETE')).restorePointsDeleted, 2);
    assert.equal([...s.blobs.keys()].length, 0);
  });
  it('keeps restore points private to their sync code', async () => {
    const s = setup();
    await s.call('POST', { body: s.snap(1) });
    const h = createSyncHandler({ getStore: () => s.store, env: {} });
    const other = await h({ httpMethod: 'GET', headers: { 'x-sync-code': 'another-code-999' }, queryStringParameters: { restore: 'list' } });
    assert.deepEqual(json(other).dates, []);
  });
});
