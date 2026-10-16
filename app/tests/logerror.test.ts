// Error reporting: the log-error function keeps a short, scrubbed crash summary and nothing else.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import logLib from '../../netlify/lib/logerror';
const { createLogErrorHandler, MAX_BODY, scrub } = logLib as typeof import('../../netlify/lib/logerror');   // netlify/ is CommonJS: exports arrive on the default import

const run = async (body: unknown, httpMethod = 'POST') => {
  const lines: string[] = [];
  const h = createLogErrorHandler({ log: l => lines.push(l), now: () => Date.UTC(2026, 9, 15) });
  const r = await h({ httpMethod, headers: {}, body: typeof body === 'string' ? body : JSON.stringify(body) });
  return { r, lines, entry: lines[0] ? JSON.parse(lines[0].replace(/^DP-ERROR /, '')) : null };
};

describe('functions: error reporting', () => {
  it('logs one tagged line with only the known fields', async () => {
    const { r, lines, entry } = await run({ message: 'boom', view: 'Workout', build: 'index-abc.js', stack: 'at x', weight: 140, notes: 'private' });
    assert.equal(r.statusCode, 204);
    assert.equal(lines.length, 1);
    assert.ok(lines[0]?.startsWith('DP-ERROR '));
    assert.deepEqual(Object.keys(entry).sort(), ['at', 'build', 'kind', 'message', 'page', 'stack', 'view']);
    assert.equal(entry.view, 'Workout');
  });
  it('cuts query strings and URL fragments, and redacts token-like strings', async () => {
    const { entry } = await run({ message: 'failed /cb#access_token=abc123', page: '/?code=secret', stack: 'token ' + 'a'.repeat(40) });
    assert.equal(entry.message, 'failed /cb#…');
    assert.equal(entry.page, '/?…');
    assert.ok(!entry.stack.includes('aaaa'));
    assert.equal(scrub('see https://x.y/z?k=v ok'), 'see https://x.y/z?… ok');
  });
  it('clips long fields', async () => {
    const { entry } = await run({ message: 'word '.repeat(200), stack: 'at line '.repeat(700) });
    assert.equal(entry.message.length, 300);
    assert.ok(entry.stack.length <= 2000);
  });
  it('refuses anything that is not a small JSON error report', async () => {
    assert.equal((await run({ message: 'x' }, 'GET')).r.statusCode, 405);
    assert.equal((await run('not json')).r.statusCode, 400);
    assert.equal((await run([1, 2])).r.statusCode, 400);
    assert.equal((await run({ view: 'Today' })).r.statusCode, 400);
    const big = await run({ message: 'x'.repeat(MAX_BODY) });
    assert.equal(big.r.statusCode, 413);
    assert.equal(big.lines.length, 0);
  });
});
