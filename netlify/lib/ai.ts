// AI proxy: keeps the Anthropic API key server-side. The browser POSTs the Messages API body
// ({ model, max_tokens, messages, system }); this adds the key and forwards it, returning the
// response verbatim. Only allow-listed fields are forwarded.
import type { Env, Fetch, FnEvent, FnResponse, Handler } from './types';

export interface MessagesBody { model: string; max_tokens: number; messages: unknown[]; system?: unknown; }

/** Allow-list the request: a compromised client can't smuggle other fields through the proxy. */
export function buildMessagesBody(payload: any): MessagesBody {
  const body: MessagesBody = {
    model: payload.model || 'claude-sonnet-4-6',
    max_tokens: Math.min(Number(payload.max_tokens) || 1024, 4096),
    messages: Array.isArray(payload.messages) ? payload.messages : [],
  };
  if (payload.system) body.system = payload.system;
  return body;
}

export function createAiProxy(deps: { fetch: Fetch; env: Env }): Handler {
  return async (event: FnEvent): Promise<FnResponse> => {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
    }
    const key = deps.env.ANTHROPIC_API_KEY;
    if (!key) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Server is missing ANTHROPIC_API_KEY. Set it in Netlify env vars and redeploy.' }) };
    }
    let payload: any;
    try {
      payload = JSON.parse(event.body || '{}');
    } catch (_) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
    }
    const body = buildMessagesBody(payload);
    if (!body.messages.length) {
      return { statusCode: 400, body: JSON.stringify({ error: 'No messages provided' }) };
    }
    try {
      const res = await deps.fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify(body),
      });
      const text = await res.text();   // pass through verbatim (success or Anthropic error)
      return { statusCode: res.status, headers: { 'Content-Type': 'application/json' }, body: text };
    } catch (e: any) {
      return { statusCode: 502, body: JSON.stringify({ error: 'Upstream request failed: ' + (e && e.message || String(e)) }) };
    }
  };
}
