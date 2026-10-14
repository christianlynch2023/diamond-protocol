// Round 2, Phase 4: the numbers behind the Fuel tab, kept pure so they can be tested.
// Nutrition is stored as one record per day (protein, carbs, fat, calories). Logging food adds to that
// day's record, following the same sync rules as the original form: keep the record's id, stamp
// updatedAt, and tombstone any same-day duplicates so a stale copy can't reappear after a merge.

export interface NutLike {
  id?: string; date: string; protein?: number; carbs?: number; fat?: number; calories?: number;
  updatedAt?: number; deletedAt?: number | null; [k: string]: unknown;
}
export interface Grams { p: number; c: number; f: number; }

export const kcalOf = (g: Grams): number => Math.round(g.p * 4 + g.c * 4 + g.f * 9);
const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const live = (e: NutLike): boolean => !e.deletedAt;

/** The live record for a date, if any. */
export function dayRecord(list: readonly NutLike[], date: string): NutLike | null {
  return list.find(e => live(e) && e.date === date) ?? null;
}

/** Add food to a day ('add'), or correct the day's totals ('set'). Returns a new list, newest first. */
export function logToDay(prev: readonly NutLike[], date: string, g: Grams, mode: 'add' | 'set', now: number, makeId: () => string): NutLike[] {
  const grams = { p: Math.max(0, n(g.p)), c: Math.max(0, n(g.c)), f: Math.max(0, n(g.f)) };
  if (mode === 'add' && grams.p + grams.c + grams.f === 0) return [...prev];
  const existing = dayRecord(prev, date);
  let next: NutLike[];
  if (existing) {
    const base = { p: n(existing.protein), c: n(existing.carbs), f: n(existing.fat) };
    const tot = mode === 'add' ? { p: base.p + grams.p, c: base.c + grams.c, f: base.f + grams.f } : grams;
    // Keep any calories recorded separately (older imports); add only the new food's energy to them.
    const calories = mode === 'add' ? (typeof existing.calories === 'number' ? existing.calories : kcalOf(base)) + kcalOf(grams) : kcalOf(tot);
    let first = true;
    next = prev.map(e => {
      if (e.date !== date || !live(e)) return e;
      if (e === existing && first) {
        first = false;
        return { ...e, protein: tot.p, carbs: tot.c, fat: tot.f, calories, id: e.id ?? makeId(), deletedAt: undefined, updatedAt: now };
      }
      return { ...e, deletedAt: now, updatedAt: now };
    });
  } else {
    next = [{ date, protein: grams.p, carbs: grams.c, fat: grams.f, calories: kcalOf(grams), id: makeId(), updatedAt: now }, ...prev];
  }
  next.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return next.slice(0, 400);
}

export interface DayTarget { cals: number; protein: number; }
export interface WeekRow { date: string; dn: string; kcal: number | null; protein: number | null; target: DayTarget | null; isToday: boolean; status: 'on' | 'over' | 'under' | 'today' | 'none'; }
export interface WeekView { rows: WeekRow[]; avgKcal: number | null; avgTarget: number | null; fullDays: number; proteinHit: number; scaleMax: number; }

/** The last seven days ending today, intake against that day's target. Today is shown but never
 *  counted in averages, because today's log is almost never finished when you look. */
export function weekView(list: readonly NutLike[], todayStr: string, targetFor: (date: string) => DayTarget | null): WeekView {
  const base = new Date(todayStr + 'T12:00:00');
  const rows: WeekRow[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(base); d.setDate(d.getDate() - i);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const rec = dayRecord(list, date);
    const kcal = rec ? (typeof rec.calories === 'number' ? rec.calories : kcalOf({ p: n(rec.protein), c: n(rec.carbs), f: n(rec.fat) })) : null;
    const target = targetFor(date);
    const isToday = i === 0;
    let status: WeekRow['status'] = 'none';
    if (isToday) status = 'today';
    else if (kcal !== null && target) { const off = (kcal - target.cals) / target.cals; status = Math.abs(off) <= 0.05 ? 'on' : off > 0 ? 'over' : 'under'; }
    rows.push({ date, dn: d.toLocaleDateString('en-GB', { weekday: 'short' }).slice(0, 2), kcal, protein: rec ? n(rec.protein) : null, target, isToday, status });
  }
  const full = rows.filter(r => !r.isToday && r.kcal !== null);
  const withTarget = full.filter(r => r.target);
  const avg = (xs: number[]): number | null => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  const proteinHit = full.filter(r => r.target && r.protein !== null && r.protein >= r.target.protein * 0.95).length;
  const scaleMax = Math.max(1, ...rows.map(r => r.kcal ?? 0), ...rows.map(r => r.target?.cals ?? 0));
  return {
    rows,
    avgKcal: avg(full.map(r => r.kcal as number)),
    avgTarget: avg(withTarget.map(r => (r.target as DayTarget).cals)),
    fullDays: full.length,
    proteinHit,
    scaleMax,
  };
}
