// What the AI coach is told about the engine (pure, tested). The coach must explain the app's numbers,
// not invent its own: it gets the engine's actual targets (resets, the cut hold and your weight jumps
// included), each lift's effort-adjusted trend, and the rules the app follows.

export const COACH_RULES =
  'Rules this app follows, keep to them: progression is decided by reps against the rep range, never by reps in reserve; ' +
  'on a cut, holding strength while losing weight is success and only declining lifts are a concern; ' +
  'recovery and readiness inform but never change the planned session; after two sessions missing the bottom of the range at the same load the app prescribes a 5-10% reset; ' +
  'estimated 1RMs here count reps in reserve. Quote the app\u2019s targets exactly and never give different weights or reps.';

export interface TargetRow { name: string; t: { weight?: number; reps?: number; note?: string; first?: boolean } | null | undefined; }

/** One line per exercise: the engine's prescription and its reason. */
export function targetsText(rows: readonly (TargetRow | null | undefined)[]): string {
  const lines = rows.filter((r): r is TargetRow => !!r && !!r.t).map(r => {
    const t = r.t as NonNullable<TargetRow['t']>;
    if (t.first || !t.weight) return `${r.name}: first time, establish a working weight`;
    return `${r.name}: ${t.weight} kg x ${t.reps ?? '?'}${t.note ? ' (' + t.note + ')' : ''}`;
  });
  return lines.length ? lines.join('\n') : 'none available';
}

export interface TrendEntryLike { name: string; trend?: string; pct?: number; sessions?: number; }
export interface StallsLike { stalled?: TrendEntryLike[]; progressing?: TrendEntryLike[]; holding?: TrendEntryLike[]; }

/** Each tracked lift's trend over its last 4 to 6 sessions, biggest movers first. */
export function trendsText(stalls: StallsLike | null | undefined, onlyNames?: readonly string[]): string {
  const all = [...(stalls?.stalled ?? []), ...(stalls?.progressing ?? []), ...(stalls?.holding ?? [])]
    .filter(e => e && e.trend && (!onlyNames || onlyNames.includes(e.name)));
  if (!all.length) return 'not enough sessions yet (needs 4 per lift)';
  return all.sort((a, b) => Math.abs(b.pct ?? 0) - Math.abs(a.pct ?? 0)).slice(0, 12)
    .map(e => `${e.name}: ${e.trend} ${typeof e.pct === 'number' ? (e.pct > 0 ? '+' : '') + e.pct + '%' : ''}${e.sessions ? ' over ' + e.sessions + ' sessions' : ''}`.trim())
    .join('; ');
}
