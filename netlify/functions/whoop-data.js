const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };
const BASE = 'https://api.prod.whoop.com/developer/v2';

// Back-fill: the client sends ?since=YYYY-MM-DD (its last stored day minus a small overlap).
// Each feed is fetched from that date with WHOOP's nextToken paging, so days the app was not
// opened are recovered instead of falling outside a fixed one-page window.
// Capped at MAX_PAGES x 25 records per feed to stay well inside the function timeout.
// With no ?since (older app builds), behaviour matches the previous version: one page of 25.
const MAX_PAGES = 4;
const MAX_LOOKBACK_DAYS = 60;

function parseSince(q) {
  const s = q && q.since;
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(s + 'T00:00:00Z');
  if (isNaN(d)) return null;
  const floor = new Date(Date.now() - MAX_LOOKBACK_DAYS * 86400000);
  return (d < floor ? floor : d).toISOString();
}

async function fetchFeed(path, auth, startIso) {
  const records = [];
  let next = null, pages = 0, status = 200, partial = false;
  do {
    const qs = new URLSearchParams({ limit: '25' });
    if (startIso) qs.set('start', startIso);
    if (next) qs.set('nextToken', next);
    let res;
    try { res = await fetch(`${BASE}${path}?${qs}`, auth); }
    catch (e) { if (pages === 0) return { status: 0, records: null, error: e.message || 'network error' }; partial = true; break; }
    if (!res.ok) {
      // A failure on the first page is a real failure; on a later page we keep what we have.
      if (pages === 0) return { status: res.status, records: null, error: 'HTTP ' + res.status };
      partial = true; break;
    }
    let j;
    try { j = await res.json(); } catch (e) { if (pages === 0) return { status: 0, records: null, error: 'parse failed' }; partial = true; break; }
    records.push(...((j && (j.records || j.data)) || []));
    next = (j && j.next_token) || null;
    pages++;
  } while (startIso && next && pages < MAX_PAGES);
  return { status, records, partial: partial || !!(startIso && next) };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  const token = (event.headers.authorization || event.headers.Authorization || '').replace('Bearer ', '');
  if (!token) return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'No token' }) };

  const auth = { headers: { Authorization: `Bearer ${token}` } };
  const startIso = parseSince(event.queryStringParameters);

  try {
    const [cyc, slp, rec, wko] = await Promise.all([
      fetchFeed('/cycle', auth, startIso),
      fetchFeed('/activity/sleep', auth, startIso),
      fetchFeed('/recovery', auth, startIso),
      fetchFeed('/activity/workout', auth, startIso),
    ]);

    // An expired token on ANY feed means the same thing: tell the client to refresh.
    if ([cyc, slp, rec, wko].some(f => f.status === 401)) {
      return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Token expired' }) };
    }

    // Non-401 failures degrade gracefully but are reported, not hidden.
    const errors = {};
    const out = (name, f) => { if (f.error) errors[name] = f.error; return f.records ? { records: f.records } : null; };
    const body = {
      cycles: out('cycles', cyc),
      sleep: out('sleep', slp),
      recovery: out('recovery', rec),
      workouts: out('workouts', wko),
    };
    const partial = ['cycles', 'sleep', 'recovery', 'workouts'].filter((k, i) => [cyc, slp, rec, wko][i].partial);
    if (partial.length) body.partial = partial;   // more history existed than one call fetched
    if (Object.keys(errors).length) body.errors = errors;

    return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
  } catch (err) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
