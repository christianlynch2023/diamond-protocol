// AI coach context and the end-of-block review.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { COACH_RULES, targetsText, trendsText } from '../src/lib/coach';
import { blockReview } from '../src/lib/blockReview';
import type { BRLog } from '../src/lib/blockReview';

describe('coach: what the AI is told', () => {
  it('lists the engine\u2019s own targets, reasons included', () => {
    const t = targetsText([{ name: 'Hack squat', t: { weight: 90, reps: 8, note: 'Reset: drop 10%' } }, { name: 'Curl', t: { first: true, weight: 0 } }, null]);
    assert.equal(t, 'Hack squat: 90 kg x 8 (Reset: drop 10%)\nCurl: first time, establish a working weight');
    assert.equal(targetsText([]), 'none available');
  });
  it('gives trends biggest movers first, optionally for named lifts only', () => {
    const s = { progressing: [{ name: 'Press', trend: 'gaining', pct: 3.1, sessions: 6 }], holding: [{ name: 'Row', trend: 'holding', pct: 0.4, sessions: 5 }], stalled: [{ name: 'Squat', trend: 'declining', pct: -4.2, sessions: 6 }] };
    assert.equal(trendsText(s), 'Squat: declining -4.2% over 6 sessions; Press: gaining +3.1% over 6 sessions; Row: holding +0.4% over 5 sessions');
    assert.equal(trendsText(s, ['Row']), 'Row: holding +0.4% over 5 sessions');
    assert.match(trendsText(null), /not enough sessions/);
  });
  it('states the rules the app follows', () => {
    for (const p of [/never by reps in reserve/, /holding strength while losing weight is success/, /never change the planned session/, /5-10% reset/, /never give different weights or reps/]) assert.match(COACH_RULES, p);
  });
});

const day = (w: number, s: number) => new Date(Date.UTC(2026, 6, 1) + ((w - 1) * 7 + s) * 86400000).toISOString();
const sessionLog = (w: number, s: number, lifts: [string, number, number][], extra: Partial<BRLog> = {}): BRLog => ({
  date: day(w, s), week: w, block: 2, sessionId: 'S' + s,
  exercises: lifts.map(([id, weight, reps]) => ({ id, name: id, sets: [{ weight, reps }] })), ...extra,
});
const base = {
  block: 2, isDeloadWeek: (w: number) => w % 4 === 0, e1rm: (_p: string, s: { weight: number; reps: number }) => s.weight * (1 + s.reps / 30),
  muscleAvg: { chest: 12, calves: 5 }, muscles: { chest: { min: 10 }, calves: { min: 8 }, neck: { min: 6, optional: true } }, weights: [],
};

describe('block review', () => {
  const logs: BRLog[] = [];
  for (let w = 1; w <= 12; w++) for (let s = 0; s < 4; s++) {
    if (w === 7 && s === 3) continue;   // one missed session
    const press = 100 + w * 1, squat = 140 - w * 1.5;
    logs.push(sessionLog(w, s, [['Press', press, 8], ['Squat', squat, 8]], w === 10 && s === 1 ? { exercises: [{ id: 'Curl', name: 'Curl', sets: [{ weight: 20, reps: 10 }], pain: 1 }] } : {}));
  }
  logs.push(sessionLog(11, 1, [['Curl', 20, 10]], { exercises: [{ id: 'Curl', name: 'Curl', sets: [{ weight: 20, reps: 10 }], pain: 2 }], sessionId: 'S1b' }));
  const r = blockReview({ ...base, logs, weights: [{ date: day(1, 0), weight: 92 }, { date: day(12, 3), weight: 88.6 }], phase: 'cut' });
  it('counts sessions against plan and knows the block is complete', () => {
    assert.equal(r?.complete, true);
    assert.equal(r?.sessions.planned, 48);
    assert.equal(r?.sessions.done, 48);   // 47 programmed + 1 extra session id in week 11
  });
  it('compares each lift\u2019s first two training weeks with its last two, skipping deloads', () => {
    const press = r?.lifts.find(l => l.name === 'Press'), squat = r?.lifts.find(l => l.name === 'Squat');
    assert.ok(press && press.pct > 0, `press ${press?.pct}`);
    assert.ok(squat && squat.pct < -2, `squat ${squat?.pct}`);
  });
  it('finds muscles under their floor (ignoring optional ones) and repeated joint flags', () => {
    assert.deepEqual(r?.under, [{ name: 'calves', have: 5, min: 8 }]);
    assert.deepEqual(r?.pain, [{ name: 'Curl', sessions: 2, worst: 2 }]);
  });
  it('reports the bodyweight change across the block', () => {
    assert.equal(r?.bodyweight?.change, -3.4);
    assert.ok((r?.bodyweight?.perWeek ?? 0) < 0);
  });
  it('turns it into at most four suggestions: declines, joints, volume, adherence', () => {
    assert.ok((r?.suggestions.length ?? 0) <= 4);
    assert.match(r?.suggestions[0] ?? '', /Squat .* fell across the block/);
    assert.match(r?.suggestions[1] ?? '', /Curl \(2 sessions, sharp\)/);
    assert.match(r?.suggestions[2] ?? '', /calves 5 of 8/);
  });
  it('never lets a deload week into the start-vs-end comparison', () => {
    // Same strength all block; the deload weeks carry an absurd figure that must be ignored.
    const flat: BRLog[] = [];
    for (let w = 1; w <= 8; w++) flat.push(sessionLog(w, 0, [['Row', w % 4 === 0 ? 300 : 100, 8]]));
    const r2 = blockReview({ ...base, logs: flat });
    assert.equal(r2?.lifts.find(l => l.name === 'Row')?.pct, 0);
  });
  it('needs a joint flag in two sessions before calling it repeated', () => {
    const once: BRLog[] = [];
    for (let w = 1; w <= 5; w++) once.push(sessionLog(w, 0, [['Press', 100, 8]]));
    once.push(sessionLog(5, 1, [['Dip', 0, 10]], { exercises: [{ id: 'Dip', name: 'Dip', sets: [{ weight: 10, reps: 10 }], pain: 2 }], sessionId: 'X' }));
    assert.deepEqual(blockReview({ ...base, logs: once })?.pain, []);
  });
  it('is honest early in a block and says so when everything is fine', () => {
    const early = blockReview({ ...base, logs: logs.filter(l => l.week <= 3), muscleAvg: { chest: 12, calves: 9 } });
    assert.equal(early?.complete, false);
    assert.equal(early?.sessions.planned, 12);
    assert.equal(early?.lifts.length, 0);   // not enough training weeks to compare yet
    assert.equal(blockReview({ ...base, logs: [] }), null);
  });
});
