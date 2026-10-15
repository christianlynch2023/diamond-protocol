// Error reporting: the app posts a crash summary here and it is written to the Netlify function log
// (Netlify > Logs > Functions > log-error), one line starting "DP-ERROR". Only a short message, stack,
// screen name, build and page path are kept. Query strings and URL fragments are cut (WHOOP tokens
// arrive in a fragment) and long token-like strings are redacted. No user data is accepted.
import type { FnEvent, FnResponse, Handler } from './types';

export const MAX_BODY = 8000;
const clip = (v: unknown, n: number): string => (typeof v === 'string' ? v.slice(0, n) : '');
export function scrub(s: string): string {
  return s.replace(/([?#])[^\s'")\]]*/g, '$1…').replace(/\b[A-Za-z0-9_-]{32,}\b/g, '[redacted]');
}

export function createLogErrorHandler(deps: { log?: (line: string) => void; now?: () => number } = {}): Handler {
  const log = deps.log ?? ((line: string) => { console.error(line); });
  const now = deps.now ?? Date.now;
  return async (event: FnEvent): Promise<FnResponse> => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
    const raw = event.body || '';
    if (raw.length > MAX_BODY) return { statusCode: 413, body: JSON.stringify({ error: 'Too large' }) };
    let data: unknown;
    try { data = JSON.parse(raw); } catch { return { statusCode: 400, body: JSON.stringify({ error: 'Not JSON' }) }; }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return { statusCode: 400, body: JSON.stringify({ error: 'Not an error report' }) };
    const d = data as Record<string, unknown>;
    const entry = {
      at: new Date(now()).toISOString(),
      kind: clip(d.kind, 20),
      view: clip(d.view, 40),
      message: scrub(clip(d.message, 300)),
      stack: scrub(clip(d.stack, 2000)),
      build: clip(d.build, 60),
      page: scrub(clip(d.page, 120)),
    };
    if (!entry.message) return { statusCode: 400, body: JSON.stringify({ error: 'No message' }) };
    log('DP-ERROR ' + JSON.stringify(entry));
    return { statusCode: 204, body: '' };
  };
}
