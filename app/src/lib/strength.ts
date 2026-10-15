// Analytics accuracy (post round 2). Pure strength maths for the Progress analytics.
// Display and analysis only: the progression engine (getProgRec / getTarget) never uses these, so
// nothing here changes what the app tells you to lift.

/** Reps in reserve as a number: '4+' counts as 4, anything unreadable is null. Capped at 0..4,
 *  because estimates from sets stopped further from failure are unreliable. */
export function rirNum(rir: unknown): number | null {
  if (rir === '4+') return 4;
  if (rir === null || rir === undefined || rir === '') return null;
  const n = Number(rir);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(4, n));
}

/** Estimated 1RM that counts effort: 100 kg x 8 with 2 in reserve is treated like 10 reps to failure.
 *  Plain Epley (weight x reps only) rises as a block's RIR target falls, even when strength hasn't
 *  changed, because the same strength produces more reps closer to failure. When a set has no RIR
 *  logged, the programmed target for that week and exercise is used instead. */
export function e1rmEffort(load: number, reps: number, rir: unknown, fallbackRir: number | null = null): number {
  if (!Number.isFinite(load) || load <= 0 || !Number.isFinite(reps) || reps <= 0) return 0;
  const r = rirNum(rir);
  const total = reps + (r !== null ? r : (fallbackRir !== null && Number.isFinite(fallbackRir) ? Math.max(0, Math.min(4, fallbackRir)) : 0));
  return total <= 1 ? load : Math.round(load * (1 + total / 30));
}

/** Convenience for call sites holding a logged set. */
export function e1rmSet(load: number, set: { reps?: number | null; rir?: unknown } | null | undefined, fallbackRir: number | null = 1): number {
  return e1rmEffort(load, set && typeof set.reps === 'number' ? set.reps : 0, set ? set.rir : null, fallbackRir);
}

export interface TrendPoint { t: number; v: number; }
export type Trend = 'gaining' | 'holding' | 'declining';
export const TREND_MIN_SESSIONS = 4;
export const TREND_WINDOW = 6;
export const TREND_BAND_PCT = 2;

/** Change across a lift's recent sessions, as a % of its typical e1RM, from a robust (Theil-Sen)
 *  slope over time. Uses the latest TREND_WINDOW sessions; null with fewer than TREND_MIN_SESSIONS.
 *  One good or bad day can't swing it the way "best of the last two" could. */
export function trendChange(points: readonly TrendPoint[]): { changePct: number; n: number; spanDays: number } | null {
  const pts = points.filter(p => Number.isFinite(p.t) && Number.isFinite(p.v) && p.v > 0).slice().sort((a, b) => a.t - b.t).slice(-TREND_WINDOW);
  if (pts.length < TREND_MIN_SESSIONS) return null;
  const day = 86400000;
  const slopes: number[] = [];
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
    const a = pts[i], b = pts[j];
    if (!a || !b) continue;
    const dt = (b.t - a.t) / day;
    if (dt > 0) slopes.push((b.v - a.v) / dt);
  }
  if (!slopes.length) return null;
  slopes.sort((x, y) => x - y);
  const mid = (xs: number[]): number => { const m = Math.floor(xs.length / 2); return xs.length % 2 ? (xs[m] ?? 0) : ((xs[m - 1] ?? 0) + (xs[m] ?? 0)) / 2; };
  const slope = mid(slopes);
  const first = pts[0], last = pts[pts.length - 1];
  if (!first || !last) return null;
  const spanDays = (last.t - first.t) / day;
  const typical = mid(pts.map(p => p.v).sort((x, y) => x - y));
  if (!(typical > 0)) return null;
  return { changePct: +((slope * spanDays) / typical * 100).toFixed(1), n: pts.length, spanDays: Math.round(spanDays) };
}

/** Gaining or declining only when the change clears a noise band (TREND_BAND_PCT); otherwise holding. */
export function classifyTrend(changePct: number, band: number = TREND_BAND_PCT): Trend {
  return changePct > band ? 'gaining' : changePct < -band ? 'declining' : 'holding';
}

/** Which lifts need attention. On a cut, holding strength while losing weight is the goal, so only
 *  declining lifts are flagged; otherwise holding counts too. */
export function needsAttention(trend: Trend, phase: string | null | undefined): boolean {
  return trend === 'declining' || (trend === 'holding' && phase !== 'cut');
}
