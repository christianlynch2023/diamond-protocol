// Records saved before the app had IDs get one built from their content. It must be the same on every
// device, or a merge sees one record as two (a duplicate) and a delete on one device doesn't carry over.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ensureIds, mergeByKey, live, tombstoneWhere } from '../src/lib/sync';

const w = (date: string, weight: number) => ({ date, weight }) as any;
const byId = (e: { id?: string }) => e.id as string;

describe('ids: records saved before IDs existed', () => {
  it('the same record gets the same ID on two devices even when it sits at a different position', () => {
    const rec = w('2026-03-01T07:00:00.000Z', 91.2);
    const phone = ensureIds([w('2026-03-02T07:00:00.000Z', 91.0), rec], 'bm')!;     // position 1 on the phone
    const cloud = ensureIds([rec], 'bm')!;                                           // position 0 in the cloud
    assert.equal(phone[1].id, cloud[0].id);
    assert.equal(live(mergeByKey(phone, cloud, byId)).length, 2);                    // not 3: no duplicate
  });
  it('deleting an ID-less record on one device removes it on the other after a sync', () => {
    const rec = w('2026-03-01T07:00:00.000Z', 91.2);
    const phone = tombstoneWhere([w('2026-03-05T07:00:00.000Z', 90), rec], 'bm', e => e.weight === 91.2, 1000)!;
    const cloud = ensureIds([rec], 'bm')!;
    assert.equal(live(mergeByKey(phone, cloud, byId)).map(e => e.weight).join(), '90');
  });
  it('two identical readings on the same day stay two records (the reason ids once used position)', () => {
    const bp = { date: '2026-03-01T12:00:00.000Z', sys: 128, dia: 82, pulse: 60 } as any;
    const phone = ensureIds([bp, { ...bp }], 'bp')!;
    assert.notEqual(phone[0].id, phone[1].id);
    const cloud = ensureIds([{ ...bp }, { ...bp }], 'bp')!;
    assert.equal(live(mergeByKey(phone, cloud, byId)).length, 2);                    // not 1, not 4
  });
  it('records with IDs keep them', () => {
    const out = tombstoneWhere([{ id: 'keep', date: 'x' } as any], 'bm', () => true, 5);
    assert.deepEqual([out[0].id, out[0].deletedAt, out[0].updatedAt], ['keep', 5, 5]);
  });
});
