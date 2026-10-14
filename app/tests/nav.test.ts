// Round 2 navigation: every old screen must still be reachable after the move to five tabs.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TABS, SETTINGS_VIEWS, tabFor, isSettings, showsNav, showsSettingsButton } from '../src/lib/nav';

// The eight tabs the app had before round 2, plus the flows reached from them.
const OLD_TABS = ['today', 'meals', 'home', 'progress', 'history', 'body', 'privacy', 'tools'];

describe('nav: five tabs', () => {
  it('has exactly five tabs, each with a short label', () => {
    assert.equal(TABS.length, 5);
    assert.deepEqual(TABS.map(t => t.label), ['Today', 'Train', 'Progress', 'Body', 'Fuel']);
    for (const t of TABS) assert.ok(t.label.length <= 8, `${t.label} fits a fifth of the bar at 11px`);
  });
  it('keeps every old tab reachable, as a tab or in settings', () => {
    for (const v of OLD_TABS) assert.ok(tabFor(v) !== null || isSettings(v), `${v} has a home`);
  });
  it('puts Program and History together under Train', () => {
    assert.equal(tabFor('home'), 'train');
    assert.equal(tabFor('history'), 'train');
  });
  it('opens each tab on a view that belongs to it', () => {
    for (const t of TABS) assert.equal(tabFor(t.home), t.id);
  });
  it('never lists a view under two tabs', () => {
    const all = TABS.flatMap(t => t.views);
    assert.equal(new Set(all).size, all.length);
  });
});

describe('nav: chrome per screen', () => {
  it('moves Tools and Privacy into settings, with no bottom bar there', () => {
    assert.deepEqual([...SETTINGS_VIEWS], ['tools', 'privacy']);
    for (const v of SETTINGS_VIEWS) { assert.equal(tabFor(v), null); assert.equal(showsNav(v), false); }
  });
  it('keeps the bottom bar off the workout and completion screens, as before', () => {
    assert.equal(showsNav('workout'), false);
    assert.equal(showsNav('complete'), false);
    assert.equal(showsNav('session'), true);
  });
  it('shows the settings button on the tab screens only', () => {
    for (const t of TABS) for (const v of t.views) assert.equal(showsSettingsButton(v), true);
    for (const v of ['session', 'workout', 'complete', 'tools', 'privacy']) assert.equal(showsSettingsButton(v), false);
  });
});
