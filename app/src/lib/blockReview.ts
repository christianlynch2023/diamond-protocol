// End-of-block review (pure, tested). Sessions against plan, each lift's start and end effort-adjusted
// e1RM, muscles under their weekly floor, lifts with repeated joint flags, bodyweight change, and up to
// four suggestions for the next block. Suggestions only; nothing here changes the programme.

export interface BRSet { weight: number; reps: number; rir?: unknown; }
export interface BREx { id: string; origId?: string; name: string; sets: BRSet[]; pain?: number | null; }
export interface BRLog { date: string; week: number; block?: number; deload?: boolean | null; sessionId?: string; exercises: BREx[]; }
export interface MuscleSpec { min?: number; optional?: boolean; label?: string; name?: string; }
export interface BlockInput {
  logs: readonly BRLog[]; block: number; phase?: string | null;
  isDeloadWeek: (week: number) => boolean;
  e1rm: (pid: string, set: BRSet, log: BRLog) => number;
  muscleAvg: Readonly<Record<string, number>>;
  muscles: Readonly<Record<string, MuscleSpec>>;
  weights: readonly { date?: string; weight?: number; deletedAt?: number | null }[];
  sessionsPerWeek?: number; weeksPerBlock?: number;
}
export interface LiftChange { name: string; start: number; end: number; pct: number; }
export interface BlockReview {
  weeksDone: number; complete: boolean;
  sessions: { done: number; planned: number };
  lifts: LiftChange[];
  under: { name: string; have: number; min: number }[];
  pain: { name: string; sessions: number; worst: number }[];
  bodyweight: { start: number; end: number; change: number; perWeek: number } | null;
  suggestions: string[];
}

export function blockReview(i: BlockInput): BlockReview | null {
  const perWeek = i.sessionsPerWeek ?? 4, weeks = i.weeksPerBlock ?? 12;
  const inBlock = i.logs.filter(l => (l.block || 1) === i.block && Number.isFinite(l.week));
  if (!inBlock.length) return null;
  const weeksDone = Math.max(...inBlock.map(l => l.week));
  const done = new Set(inBlock.map(l => `${l.week}|${l.sessionId ?? l.date.slice(0, 10)}`)).size;
  const lastWeekCount = new Set(inBlock.filter(l => l.week === weeks).map(l => l.sessionId ?? l.date.slice(0, 10))).size;
  const complete = weeksDone >= weeks && lastWeekCount >= perWeek - 1;
  const planned = perWeek * Math.min(weeks, weeksDone);

  // Lifts: best effort-adjusted e1RM in the first two training weeks vs the last two.
  const real = inBlock.filter(l => !(l.deload === true || (l.deload == null && i.isDeloadWeek(l.week))));
  const trainWeeks = [...new Set(real.map(l => l.week))].sort((a, b) => a - b);
  const lifts: LiftChange[] = [];
  if (trainWeeks.length >= 4) {
    const early = new Set(trainWeeks.slice(0, 2)), late = new Set(trainWeeks.slice(-2));
    const best = new Map<string, { name: string; e: number; l: number }>();
    for (const l of real) for (const ex of l.exercises || []) {
      if (!ex || !ex.sets || !ex.sets.length) continue;
      const pid = ex.origId || ex.id;
      const v = Math.max(...ex.sets.map(s => i.e1rm(pid, s, l)));
      if (!(v > 0)) continue;
      const rec = best.get(pid) ?? { name: ex.name, e: 0, l: 0 };
      if (early.has(l.week)) rec.e = Math.max(rec.e, v);
      if (late.has(l.week)) rec.l = Math.max(rec.l, v);
      best.set(pid, rec);
    }
    for (const r of best.values()) if (r.e > 0 && r.l > 0) lifts.push({ name: r.name, start: Math.round(r.e), end: Math.round(r.l), pct: +(((r.l - r.e) / r.e) * 100).toFixed(1) });
    lifts.sort((a, b) => a.pct - b.pct);
  }

  const under = Object.entries(i.muscles)
    .filter(([k, m]) => m && !m.optional && typeof m.min === 'number' && (i.muscleAvg[k] ?? 0) < m.min)
    .map(([k, m]) => ({ name: String(m.label || m.name || k).toLowerCase(), have: Math.round((i.muscleAvg[k] ?? 0) * 10) / 10, min: m.min as number }))
    .sort((a, b) => a.have / a.min - b.have / b.min);

  const painMap = new Map<string, { sessions: number; worst: number }>();
  for (const l of inBlock) for (const ex of l.exercises || []) {
    const p = typeof ex.pain === 'number' ? ex.pain : 0;
    if (p >= 1) { const r = painMap.get(ex.name) ?? { sessions: 0, worst: 0 }; r.sessions++; r.worst = Math.max(r.worst, p); painMap.set(ex.name, r); }
  }
  const pain = [...painMap].filter(([, r]) => r.sessions >= 2).map(([name, r]) => ({ name, ...r })).sort((a, b) => b.worst - a.worst || b.sessions - a.sessions);

  const dates = inBlock.map(l => new Date(l.date).getTime()).filter(Number.isFinite);
  const from = Math.min(...dates) - 3 * 86400000, to = Math.max(...dates) + 86400000;
  const ws = i.weights.filter(w => w && !w.deletedAt && typeof w.weight === 'number' && typeof w.date === 'string')
    .map(w => ({ t: new Date(w.date as string).getTime(), w: w.weight as number })).filter(w => w.t >= from && w.t <= to).sort((a, b) => a.t - b.t);
  let bodyweight: BlockReview['bodyweight'] = null;
  const first = ws[0], last = ws[ws.length - 1];
  if (first && last && ws.length >= 2 && last.t - first.t >= 14 * 86400000) {
    const change = +(last.w - first.w).toFixed(1);
    bodyweight = { start: first.w, end: last.w, change, perWeek: +(change / ((last.t - first.t) / (7 * 86400000))).toFixed(2) };
  }

  const suggestions: string[] = [];
  const declining = lifts.filter(x => x.pct < -2);
  if (declining.length) suggestions.push(`${declining.slice(0, 2).map(x => `${x.name} (${x.pct}%)`).join(' and ')} fell across the block. Consider a close variation next block, keeping the same movement pattern.`);
  if (pain.length) suggestions.push(`${pain.slice(0, 2).map(p => `${p.name} (${p.sessions} sessions${p.worst === 2 ? ', sharp' : ''})`).join(' and ')} flagged joint or tendon discomfort repeatedly. Swap to a joint-friendlier machine or cable version next block.`);
  if (under.length) suggestions.push(`Under the weekly set floor on average: ${under.slice(0, 3).map(u => `${u.name} ${u.have} of ${u.min}`).join(', ')}. Add one or two sets for ${under.length > 1 ? 'these' : 'it'} next block.`);
  if (planned > 0 && done / planned < 0.85) suggestions.push(`${done} of ${planned} sessions done (${Math.round(done / planned * 100)}%). Protect the schedule first; more sessions will do more than any change to the programme.`);
  if (!suggestions.length) suggestions.push(i.phase === 'cut' ? 'Strength held through the cut, volume landed and joints were quiet. Keep the structure for the next block.' : 'Volume landed, nothing declined and joints were quiet. Keep the structure and progress loads.');

  return { weeksDone, complete, sessions: { done, planned }, lifts, under, pain, bodyweight, suggestions: suggestions.slice(0, 4) };
}
