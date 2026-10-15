// Error reporting (client): sends at most five distinct reports per session and can never throw.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { makeReporter, MAX_PER_SESSION } from '../src/lib/errorReport';

describe('error reporting: client', () => {
  it('sends the message, stack and screen, and skips repeats of the same error', () => {
    const sent: string[] = [];
    const report = makeReporter(p => sent.push(p), { build: () => 'index-abc.js', page: () => '/' });
    assert.equal(report(new Error('boom'), { view: 'Workout' }), true);
    assert.equal(report(new Error('boom'), { view: 'Workout' }), false);
    assert.equal(report(new Error('boom'), { view: 'Today' }), true);
    const first = JSON.parse(sent[0] ?? '{}');
    assert.equal(first.message, 'boom');
    assert.equal(first.view, 'Workout');
    assert.equal(first.build, 'index-abc.js');
    assert.ok(String(first.stack).length > 0);
  });
  it(`stops after ${MAX_PER_SESSION} reports in a session`, () => {
    const sent: string[] = [];
    const report = makeReporter(p => sent.push(p));
    for (let i = 0; i < 20; i++) report(new Error('e' + i));
    assert.equal(sent.length, MAX_PER_SESSION);
  });
  it('never throws, even if sending fails or the error is odd', () => {
    const report = makeReporter(() => { throw new Error('network down'); });
    assert.doesNotThrow(() => report(new Error('x')));
    const ok = makeReporter(() => {});
    assert.doesNotThrow(() => { ok('plain string'); ok({ weird: true }); ok(undefined); });
  });
});
