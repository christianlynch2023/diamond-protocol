// Round 2 Fuel tab: logging food into the one-record-per-day store, and the weekly intake view.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { logToDay, weekView, kcalOf, dayRecord } from '../src/lib/fuel';
import type { NutLike } from '../src/lib/fuel';

let k = 0;
const makeId = () => 'new' + (++k);
const NOW = 1_800_000_000_000;

describe('fuel: logging food', () => {
  it('adds to an existing day, keeping its id so sync updates it rather than duplicating it', () => {
    const prev: NutLike[] = [{ id: 'a1', date: '2026-10-15', protein: 50, carbs: 40, fat: 10, calories: kcalOf({ p: 50, c: 40, f: 10 }), updatedAt: 1 }];
    const next = logToDay(prev, '2026-10-15', { p: 30, c: 20, f: 5 }, 'add', NOW, makeId);
    const r = dayRecord(next, '2026-10-15');
    assert.equal(r?.id, 'a1');
    assert.deepEqual([r?.protein, r?.carbs, r?.fat], [80, 60, 15]);
    assert.equal(r?.calories, kcalOf({ p: 80, c: 60, f: 15 }));
    assert.equal(r?.updatedAt, NOW);
    assert.equal(next.length, 1);
  });
  it('starts a new day with a fresh id', () => {
    const next = logToDay([], '2026-10-15', { p: 40, c: 0, f: 10 }, 'add', NOW, makeId);
    assert.equal(next.length, 1);
    assert.match(String(next[0]?.id), /^new/);
    assert.equal(next[0]?.calories, 250);
  });
  it('can correct the day instead of adding to it', () => {
    const prev: NutLike[] = [{ id: 'a1', date: '2026-10-15', protein: 50, carbs: 40, fat: 10, calories: 450 }];
    const r = dayRecord(logToDay(prev, '2026-10-15', { p: 200, c: 115, f: 60 }, 'set', NOW, makeId), '2026-10-15');
    assert.deepEqual([r?.protein, r?.carbs, r?.fat, r?.calories], [200, 115, 60, kcalOf({ p: 200, c: 115, f: 60 })]);
  });
  it('tombstones same-day duplicates so an old copy cannot come back after a merge', () => {
    const prev: NutLike[] = [{ id: 'a', date: '2026-10-15', protein: 10 }, { id: 'b', date: '2026-10-15', protein: 20 }];
    const next = logToDay(prev, '2026-10-15', { p: 5, c: 0, f: 0 }, 'add', NOW, makeId);
    assert.equal(next.filter(e => !e.deletedAt).length, 1);
    assert.equal(next.find(e => e.id === 'b')?.deletedAt, NOW);
  });
  it('keeps calories recorded separately and only adds the new food', () => {
    const prev: NutLike[] = [{ id: 'a', date: '2026-10-15', calories: 1200 }];
    assert.equal(dayRecord(logToDay(prev, '2026-10-15', { p: 25, c: 0, f: 0 }, 'add', NOW, makeId), '2026-10-15')?.calories, 1300);
  });
  it('ignores an empty or negative entry and keeps newest-first order', () => {
    const prev: NutLike[] = [{ id: 'x', date: '2026-10-10', protein: 1 }];
    assert.deepEqual(logToDay(prev, '2026-10-15', { p: 0, c: 0, f: 0 }, 'add', NOW, makeId), prev);
    assert.deepEqual(logToDay(prev, '2026-10-15', { p: -5, c: 0, f: 0 }, 'add', NOW, makeId), prev);
    const next = logToDay(prev, '2026-10-15', { p: 10, c: 0, f: 0 }, 'add', NOW, makeId);
    assert.deepEqual(next.map(e => e.date), ['2026-10-15', '2026-10-10']);
  });
});

describe('fuel: the week', () => {
  const target = (date: string) => ({ cals: date.endsWith('13') ? 2100 : 1800, protein: 200 });
  const list: NutLike[] = [
    { date: '2026-10-15', protein: 60, carbs: 20, fat: 10, calories: 410 },   // today, partial
    { date: '2026-10-14', protein: 205, carbs: 115, fat: 60, calories: 1820 }, // on target
    { date: '2026-10-13', protein: 150, carbs: 300, fat: 90, calories: 2610 }, // over a 2100 target
    { date: '2026-10-11', protein: 200, carbs: 50, fat: 40, calories: 1360 },  // under
  ];
  const w = weekView(list, '2026-10-15', target);
  it('shows seven days, oldest first, ending today', () => {
    assert.equal(w.rows.length, 7);
    assert.equal(w.rows[0]?.date, '2026-10-09');
    assert.equal(w.rows[6]?.date, '2026-10-15');
    assert.equal(w.rows[6]?.isToday, true);
  });
  it('marks each finished day on, over or under its own target, and leaves gaps empty', () => {
    const s = Object.fromEntries(w.rows.map(r => [r.date, r.status]));
    assert.deepEqual([s['2026-10-14'], s['2026-10-13'], s['2026-10-11'], s['2026-10-12'], s['2026-10-15']], ['on', 'over', 'under', 'none', 'today']);
  });
  it('never counts today in the averages', () => {
    assert.equal(w.fullDays, 3);
    assert.equal(w.avgKcal, Math.round((1820 + 2610 + 1360) / 3));
    assert.equal(w.avgTarget, Math.round((1800 + 2100 + 1800) / 3));
  });
  it('counts days protein reached target (within 5%)', () => {
    assert.equal(w.proteinHit, 2);
  });
  it('scales bars from zero to the largest intake or target', () => {
    assert.equal(w.scaleMax, 2610);
  });
});
