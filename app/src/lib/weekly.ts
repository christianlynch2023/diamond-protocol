// Weekly review (pure, tested). Turns the week's checks into the strength picture, recovery against your
// normal range, logging consistency, and up to two concrete actions taken from your own rules.
// Suggestions only: nothing here changes targets, the programme or what the engine prescribes.

export type Verdict = 'good' | 'ok' | 'miss';
export interface ReviewItem { k: string; v: string; note: string; verdict: Verdict; }
export interface TrendEntry { name: string; trend?: string; }
export interface StallsLike { stalled?: TrendEntry[]; progressing?: TrendEntry[]; holding?: TrendEntry[]; }

/** How many tracked lifts are gaining, holding or declining. */
export function strengthMix(stalls: StallsLike | null | undefined): { gaining: number; holding: number; declining: string[]; total: number } {
  const all = [...(stalls?.stalled ?? []), ...(stalls?.progressing ?? []), ...(stalls?.holding ?? [])];
  const declining = all.filter(e => e.trend === 'declining').map(e => e.name);
  const gaining = all.filter(e => e.trend === 'gaining').length;
  return { gaining, holding: all.length - gaining - declining.length, declining, total: all.length };
}

/** Average of the week's readings, and where it sits against your normal range. */
export function weekVsNormal(last7: readonly (number | null)[], band: { lo: number; hi: number } | null): { avg: number | null; n: number; where: 'below' | 'within' | 'above' | null } {
  const xs = last7.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (!xs.length) return { avg: null, n: 0, where: null };
  const avg = xs.reduce((a, b) => a + b, 0) / xs.length;
  return { avg, n: xs.length, where: band ? (avg < band.lo ? 'below' : avg > band.hi ? 'above' : 'within') : null };
}

const ymd = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** Days with food logged and days with a weigh-in, over the last seven days including today. */
export function loggingWeek(nutrition: readonly { date?: string; deletedAt?: number | null }[], weighIns: readonly { date?: string; deletedAt?: number | null }[], todayStr: string): { foodDays: number; weighDays: number } {
  const base = new Date(todayStr + 'T12:00:00');
  const days = new Set<string>();
  for (let i = 0; i < 7; i++) { const d = new Date(base); d.setDate(d.getDate() - i); days.add(ymd(d)); }
  const count = (list: readonly { date?: string; deletedAt?: number | null }[]) => new Set(list.filter(e => e && !e.deletedAt && typeof e.date === 'string' && days.has(e.date.slice(0, 10))).map(e => (e.date as string).slice(0, 10))).size;
  return { foodDays: count(nutrition), weighDays: count(weighIns) };
}

export interface FocusContext {
  phase?: string | null;
  sessionsShort?: number;
  underMuscles?: { name: string; have: number; min: number }[];
  calDelta?: number | null;
  pDelta?: number | null;
  weightPct?: number | null;
  declining?: string[];
  bp?: { sys: number; dia: number } | null;
}
export interface Action { area: string; text: string; sev: 'miss' | 'ok'; }

const ORDER = ['Blood pressure', 'Sessions', 'Protein', 'Weight', 'Stalled lifts', 'Volume', 'Calories'];

/** Up to two actions for the week: misses first, then near-misses, in order of what matters most. */
export function weeklyFocus(items: readonly ReviewItem[], c: FocusContext): Action[] {
  const byK = new Map(items.map(i => [i.k, i]));
  const textFor = (k: string): string | null => {
    switch (k) {
      case 'Blood pressure': return c.bp ? `Blood pressure averaged ${c.bp.sys}/${c.bp.dia}. Take repeat morning readings this week; if it stays at or above 140/90, book a GP check.` : null;
      case 'Sessions': return c.sessionsShort ? `${c.sessionsShort} session${c.sessionsShort > 1 ? 's' : ''} missed. Put next week's four in the diary first.` : null;
      case 'Protein': return typeof c.pDelta === 'number' && c.pDelta < 0 ? `Protein ran ${Math.abs(Math.round(c.pDelta))} g a day under target. Add one 40 g serving a day; on a cut it's the muscle-retention lever.` : null;
      case 'Weight': {
        const p = c.weightPct;
        if (typeof p !== 'number') return null;
        if (c.phase === 'cut') {
          if (p < -1.0) return `Losing ${Math.abs(p).toFixed(2)}% a week, faster than 1%. Your rule: add about 150 kcal of carbs.`;
          if (p > -0.3) return `Loss is under 0.3% a week. Your rule: if that holds another week, cut 150 kcal of rest-day carbs or add 2,000 steps a day.`;
          return null;
        }
        if (c.phase === 'bulk') return p > 0.5 ? `Gaining ${p.toFixed(2)}% a week, faster than planned. Trim about 150 kcal a day.` : p < 0.1 ? `Gain is under 0.1% a week. Add about 150 kcal a day.` : null;
        return Math.abs(p) >= 0.2 ? `Weight is moving ${p > 0 ? 'up' : 'down'} ${Math.abs(p).toFixed(2)}% a week on maintenance. Adjust about 150 kcal a day the other way.` : null;
      }
      case 'Stalled lifts': return c.declining && c.declining.length ? `${c.declining.slice(0, 2).join(' and ')} ${c.declining.length > 1 ? 'are' : 'is'} declining. Hold the load rather than pushing; check sleep and protein first.` : null;
      case 'Volume': {
        const u = (c.underMuscles ?? []).slice(0, 2);
        return u.length ? `Under the weekly set floor: ${u.map(m => `${m.name} ${Math.round(m.have * 10) / 10} of ${m.min}`).join(', ')}. Make sure those sets get done before adding anything.` : null;
      }
      case 'Calories': return typeof c.calDelta === 'number' && c.calDelta > 0 ? `Averaging ${Math.round(c.calDelta)} kcal a day over target. Close that gap before changing the target itself.` : typeof c.calDelta === 'number' && c.calDelta < 0 ? `Averaging ${Math.abs(Math.round(c.calDelta))} kcal a day under target. Fine for a few days on a cut, but watch training quality.` : null;
      default: return null;
    }
  };
  const out: Action[] = [];
  for (const sev of ['miss', 'ok'] as const) {
    for (const k of ORDER) {
      if (out.length >= 2) return out;
      const it = byK.get(k);
      if (!it || it.verdict !== sev) continue;
      const text = textFor(k);
      if (text) out.push({ area: k, text, sev });
    }
  }
  return out;
}
