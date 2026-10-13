// WHOOP: OAuth login (auth + callback), token refresh, and the data feed with back-fill.
import { randomBytes } from 'crypto';
import type { Env, Fetch, FnEvent, FnResponse, Handler } from './types';

// ---------------------------------------------------------------- login: start
export const WHOOP_SCOPE = 'read:recovery read:cycles read:sleep read:workout read:body_measurement offline';

/** Redirects to WHOOP's consent page. The random `state` goes in the URL and in a short-lived
 *  httpOnly cookie; the callback checks the two match (CSRF protection). */
export function createWhoopAuth(deps: { env: Env; randomState?: () => string }): Handler {
  const newState = deps.randomState || (() => randomBytes(24).toString('hex'));
  return async (): Promise<FnResponse> => {
    const state = newState();
    const params = new URLSearchParams({
      client_id: deps.env.WHOOP_CLIENT_ID as string,
      redirect_uri: deps.env.WHOOP_REDIRECT_URI as string,
      response_type: 'code',
      scope: WHOOP_SCOPE,
      state,
    });
    return {
      statusCode: 302,
      headers: {
        Location: `https://api.prod.whoop.com/oauth/oauth2/auth?${params}`,
        'Cache-Control': 'no-cache',
        'Set-Cookie': `whoop_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
      },
      body: '',
    };
  };
}

// ---------------------------------------------------------------- login: callback
export function readCookie(header: string | null | undefined, name: string): string | null {
  const raw = header || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

const CLEAR_STATE = 'whoop_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';

/** Exchanges the authorisation code for tokens and hands them to the app in the URL fragment
 *  (never logged, never sent to a server). The state cookie is cleared on every path. */
export function createWhoopCallback(deps: { fetch: Fetch; env: Env; log?: (...a: unknown[]) => void }): Handler {
  const log = deps.log || ((...a: unknown[]) => console.log(...a));
  return async (event: FnEvent): Promise<FnResponse> => {
    const { code, error, error_description, state } = event.queryStringParameters || {};
    if (error) {
      return { statusCode: 302, headers: { Location: `/#debug_error=${encodeURIComponent(error_description || error)}`, 'Set-Cookie': CLEAR_STATE }, body: '' };
    }
    if (!code) {
      return { statusCode: 302, headers: { Location: '/#debug_error=no_code_received', 'Set-Cookie': CLEAR_STATE }, body: '' };
    }
    // CSRF check. Skipped only when no cookie exists, so a login started before the cookie
    // was introduced still completes rather than hard-failing.
    const expected = readCookie(event.headers.cookie || event.headers.Cookie, 'whoop_state');
    if (expected && state !== expected) {
      return { statusCode: 302, headers: { Location: '/#debug_error=state_mismatch', 'Set-Cookie': CLEAR_STATE }, body: '' };
    }
    try {
      const res = await deps.fetch('https://api.prod.whoop.com/oauth/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          client_id: deps.env.WHOOP_CLIENT_ID as string,
          client_secret: deps.env.WHOOP_CLIENT_SECRET as string,
          redirect_uri: deps.env.WHOOP_REDIRECT_URI as string,
        }).toString(),
      });
      const tokens: any = await res.json();
      // Status only: never log the token payload (it would persist live tokens in log storage).
      log('WHOOP token exchange status:', res.status, 'ok:', !!tokens.access_token);
      if (!tokens.access_token) {
        const reason = tokens.error || 'no_access_token';   // error code only, never the body
        return { statusCode: 302, headers: { Location: `/#debug_fail=${encodeURIComponent(reason)}`, 'Set-Cookie': CLEAR_STATE }, body: '' };
      }
      const fragment = `whoop_access_token=${encodeURIComponent(tokens.access_token)}&whoop_refresh_token=${encodeURIComponent(tokens.refresh_token || '')}&whoop_expires_in=${tokens.expires_in || 3600}`;
      return { statusCode: 302, headers: { Location: `/#${fragment}`, 'Cache-Control': 'no-cache', 'Set-Cookie': CLEAR_STATE }, body: '' };
    } catch (err: any) {
      return { statusCode: 302, headers: { Location: `/#debug_error=${encodeURIComponent(err.message)}`, 'Set-Cookie': CLEAR_STATE }, body: '' };
    }
  };
}

// ---------------------------------------------------------------- token refresh
const REFRESH_CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };

/** Swaps a refresh token for new tokens. WHOOP's reply is passed through as-is. */
export function createWhoopRefresh(deps: { fetch: Fetch; env: Env }): Handler {
  return async (event: FnEvent): Promise<FnResponse> => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: REFRESH_CORS, body: '' };
    try {
      const { refresh_token } = JSON.parse(event.body || '{}');
      if (!refresh_token) return { statusCode: 400, headers: REFRESH_CORS, body: JSON.stringify({ error: 'No refresh token' }) };
      const res = await deps.fetch('https://api.prod.whoop.com/oauth/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token,
          client_id: deps.env.WHOOP_CLIENT_ID as string,
          client_secret: deps.env.WHOOP_CLIENT_SECRET as string,
        }).toString(),
      });
      const tokens = await res.json();
      return { statusCode: 200, headers: { ...REFRESH_CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(tokens) };
    } catch (err: any) {
      return { statusCode: 500, headers: REFRESH_CORS, body: JSON.stringify({ error: err.message }) };
    }
  };
}

// ---------------------------------------------------------------- data feed with back-fill
const DATA_CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };
const BASE = 'https://api.prod.whoop.com/developer/v2';
export const MAX_PAGES = 4;
export const MAX_LOOKBACK_DAYS = 60;

/** ?since=YYYY-MM-DD -> ISO start time, clamped to at most 60 days back; anything else -> null. */
export function parseSince(q: Record<string, string | undefined> | null | undefined, now: number = Date.now()): string | null {
  const s = q && q.since;
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(s + 'T00:00:00Z');
  if (isNaN(d as any)) return null;
  const floor = new Date(now - MAX_LOOKBACK_DAYS * 86400000);
  return (d < floor ? floor : d).toISOString();
}

export interface FeedResult { status: number; records: unknown[] | null; error?: string; partial?: boolean; }

/** One WHOOP feed. With a start date, follows next_token paging up to MAX_PAGES (25 records each).
 *  A first-page failure is a real failure; a later-page failure keeps what was fetched (partial). */
export async function fetchFeed(fetchFn: Fetch, path: string, auth: RequestInit, startIso: string | null): Promise<FeedResult> {
  const records: unknown[] = [];
  let next: string | null = null, pages = 0, partial = false;
  const status = 200;
  do {
    const qs = new URLSearchParams({ limit: '25' });
    if (startIso) qs.set('start', startIso);
    if (next) qs.set('nextToken', next);
    let res: Response;
    try { res = await fetchFn(`${BASE}${path}?${qs}`, auth); }
    catch (e: any) { if (pages === 0) return { status: 0, records: null, error: e.message || 'network error' }; partial = true; break; }
    if (!res.ok) {
      if (pages === 0) return { status: res.status, records: null, error: 'HTTP ' + res.status };
      partial = true; break;
    }
    let j: any;
    try { j = await res.json(); } catch (e) { if (pages === 0) return { status: 0, records: null, error: 'parse failed' }; partial = true; break; }
    records.push(...((j && (j.records || j.data)) || []));
    next = (j && j.next_token) || null;
    pages++;
  } while (startIso && next && pages < MAX_PAGES);
  return { status, records, partial: partial || !!(startIso && next) };
}

export function createWhoopData(deps: { fetch: Fetch }): Handler {
  return async (event: FnEvent): Promise<FnResponse> => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: DATA_CORS, body: '' };
    const token = (event.headers.authorization || event.headers.Authorization || '').replace('Bearer ', '');
    if (!token) return { statusCode: 401, headers: DATA_CORS, body: JSON.stringify({ error: 'No token' }) };
    const auth = { headers: { Authorization: `Bearer ${token}` } };
    const startIso = parseSince(event.queryStringParameters);
    try {
      const feeds = await Promise.all([
        fetchFeed(deps.fetch, '/cycle', auth, startIso),
        fetchFeed(deps.fetch, '/activity/sleep', auth, startIso),
        fetchFeed(deps.fetch, '/recovery', auth, startIso),
        fetchFeed(deps.fetch, '/activity/workout', auth, startIso),
      ]);
      const [cyc, slp, rec, wko] = feeds;
      // An expired token on ANY feed means the same thing: tell the client to refresh.
      if (feeds.some(f => f.status === 401)) {
        return { statusCode: 401, headers: DATA_CORS, body: JSON.stringify({ error: 'Token expired' }) };
      }
      // Non-401 failures degrade gracefully but are reported, not hidden.
      const errors: Record<string, string> = {};
      const out = (name: string, f: FeedResult) => { if (f.error) errors[name] = f.error; return f.records ? { records: f.records } : null; };
      const body: Record<string, unknown> = {
        cycles: out('cycles', cyc),
        sleep: out('sleep', slp),
        recovery: out('recovery', rec),
        workouts: out('workouts', wko),
      };
      const partial = ['cycles', 'sleep', 'recovery', 'workouts'].filter((k, i) => feeds[i].partial);
      if (partial.length) body.partial = partial;   // more history existed than one call fetched
      if (Object.keys(errors).length) body.errors = errors;
      return { statusCode: 200, headers: { ...DATA_CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
    } catch (err: any) {
      return { statusCode: 500, headers: DATA_CORS, body: JSON.stringify({ error: err.message }) };
    }
  };
}
