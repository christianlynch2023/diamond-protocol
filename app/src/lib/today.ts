// Round 2, Phase 3: the decisions behind the Today screen, kept pure so they can be tested.
// Nothing here reads recovery when choosing the session: readiness informs, it never changes the plan.
import { normalRange } from './chartMath';

interface LogLike { date: string; sessionId: string; week: number; block?: number; }
interface DayLike { date: string; recovery?: number | null; hrv?: number | null; rhr?: number | null; sleepHrs?: number | null; }

export interface NextSession { sid: string | null; inProg: boolean; isDerived: boolean; allDone: boolean; }

/** Which session Today offers. Same rule the app has used since round 1: an unfinished session first,
 *  then an explicit choice, then the first session in programme order not yet done this week. */
export function nextSession(a: {
  order: readonly string[]; logs: readonly LogLike[]; block: number; week: number;
  sel: string | null; wipSessionId: string | null; performed: (l: LogLike) => boolean;
}): NextSession {
  const done = new Set(a.logs.filter(l => (l.block || 1) === a.block && l.week === a.week && a.performed(l)).map(l => l.sessionId));
  const derived = a.order.find(id => !done.has(id)) ?? a.order[0] ?? null;
  const allDone = a.order.length > 0 && a.order.every(id => done.has(id));
  if (a.wipSessionId) return { sid: a.wipSessionId, inProg: true, isDerived: false, allDone };
  if (a.sel) return { sid: a.sel, inProg: false, isDerived: false, allDone };
  return { sid: derived, inProg: false, isDerived: true, allDone };
}

/** Local calendar date as YYYY-MM-DD (not UTC, which files late-evening BST under the wrong day). */
export function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** A training day is a scheduled session day, or any day you've already logged a session. */
export function isTrainingDay(now: Date, sessionDays: readonly string[], logs: readonly { date: string }[]): boolean {
  const name = now.toLocaleDateString('en-GB', { weekday: 'long' });
  return sessionDays.includes(name) || logs.some(l => new Date(l.date).toDateString() === now.toDateString());
}

/** Colour role for a recovery score. Low recovery is amber ("watch"), never red: it informs, it doesn't alarm. */
export function recoveryTone(score: number | null | undefined): 'ok' | 'neutral' | 'watch' | null {
  if (typeof score !== 'number' || !Number.isFinite(score)) return null;
  return score >= 67 ? 'ok' : score >= 34 ? 'neutral' : 'watch';
}

export interface MetricView {
  last7: (number | null)[];          // oldest to newest, gaps as null (for sparklines)
  today: number | null;
  band: { lo: number; hi: number } | null;   // your normal: middle half of the 30 days before today
  min: number; max: number;          // scale for a range bar
}
type Key = 'recovery' | 'hrv' | 'rhr' | 'sleepHrs';

/** Sparkline and normal-range data for one WHOOP metric. History can be in any order and have gaps. */
export function metricView(history: readonly DayLike[], key: Key, todayStr: string, todayValue?: number | null): MetricView {
  const byDate = new Map<string, number>();
  for (const h of history) {
    const v = h ? h[key] : null;
    if (h && typeof h.date === 'string' && typeof v === 'number' && Number.isFinite(v)) byDate.set(h.date.slice(0, 10), v);
  }
  const base = new Date(todayStr + 'T12:00:00');
  const dayStr = (back: number): string => { const d = new Date(base); d.setDate(d.getDate() - back); return localDateStr(d); };
  const last7: (number | null)[] = [];
  for (let i = 6; i >= 0; i--) last7.push(byDate.get(dayStr(i)) ?? null);
  const today = typeof todayValue === 'number' && Number.isFinite(todayValue) ? todayValue : (byDate.get(todayStr) ?? null);
  if (today !== null) last7[6] = today;
  const prior: number[] = [];
  for (let i = 1; i <= 30; i++) { const v = byDate.get(dayStr(i)); if (v !== undefined) prior.push(v); }
  const band = normalRange(prior, 7);
  const pool = [...prior, ...(today !== null ? [today] : [])];
  let min = pool.length ? Math.min(...pool) : 0, max = pool.length ? Math.max(...pool) : 1;
  if (band) { min = Math.min(min, band.lo); max = Math.max(max, band.hi); }
  const pad = (max - min) * 0.1 || 1;
  return { last7, today, band, min: min - pad, max: max + pad };
}
