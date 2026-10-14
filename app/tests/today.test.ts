// Round 2 Today screen: which session it offers, and the recovery strip's numbers.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { nextSession, isTrainingDay, recoveryTone, metricView, localDateStr } from '../src/lib/today';

const order = ['upperA', 'lowerA', 'upperB', 'lowerB'];
const log = (sessionId: string, week: number, block = 1) => ({ date: '2026-10-10T07:00:00Z', sessionId, week, block });
const performed = () => true;
const base = { order, block: 1, week: 6, sel: null, wipSessionId: null, performed };

describe('today: session choice', () => {
  it('offers the first session not yet done this week', () => {
    const n = nextSession({ ...base, logs: [log('upperA', 6), log('lowerA', 6)] });
    assert.deepEqual(n, { sid: 'upperB', inProg: false, isDerived: true, allDone: false });
  });
  it('ignores sessions from other weeks and blocks', () => {
    const n = nextSession({ ...base, logs: [log('upperA', 5), log('upperA', 6, 2)] });
    assert.equal(n.sid, 'upperA');
  });
  it('puts an unfinished session first, then an explicit choice', () => {
    assert.deepEqual(nextSession({ ...base, logs: [], sel: 'lowerB', wipSessionId: 'upperB' }).sid, 'upperB');
    assert.equal(nextSession({ ...base, logs: [], wipSessionId: 'upperB' }).inProg, true);
    assert.equal(nextSession({ ...base, logs: [], sel: 'lowerB' }).sid, 'lowerB');
  });
  it('reports a finished week and starts the rotation again', () => {
    const n = nextSession({ ...base, logs: order.map(s => log(s, 6)) });
    assert.equal(n.allDone, true);
    assert.equal(n.sid, 'upperA');
  });
  it('never changes the session because of recovery', () => {
    // Readiness informs, it never changes the plan. Even handed a recovery score, the choice is identical.
    const logs = [log('upperA', 6)];
    const at = (recovery: number) => nextSession({ ...base, logs, recovery } as Parameters<typeof nextSession>[0]);
    assert.deepEqual(at(5), at(50));
    assert.deepEqual(at(50), at(98));
  });
});

describe('today: day type and recovery colour', () => {
  it('counts scheduled days and days already trained as training days', () => {
    const thu = new Date('2026-10-15T09:00:00');
    assert.equal(isTrainingDay(thu, ['Thursday'], []), true);
    assert.equal(isTrainingDay(thu, ['Saturday'], []), false);
    assert.equal(isTrainingDay(thu, ['Saturday'], [{ date: thu.toISOString() }]), true);
  });
  it('shows low recovery as amber, never red', () => {
    assert.equal(recoveryTone(84), 'ok');
    assert.equal(recoveryTone(50), 'neutral');
    assert.equal(recoveryTone(12), 'watch');
    assert.equal(recoveryTone(null), null);
    for (let s = 0; s <= 100; s++) assert.notEqual(recoveryTone(s) as string, 'problem');
  });
});

describe('today: recovery strip numbers', () => {
  const today = '2026-10-15';
  const day = (back: number) => { const d = new Date(today + 'T12:00:00'); d.setDate(d.getDate() - back); return localDateStr(d); };
  it('builds a 7-day line, oldest first, with gaps for missing days', () => {
    const hist = [{ date: day(0), hrv: 62 }, { date: day(2), hrv: 55 }, { date: day(6), hrv: 50 }];
    const v = metricView(hist, 'hrv', today);
    assert.deepEqual(v.last7, [50, null, null, null, 55, null, 62]);
    assert.equal(v.today, 62);
  });
  it('prefers the live reading for today over a stored one', () => {
    const v = metricView([{ date: today, hrv: 40 }], 'hrv', today, 61);
    assert.equal(v.today, 61);
  });
  it('needs a week of earlier readings before it draws a normal band, and never uses today', () => {
    const six = [1, 2, 3, 4, 5, 6].map(b => ({ date: day(b), rhr: 50 + b }));
    assert.equal(metricView(six, 'rhr', today).band, null);
    const ten = [...six, ...[7, 8, 9, 10].map(b => ({ date: day(b), rhr: 50 + b })), { date: today, rhr: 99 }];
    const band = metricView(ten, 'rhr', today).band;
    assert.ok(band && band.hi < 99);
  });
  it('copes with history in any order and with bad entries', () => {
    const hist = [{ date: day(1), sleepHrs: 7.5 }, { date: 'nonsense', sleepHrs: 3 }, { date: day(3), sleepHrs: null }, { date: day(2), sleepHrs: 6.9 }];
    const v = metricView(hist, 'sleepHrs', today);
    assert.deepEqual(v.last7.slice(3), [null, 6.9, 7.5, null]);
  });
});
