// Round 2 acceptance: every text colour in the live theme reads at 4.5:1 or better on the surfaces it sits on.
// Reads the real theme.css, so changing a colour token to something too faint fails the build.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { contrast, rootTokens } from '../src/lib/contrast';

const path = [resolve(process.cwd(), 'src/theme.css'), resolve(process.cwd(), 'app/src/theme.css')].find(p => existsSync(p));
const tokens = path ? rootTokens(readFileSync(path, 'utf8')) : {};

describe('contrast: theme tokens', () => {
  it('finds the theme and its colour tokens', () => {
    assert.ok(path, 'theme.css found');
    for (const k of ['bg', 'sur', 'crd', 't', 't2', 't3', 'acc', 'ok', 'warn', 'err', 'inf']) assert.ok(tokens[k], `--${k} declared`);
  });
  it('keeps every text colour at 4.5:1 or better on page, card and raised tile', () => {
    const fails: string[] = [];
    for (const fg of ['t', 't2', 't3', 'acc', 'ok', 'warn', 'err', 'inf']) {
      for (const bg of ['bg', 'crd', 'sur']) {
        const r = contrast(tokens[fg] ?? '', tokens[bg] ?? '');
        if (r === null || r < 4.5) fails.push(`--${fg} on --${bg}: ${r === null ? 'unreadable' : r.toFixed(2)}`);
      }
    }
    assert.deepEqual(fails, []);
  });
  it('keeps dark text on lime buttons readable', () => {
    const r = contrast('#0a0c10', tokens['acc'] ?? '');
    assert.ok(r !== null && r >= 4.5, `button text ${r}`);
  });
  it('computes contrast the WCAG way', () => {
    assert.equal(contrast('#000000', '#ffffff')?.toFixed(1), '21.0');
    assert.equal(contrast('#777777', '#ffffff')?.toFixed(2), '4.48');
    assert.equal(contrast('nonsense', '#ffffff'), null);
  });
});
