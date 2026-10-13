// Cloud sync: one JSON snapshot per sync code in Netlify Blobs. GET reads, POST writes, DELETE erases.
import { createHash } from 'crypto';
import type { Env, FnEvent, FnResponse, Handler } from './types';

export const MIN_CODE_LENGTH = 8;

/** Storage key derived from the private sync code. Unguessable given the code, so all security
 *  rests on the code's entropy (there is no rate limiting): use a long random code. */
export function syncKey(code: string): string {
  return 'dp_' + createHash('sha256').update(code).digest('hex').slice(0, 40);
}

export interface BlobStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
  delete(key: string): Promise<unknown>;
}
export type GetStore = (opts: { name: string; siteID?: string; token?: string }) => BlobStore;

export function createSyncHandler(deps: { getStore: GetStore; env: Env }): Handler {
  return async (event: FnEvent): Promise<FnResponse> => {
    const code = event.headers['x-sync-code'] || '';
    if (code.length < MIN_CODE_LENGTH) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Sync code must be at least 8 characters' }) };
    }
    const key = syncKey(code);
    try {
      const store = deps.getStore({ name: 'diamond-sync', siteID: deps.env.NETLIFY_SITE_ID, token: deps.env.NETLIFY_API_TOKEN });
      if (event.httpMethod === 'GET') {
        const data = await store.get(key);
        return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' }, body: data || JSON.stringify(null) };
      }
      if (event.httpMethod === 'POST') {
        await store.set(key, event.body || '{}');
        return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, savedAt: Date.now() }) };
      }
      // Remote erasure, so "Clear Everything" also removes the cloud copy (otherwise the next
      // device to sync would restore it all).
      if (event.httpMethod === 'DELETE') {
        await store.delete(key);
        return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, deleted: true, deletedAt: Date.now() }) };
      }
      return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
    } catch (err: any) {
      return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
  };
}
