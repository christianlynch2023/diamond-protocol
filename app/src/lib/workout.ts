// Round 2, Phase 5: the pure parts of the session screens, so they can be tested.
// Display only: nothing here decides a target or changes what gets saved. Targets come from the
// progression engine (getTarget) and every write still goes through the app's own logSet.

export interface SetLike { weight: number; reps: number; rir?: number | string | null; intensifier?: unknown; }
export interface SetRow {
  n: number;
  last: SetLike | null;      // same set number, last session of this exercise
  today: SetLike | null;     // logged this session
  state: 'done' | 'editing' | 'current' | 'todo';
  beat: boolean;             // today beat last time on this set (more reps at the same or heavier load, or more load for the same reps)
}

/** One row per planned set (or more, if extra sets were logged), pairing last time with today. */
export function setRows(effSets: number, logged: readonly SetLike[], last: readonly SetLike[] | null | undefined, editIdx: number | null): SetRow[] {
  const prev = last || [];
  const count = Math.max(effSets, logged.length);
  const rows: SetRow[] = [];
  for (let i = 0; i < count; i++) {
    const t = logged[i] ?? null;
    const l = prev[i] ?? null;
    let state: SetRow['state'] = 'todo';
    if (t) state = editIdx === i ? 'editing' : 'done';
    else if (i === logged.length && editIdx === null) state = 'current';
    const beat = !!(t && l && ((t.reps > l.reps && t.weight >= l.weight) || (t.weight > l.weight && t.reps >= l.reps)));
    rows.push({ n: i + 1, last: l, today: t, state, beat });
  }
  return rows;
}

/** Share of the rest period still to go (1 at the start, 0 when done), from the timer ring's values. */
export function restLeft(dashOff: number, circ: number): number {
  if (!(circ > 0) || !Number.isFinite(dashOff)) return 0;
  return Math.max(0, Math.min(1, 1 - dashOff / circ));
}

/** Exercises flagged for joint or tendon discomfort this session, worst first. */
export function painFlags(painData: Readonly<Record<string, number>> | null | undefined, nameOf: (id: string) => string): { name: string; level: 1 | 2 }[] {
  const out: { name: string; level: 1 | 2 }[] = [];
  for (const [id, v] of Object.entries(painData || {})) if (v === 1 || v === 2) out.push({ name: nameOf(id), level: v });
  return out.sort((a, b) => b.level - a.level || a.name.localeCompare(b.name));
}
