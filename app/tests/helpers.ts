// Small builders for test data. Dates are UTC noon so results don't depend on the machine's timezone.
import type { SessionLog, SetEntry } from '../src/types';

export const day = (n: number) => new Date(Date.UTC(2026, 8, 1 + n, 12)).toISOString();   // 1 Sep 2026 + n days
export const ymd = (n: number) => day(n).slice(0, 10);

export function log(o: { id?: string; d: number; week?: number; block?: number; deload?: boolean;
  ex?: { id: string; sets: [number, number][] }[] }): SessionLog {
  return {
    id: o.id ?? 'L' + o.d, date: day(o.d), sessionId: 'upperA', week: o.week ?? 2, block: o.block ?? 1,
    deload: o.deload ?? false,
    exercises: (o.ex ?? []).map(e => ({ id: e.id, name: e.id, sets: e.sets.map(([weight, reps]): SetEntry => ({ weight, reps, rir: 2 })) })),
  };
}
