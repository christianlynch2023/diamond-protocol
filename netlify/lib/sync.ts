// Cloud sync: one JSON snapshot per sync code in Netlify Blobs. GET reads, POST writes, DELETE erases.
// Restore points: the first save each day also keeps a dated copy beside it; the latest RESTORE_KEEP
// days are kept. GET ?restore=list lists them, GET ?restore=YYYY-MM-DD returns one, DELETE erases them
// all with the snapshot. A restore point that fails to save never fails the sync itself.
import { createHash } from 'crypto';
import type { Env, FnEvent, FnResponse, Handler } from './types';

export const MIN_CODE_LENGTH = 8;
export const RESTORE_KEEP = 14;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Storage key derived from the private sync code. Unguessable given the code, so all security
 *  rests on the code's entropy (there is no rate limiting): use a long random code. */
export function syncKey(code: string): string {
  return 'dp_' + createHash('sha256').update(code).digest('hex').slice(0, 40);
}
export const rpKey = (key: string, date: string): string => `${key}_rp_${date}`;
export const rpIndexKey = (key: string): string => `${key}_rp_index`;

export interface BlobStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
  delete(key: string): Promise<unknown>;
}
export type GetStore = (opts: { name: string; siteID?: string; token?: string }) => BlobStore;

async function readIndex(store: BlobStore, key: string): Promise<string[]> {
  try {
    const raw = await store.get(rpIndexKey(key));
    const arr: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((d): d is string => typeof d === 'string' && DATE_RE.test(d)).sort() : [];
  } catch { return []; }
}

/** A snapshot worth keeping: a JSON object holding at least one data array. */
function worthKeeping(body: string): boolean {
  try {
    const d: unknown = JSON.parse(body);
    return !!d && typeof d === 'object' && !Array.isArray(d) && Object.values(d as Record<string, unknown>).some(v => Array.isArray(v));
  } catch { return false; }
}

async function saveRestorePoint(store: BlobStore, key: string, body: string, today: string): Promise<'saved' | 'exists' | 'skipped'> {
  if (!worthKeeping(body)) return 'skipped';
  const index = await readIndex(store, key);
  if (index.includes(today)) return 'exists';
  await store.set(rpKey(key, today), body);
  const next = [...index, today].sort();
  const keep = next.slice(-RESTORE_KEEP);
  const drop = next.slice(0, Math.max(0, next.length - RESTORE_KEEP));
  await store.set(rpIndexKey(key), JSON.stringify(keep));
  for (const d of drop) { try { await store.delete(rpKey(key, d)); } catch { /* best effort */ } }
  return 'saved';
}

export function createSyncHandler(deps: { getStore: GetStore; env: Env; now?: () => number }): Handler {
  const now = deps.now ?? Date.now;
  return async (event: FnEvent): Promise<FnResponse> => {
    const code = event.headers['x-sync-code'] || '';
    if (code.length < MIN_CODE_LENGTH) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Sync code must be at least 8 characters' }) };
    }
    const key = syncKey(code);
    try {
      const store = deps.getStore({ name: 'diamond-sync', siteID: deps.env.NETLIFY_SITE_ID, token: deps.env.NETLIFY_API_TOKEN });
      if (event.httpMethod === 'GET') {
        const restore = event.queryStringParameters ? event.queryStringParameters.restore : undefined;
        if (restore === 'list') {
          const dates = (await readIndex(store, key)).reverse();
          return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' }, body: JSON.stringify({ dates }) };
        }
        if (restore !== undefined) {
          if (!DATE_RE.test(restore)) return { statusCode: 400, body: JSON.stringify({ error: 'Restore date must be YYYY-MM-DD' }) };
          const snap = await store.get(rpKey(key, restore));
          if (!snap) return { statusCode: 404, body: JSON.stringify({ error: 'No restore point for that date' }) };
          return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' }, body: snap };
        }
        const data = await store.get(key);
        return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' }, body: data || JSON.stringify(null) };
      }
      if (event.httpMethod === 'POST') {
        const body = event.body || '{}';
        await store.set(key, body);
        let restorePoint: string;
        try { restorePoint = await saveRestorePoint(store, key, body, new Date(now()).toISOString().slice(0, 10)); }
        catch { restorePoint = 'failed'; }
        return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, savedAt: Date.now(), restorePoint }) };
      }
      // Remote erasure, so "Clear Everything" also removes the cloud copy and every restore point
      // (otherwise the next device to sync, or a restore, would bring it all back).
      if (event.httpMethod === 'DELETE') {
        await store.delete(key);
        const dates = await readIndex(store, key);
        for (const d of dates) { try { await store.delete(rpKey(key, d)); } catch { /* best effort */ } }
        try { await store.delete(rpIndexKey(key)); } catch { /* best effort */ }
        return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, deleted: true, deletedAt: Date.now(), restorePointsDeleted: dates.length }) };
      }
      return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
    } catch (err: any) {
      return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
  };
}
