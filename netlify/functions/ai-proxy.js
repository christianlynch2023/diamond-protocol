// netlify/functions/ai-proxy.js
//
// P0.9 — Keeps the Anthropic API key server-side. The browser never sees it.
// The client POSTs the SAME body it used to send directly to Anthropic
// ({ model, max_tokens, messages }); this function injects the key + version
// header and forwards to the Anthropic Messages API, then returns the response.
//
// SETUP (one-time, in the Netlify dashboard):
//   Site settings → Environment variables → add:  ANTHROPIC_API_KEY = sk-ant-...
//   Then redeploy. Do NOT commit the key anywhere in the repo.
//
// Same style as your existing whoop-data / sync-data functions.

exports.handler = async (event) => {
  // Only POST is meaningful here.
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    // Configuration error, surfaced clearly rather than as an opaque 500.
    return { statusCode: 500, body: JSON.stringify({ error: 'Server is missing ANTHROPIC_API_KEY. Set it in Netlify env vars and redeploy.' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (_) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  // Minimal allow-list: only forward the fields the Messages API expects, so a
  // compromised client can't smuggle arbitrary fields through the proxy.
  const body = {
    model: payload.model || 'claude-sonnet-4-6',
    max_tokens: Math.min(Number(payload.max_tokens) || 1024, 4096),
    messages: Array.isArray(payload.messages) ? payload.messages : [],
  };
  if (payload.system) body.system = payload.system;

  if (!body.messages.length) {
    return { statusCode: 400, body: JSON.stringify({ error: 'No messages provided' }) };
  }

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    const text = await res.text(); // pass through verbatim (success or Anthropic error)
    return {
      statusCode: res.status,
      headers: { 'Content-Type': 'application/json' },
      body: text,
    };
  } catch (e) {
    return { statusCode: 502, body: JSON.stringify({ error: 'Upstream request failed: ' + (e && e.message || String(e)) }) };
  }
};
