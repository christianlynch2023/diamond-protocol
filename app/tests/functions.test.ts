// Server functions (netlify/lib). Fakes only: no real WHOOP, Anthropic or cloud storage is touched.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import aiLib from '../../netlify/lib/ai';
import syncLib from '../../netlify/lib/sync';
import whoopLib from '../../netlify/lib/whoop';
import type { BlobStore } from '../../netlify/lib/sync';
import type { FnEvent } from '../../netlify/lib/types';
// netlify/ is CommonJS (that's how Netlify deploys it), so its exports arrive on the default import.
const { createAiProxy, buildMessagesBody } = aiLib as typeof import('../../netlify/lib/ai');
const { createSyncHandler, syncKey } = syncLib as typeof import('../../netlify/lib/sync');
const { createWhoopAuth, createWhoopCallback, createWhoopRefresh, createWhoopData, readCookie, parseSince } = whoopLib as typeof import('../../netlify/lib/whoop');

const ev = (o: Partial<FnEvent>): FnEvent => ({ httpMethod: 'GET', headers: {}, queryStringParameters: null, body: null, ...o });
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status });
function fakeFetch(route: (url: string, init?: RequestInit) => Response | 'throw') {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetch = async (url: string, init?: RequestInit) => { calls.push({ url, init }); const r = route(url, init); if (r === 'throw') throw new Error('socket hang up'); return r; };
  return { fetch, calls };
}
function fakeStore(fail?: string) {
  const data = new Map<string, string>(); let opened = 0;
  const store: BlobStore = {
    async get(k) { if (fail) throw new Error(fail); return data.has(k) ? data.get(k)! : null; },
    async set(k, v) { if (fail) throw new Error(fail); data.set(k, v); },
    async delete(k) { if (fail) throw new Error(fail); data.delete(k); },
  };
  return { data, getStore: () => { opened++; return store; }, opened: () => opened };
}

describe('functions: AI proxy', () => {
  const env = { ANTHROPIC_API_KEY: 'sk-ant-SECRET' };
  const post = (body: unknown) => ev({ httpMethod: 'POST', body: JSON.stringify(body) });
  it('forwards only allow-listed fields, caps max_tokens at 4096 and defaults the model', () => {
    const b = buildMessagesBody({ max_tokens: 99999, messages: [{ role: 'user', content: 'hi' }], tools: ['x'], api_key: 'nope', system: 's' });
    assert.deepEqual(Object.keys(b), ['model', 'max_tokens', 'messages', 'system']);
    assert.equal(b.max_tokens, 4096);
    assert.equal(b.model, 'claude-sonnet-4-6');
  });
  it('sends the key to Anthropic only, never back to the browser (even on an error)', async () => {
    const f = fakeFetch(() => new Response('{"type":"error","error":{"type":"overloaded_error"}}', { status: 529 }));
    const r = await createAiProxy({ fetch: f.fetch, env })(post({ messages: [{ role: 'user', content: 'x' }] }));
    assert.equal((f.calls[0].init!.headers as any)['x-api-key'], 'sk-ant-SECRET');
    assert.equal(r.statusCode, 529);
    assert.ok(!JSON.stringify(r).includes('SECRET'));
  });
  it('refuses bad requests clearly and reports upstream failures as 502', async () => {
    const h = createAiProxy({ fetch: fakeFetch(() => 'throw').fetch, env });
    assert.equal((await h(ev({}))).statusCode, 405);
    assert.equal((await h(ev({ httpMethod: 'POST', body: '{nope' }))).statusCode, 400);
    assert.equal((await h(post({ model: 'm' }))).statusCode, 400);
    assert.equal((await h(post({ messages: [{ role: 'user', content: 'x' }] }))).statusCode, 502);
    const noKey = await createAiProxy({ fetch: fakeFetch(() => json({})).fetch, env: {} })(post({ messages: [1] }));
    assert.deepEqual([noKey.statusCode, /ANTHROPIC_API_KEY/.test(noKey.body)], [500, true]);
  });
});

describe('functions: cloud sync', () => {
  const env = { NETLIFY_SITE_ID: 's', NETLIFY_API_TOKEN: 't' };
  const withCode = (o: Partial<FnEvent>) => ev({ ...o, headers: { 'x-sync-code': 'testsandbox99' } });
  it('rejects codes shorter than 8 characters without touching storage', async () => {
    const s = fakeStore();
    const r = await createSyncHandler({ getStore: s.getStore, env })(ev({ headers: { 'x-sync-code': 'short' } }));
    assert.deepEqual([r.statusCode, s.opened()], [400, 0]);
  });
  it('derives a stable storage key that never contains the code itself', () => {
    assert.equal(syncKey('testsandbox99'), syncKey('testsandbox99'));
    assert.notEqual(syncKey('testsandbox99'), syncKey('testsandbox98'));
    assert.match(syncKey('testsandbox99'), /^dp_[0-9a-f]{40}$/);
    assert.ok(!syncKey('testsandbox99').includes('testsandbox99'));
  });
  it('round-trips a snapshot exactly, returns null when empty, and DELETE erases only that code', async () => {
    const s = fakeStore(); s.data.set('someone_else', 'keep'); const h = createSyncHandler({ getStore: s.getStore, env });
    assert.equal((await h(withCode({}))).body, 'null');
    const snap = '{"logs":[{"id":"a"}],"bpLog":[]}';
    assert.equal((await h(withCode({ httpMethod: 'POST', body: snap }))).statusCode, 200);
    assert.equal((await h(withCode({}))).body, snap);
    await h(withCode({ httpMethod: 'DELETE' }));
    assert.equal((await h(withCode({}))).body, 'null');
    assert.equal(s.data.get('someone_else'), 'keep');
  });
  it('reports storage failures and refuses other methods', async () => {
    assert.deepEqual(JSON.parse((await createSyncHandler({ getStore: fakeStore('down').getStore, env })(withCode({}))).body), { error: 'down' });
    assert.equal((await createSyncHandler({ getStore: fakeStore().getStore, env })(withCode({ httpMethod: 'PUT' }))).statusCode, 405);
  });
});

describe('functions: WHOOP login', () => {
  const env = { WHOOP_CLIENT_ID: 'cid', WHOOP_CLIENT_SECRET: 'sec', WHOOP_REDIRECT_URI: 'https://x.test/cb' };
  it('redirects to WHOOP with a fresh random state that matches a short-lived, httpOnly cookie', async () => {
    const h = createWhoopAuth({ env });
    const [a, b] = [await h(ev({})), await h(ev({}))];
    const url = new URL(a.headers!.Location);
    assert.equal(url.origin + url.pathname, 'https://api.prod.whoop.com/oauth/oauth2/auth');
    assert.equal(url.searchParams.get('client_id'), 'cid');
    assert.match(url.searchParams.get('scope')!, /offline/);
    const state = url.searchParams.get('state')!;
    assert.match(state, /^[0-9a-f]{48}$/);
    assert.ok(a.headers!['Set-Cookie'].startsWith(`whoop_state=${state};`) && /HttpOnly; Secure; SameSite=Lax; Max-Age=600/.test(a.headers!['Set-Cookie']));
    assert.notEqual(new URL(b.headers!.Location).searchParams.get('state'), state);
  });
  it('rejects a callback whose state does not match the cookie, without contacting WHOOP (CSRF)', async () => {
    const f = fakeFetch(() => json({ access_token: 'AT' }));
    const r = await createWhoopCallback({ fetch: f.fetch, env, log: () => {} })(ev({ queryStringParameters: { code: 'c', state: 'evil' }, headers: { cookie: 'whoop_state=good' } }));
    assert.equal(r.headers!.Location, '/#debug_error=state_mismatch');
    assert.equal(f.calls.length, 0);
  });
  it('hands tokens to the app in the URL fragment, clears the cookie, and never logs a token', async () => {
    const logs: unknown[] = [];
    const f = fakeFetch(() => json({ access_token: 'AT/+', refresh_token: 'RT', expires_in: 3599 }));
    const r = await createWhoopCallback({ fetch: f.fetch, env, log: (...a) => logs.push(a) })(ev({ queryStringParameters: { code: 'c', state: 'good' }, headers: { cookie: 'whoop_state=good' } }));
    assert.equal(r.headers!.Location, '/#whoop_access_token=AT%2F%2B&whoop_refresh_token=RT&whoop_expires_in=3599');
    assert.match(r.headers!['Set-Cookie'], /Max-Age=0/);
    assert.ok(!JSON.stringify(logs).includes('AT') && !JSON.stringify(logs).includes('RT'));
  });
  it('reports only the error code when WHOOP refuses the exchange', async () => {
    const f = fakeFetch(() => json({ error: 'invalid_grant', error_description: 'detail that could echo credentials' }, 400));
    const r = await createWhoopCallback({ fetch: f.fetch, env, log: () => {} })(ev({ queryStringParameters: { code: 'c' } }));
    assert.equal(r.headers!.Location, '/#debug_fail=invalid_grant');
  });
  it('reads cookies among others', () => {
    assert.equal(readCookie('a=1; whoop_state=x%3Dy; b=2', 'whoop_state'), 'x=y');
    assert.equal(readCookie(undefined, 'whoop_state'), null);
  });
  it('refresh: needs a refresh token, then passes WHOOP\u2019s reply through', async () => {
    const f = fakeFetch(() => json({ access_token: 'new' }));
    const h = createWhoopRefresh({ fetch: f.fetch, env });
    assert.equal((await h(ev({ httpMethod: 'POST', body: '{}' }))).statusCode, 400);
    assert.deepEqual(JSON.parse((await h(ev({ httpMethod: 'POST', body: '{"refresh_token":"RT"}' }))).body), { access_token: 'new' });
    assert.match(String(f.calls[0].init!.body), /grant_type=refresh_token&refresh_token=RT/);
  });
});

describe('functions: WHOOP data and back-fill', () => {
  const now = Date.UTC(2026, 9, 13, 12);
  const page = (n: number, next: string | null) => json({ records: Array.from({ length: n }, (_, i) => ({ i })), next_token: next });
  const get = (h: any, since?: string) => h(ev({ headers: { authorization: 'Bearer T' }, queryStringParameters: since ? { since } : null }));
  it('reads ?since as a start date, ignores bad values, and never goes back more than 60 days', () => {
    assert.equal(parseSince({ since: '2026-10-01' }, now), '2026-10-01T00:00:00.000Z');
    assert.equal(parseSince({ since: '01/10/2026' }, now), null);
    assert.equal(parseSince(null, now), null);
    assert.equal(parseSince({ since: '2025-01-01' }, now), new Date(now - 60 * 86400000).toISOString());
  });
  it('with a since date, follows WHOOP\u2019s paging up to 4 pages and flags that more history exists', async () => {
    const f = fakeFetch(() => page(25, 'more'));
    const body = JSON.parse((await get(createWhoopData({ fetch: f.fetch }), '2026-09-01')).body);
    assert.equal(body.cycles.records.length, 100);
    assert.deepEqual(body.partial, ['cycles', 'sleep', 'recovery', 'workouts']);
    assert.equal(f.calls.filter(c => c.url.includes('/cycle?')).length, 4);
  });
  it('without a since date (older app builds), fetches one page per feed', async () => {
    const f = fakeFetch(() => page(3, 'more'));
    const body = JSON.parse((await get(createWhoopData({ fetch: f.fetch }))).body);
    assert.deepEqual([f.calls.length, body.cycles.records.length, body.partial], [4, 3, undefined]);
  });
  it('an expired login on any feed returns 401 so the app refreshes the token', async () => {
    const f = fakeFetch(u => u.includes('/recovery') ? json({}, 401) : page(1, null));
    assert.equal((await get(createWhoopData({ fetch: f.fetch }))).statusCode, 401);
    assert.equal((await createWhoopData({ fetch: f.fetch })(ev({}))).statusCode, 401);   // no token at all
  });
  it('one feed failing is reported while the others are still returned', async () => {
    const f = fakeFetch(u => u.includes('/activity/sleep') ? json({}, 503) : page(2, null));
    const r = await get(createWhoopData({ fetch: f.fetch }));
    const body = JSON.parse(r.body);
    assert.deepEqual([r.statusCode, body.sleep, body.errors, body.recovery.records.length], [200, null, { sleep: 'HTTP 503' }, 2]);
  });
  it('a later page failing keeps the records already fetched', async () => {
    const f = fakeFetch(u => u.includes('nextToken') ? json({}, 500) : page(25, 'p1'));
    const body = JSON.parse((await get(createWhoopData({ fetch: f.fetch }), '2026-10-01')).body);
    assert.deepEqual([body.cycles.records.length, body.partial.includes('cycles')], [25, true]);
  });
});
