// Blood marker matching and auto-flags (used by the panel form and the comparison table).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bloodNormKey, bloodParseRef, bloodAutoFlag } from '../src/lib/bloods';

describe('bloods: marker names', () => {
  it('matches the same marker across providers and spellings', () => {
    assert.equal(bloodNormKey('Total Testosterone'), bloodNormKey('Testosterone'));
    assert.equal(bloodNormKey('HCT'), bloodNormKey('Haematocrit'));
    assert.equal(bloodNormKey('Estradiol'), bloodNormKey('Oestradiol'));
    assert.equal(bloodNormKey('e-GFR'), bloodNormKey('eGFR'));
  });
});

describe('bloods: reference ranges', () => {
  it('reads ranges written with a hyphen or an en dash', () => {
    assert.deepEqual(bloodParseRef('8.6-29.0'), { lo: 8.6, hi: 29 });
    assert.deepEqual(bloodParseRef('8.6\u201329.0'), { lo: 8.6, hi: 29 });
  });
  it('reads one-sided ranges, ignoring trailing notes', () => {
    assert.deepEqual(bloodParseRef('<5.0'), { lo: null, hi: 5 });
    assert.deepEqual(bloodParseRef('\u226442'), { lo: null, hi: 42 });
    assert.deepEqual(bloodParseRef('>1.55 (Randox)'), { lo: 1.55, hi: null });
  });
  it('returns null when there is no usable range', () => {
    assert.equal(bloodParseRef(''), null);
    assert.equal(bloodParseRef('see note'), null);
  });
});

describe('bloods: automatic flags', () => {
  it('flags values above, below and inside the range', () => {
    assert.equal(bloodAutoFlag('51.2', '38\u201350'), 'high');
    assert.equal(bloodAutoFlag('35', '38\u201350'), 'low');
    assert.equal(bloodAutoFlag('45', '38\u201350'), 'ok');
  });
  it('handles "below detection" values like <0.3', () => {
    assert.equal(bloodAutoFlag('<0.3', '1.8\u20138.6'), 'low');
  });
  it('says ok rather than guessing when the value or range is unreadable', () => {
    assert.equal(bloodAutoFlag('n/a', '1-2'), 'ok');
    assert.equal(bloodAutoFlag('5', ''), 'ok');
  });
});
