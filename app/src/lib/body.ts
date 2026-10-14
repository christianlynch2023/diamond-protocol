// Round 2, Phase 6: the numbers behind the Body summary tiles, kept pure so they can be tested.
interface Dated { date?: string; deletedAt?: number | null; }

const live = (e: Dated | null | undefined): e is Dated => !!e && !e.deletedAt && typeof e.date === 'string' && !Number.isNaN(new Date(e.date).getTime());

/** Newest live entry by date (lists are not always stored newest first), optionally filtered. */
export function newest<T extends Dated>(list: readonly T[] | null | undefined, pred?: (e: T) => boolean): T | null {
  let best: T | null = null, bt = -Infinity;
  for (const e of list || []) {
    if (!live(e) || (pred && !pred(e))) continue;
    const t = new Date(e.date as string).getTime();
    if (t > bt) { bt = t; best = e; }
  }
  return best;
}

/** "today", "yesterday", "5 days ago", "3 weeks ago", "5 months ago". Calendar days, local time. */
export function agoLabel(date: string | null | undefined, now: Date): string {
  if (!date) return '';
  const d = new Date(date.length === 10 ? date + 'T12:00:00' : date);
  if (Number.isNaN(d.getTime())) return '';
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((day(now) - day(d)) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30.4)} months ago`;
}

/** Total of a numeric field and the entry count over the last N calendar days, today included. */
export function lastDays<T extends Dated>(list: readonly T[] | null | undefined, now: Date, days: number, key: keyof T): { sum: number; count: number } {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1)).getTime();
  let sum = 0, count = 0;
  for (const e of list || []) {
    if (!live(e)) continue;
    const d = new Date((e.date as string).length === 10 ? e.date + 'T12:00:00' : (e.date as string)).getTime();
    if (d < start || d > now.getTime() + 86400000) continue;
    const v = e[key];
    if (typeof v === 'number' && Number.isFinite(v)) { sum += v; count++; }
  }
  return { sum, count };
}
