// Split out of App.jsx in Phase 2. Behaviour unchanged.
import { DLW, EX_MUSCLE, _deloadNow } from '../data/programme';
import type { BodyMetric, BwResolver, ExerciseDef, MuscleMap, ProgRec, SessionLog, SetEntry, SetPlanStep } from '../types';

export const epley = (w: number, r: number): number => r<=1 ? w : Math.round(w*(1+r/30));


// Exercises where the logged number is ADDED load, not total load. A weighted pull-up at
// +20kg is really moving bodyweight + 20kg, so an e1RM built from 20 alone exaggerates
// every percentage change: 20 -> 22.5kg reads +12.5% when the true change is about +2.3%.
// That distortion fed stall detection, strength retention and every relative-performance
// card. bwAt() resolves the nearest logged bodyweight to the session date; when no weight
// history exists the behaviour falls back to added-load-only rather than inventing a figure.
export const BW_LOADED = new Set(['ub1']);

// Collapse multiple same-day weigh-ins to ONE median value per calendar day. Trend/rate maths
// must treat a day as a single observation — three weigh-ins on one morning are not three days
// of data, and left raw they both bias the average and falsely satisfy sample-size gates. Raw
// readings are untouched (display, edit and export still see every entry); only the trend series
// derived here is de-duplicated.
export function dailyMedianWeights(metrics: BodyMetric[] | null | undefined) {
  const byDay: Record<string, number[]> = {};
  for (const m of (metrics||[])) {
    if (!m || !((m.weight as number) > 0)) continue;
    const t = new Date(m.date).getTime(); if (isNaN(t)) continue;
    const day = new Date(m.date).toISOString().slice(0,10);
    (byDay[day] = byDay[day] || []).push(m.weight as number);
  }
  return Object.keys(byDay).map(day => {
    const ws = byDay[day].slice().sort((a,b)=>a-b);
    const mid = Math.floor(ws.length/2);
    return { date: day, weight: ws.length % 2 ? ws[mid] : (ws[mid-1]+ws[mid])/2 };
  });
}

export function makeBwResolver(bodyMetrics: BodyMetric[] | null | undefined): BwResolver | null {
  const pts = (bodyMetrics||[])
    .filter(m => m && (m.weight as number) > 0)
    .map(m => ({ t: new Date(m.date).getTime(), w: m.weight as number }))
    .filter(m => !isNaN(m.t))
    .sort((a,b) => a.t - b.t);
  if (!pts.length) return null;
  return (dateStr) => {
    const t = new Date(dateStr as string).getTime();   // no date -> Invalid Date -> latest weight
    if (isNaN(t)) return pts[pts.length-1].w;
    let best = pts[0], bestGap = Math.abs(t - pts[0].t);
    for (const p of pts) { const g = Math.abs(t - p.t); if (g < bestGap) { best = p; bestGap = g; } }
    return best.w;
  };
}

// Total load moved for a set, accounting for bodyweight-loaded lifts.
export function totalLoad(exId: string, weight: number, bwAt?: BwResolver | null, dateStr?: string): number {
  const w = weight || 0;
  if (!BW_LOADED.has(exId) || !bwAt) return w;
  const bw = bwAt(dateStr);
  return (bw > 0 ? bw : 0) + w;
}


// Theil-Sen slope: the median of every pairwise slope. Ordinary least-squares is yanked by a
// water-high day sitting at the START or END of the window (a window that happens to open on
// a spike tilts the whole fit — the +0.68 kg/wk artefact). Theil-Sen ignores up to ~29% of
// points being outliers on either edge, so the trend reflects the real body of the data.
// Direction-invariant: (wj-wi)/(tj-ti) is the same regardless of point order, so callers may
// pass points in any order; only zero-time-gap pairs are skipped.
export function theilSenSlope(pts: { t: number; w: number }[]): number | null {
  const slopes: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const dt = pts[j].t - pts[i].t;
      if (dt !== 0) slopes.push((pts[j].w - pts[i].w) / dt);
    }
  }
  if (!slopes.length) return null;
  slopes.sort((a, b) => a - b);
  const m = Math.floor(slopes.length / 2);
  return slopes.length % 2 ? slopes[m] : (slopes[m - 1] + slopes[m]) / 2;
}


// Volume-load (tonnage) for a set array: sum of weight x reps, in kg.
// A supporting metric only — e1RM and hitting rep targets at RIR are the primary
// hypertrophy signals. Tonnage can rise on lighter/higher-rep work, so read it as
// "total work done", not "did I get stronger".
export const volLoad = (sets: SetEntry[] | null | undefined): number => (sets || []).reduce((a, s) => a + ((+s.weight || 0) * (+s.reps || 0)), 0);

export const sessionVol = (log: SessionLog | null | undefined): number => (log && log.exercises ? log.exercises.reduce((a, e) => a + volLoad(e.sets), 0) : 0);



export function calcPlates(target: number, bar = 20) {
  const avail = [25,20,15,10,5,2.5,1.25];
  const perSide = (target - bar) / 2;
  if (perSide < 0) return {ok:false, plates:[]};
  let rem = perSide; const plates: { kg: number; count: number }[] = [];
  for (const p of avail) { const n=Math.floor(rem/p+0.001); if(n>0){plates.push({kg:p,count:n});rem-=n*p;} }
  return {ok:rem<0.1, plates};
}


export function calcWarmups(working: number) {
  if (!working || working <= 20) return [];
  const res = [{wt:20,reps:10,pct:"Bar"}];
  const pcts = working<=60?[0.5,0.75]:working<=100?[0.5,0.65,0.8]:[0.4,0.55,0.7,0.85];
  for (const p of pcts) { const w=Math.round(working*p/2.5)*2.5; res.push({wt:w,reps:p>=0.8?1:p>=0.65?2:4,pct:`${Math.round(p*100)}%`}); }
  return res;
}


// Substituted exercises are logged under a generated id (sub_<baseId>_<name>) which is NOT
// in EX_MUSCLE. Without falling back to origId, every set done on a swapped exercise
// contributed ZERO to volume, heat map, autoregulation and plateau detection.
export function exMuscle(ex: { id: string; origId?: string }): MuscleMap | undefined { return EX_MUSCLE[ex.origId || ex.id] || EX_MUSCLE[ex.id]; }

export function weekMuscleVolume(logs: SessionLog[], wk: number, block?: number | null): Record<string, number> {
  const v: Record<string, number> = {};
  for (const l of logs) {
    if (l.week !== wk) continue;
    if (block != null && (l.block||1) !== block) continue;
    for (const ex of (l.exercises || [])) {
      const m = exMuscle(ex); if (!m) continue;
      const sets = ex.sets?.length || 0;
      v[m.p] = (v[m.p] || 0) + sets;
      if (m.s) { const ss=Array.isArray(m.s)?m.s:[m.s]; for(const sm of ss) v[sm]=(v[sm]||0)+sets*0.5; }
    }
  }
  return v;
}

export function weeklyVolumeSeries(logs: SessionLog[], muscle: string, block?: number | null) {
  const byWeek: Record<number, number> = {};
  for (const l of logs) {
    if (block != null && (l.block||1) !== block) continue;
    for (const ex of (l.exercises || [])) {
      const m = exMuscle(ex); if (!m) continue;
      const sets = ex.sets?.length || 0;
      if (muscle === 'all') { byWeek[l.week] = (byWeek[l.week] || 0) + sets; }
      else { let add = 0; if (m.p === muscle) add += sets; if (m.s) { const ss=Array.isArray(m.s)?m.s:[m.s]; if(ss.includes(muscle)) add += sets * 0.5; } if (add) byWeek[l.week] = (byWeek[l.week] || 0) + add; }
    }
  }
  const weeks = Object.keys(byWeek).map(Number).sort((a,b) => a-b);
  return weeks.map(w => ({ x: 'W' + w, y: Math.round(byWeek[w] * 10) / 10 }));
}


// Accepts either the exercise OBJECT (preferred — carries setPlan) or a bare rMax number
// (backward compatible). Two corrections vs the old version:
//  C1: deload sessions are skipped, so the week after a deload does not learn its ~85% loads
//      as the new working weight (mirrors computeStalls / computeActualVolume).
//  C2: top-set/back-off lifts are judged PER SLOT against each slot's own rMax. With a single
//      envelope rMax, a correctly capped top set (e.g. 6-8 under an envelope of 10) could never
//      satisfy "every set hit rMax", so the engine only rewarded breaking the prescription.
export function getProgRec(exId: string, exOrRMax: number | { rMax: number; setPlan?: SetPlanStep[] | null }, logs: SessionLog[], phase: string): ProgRec {
  const isObj = exOrRMax && typeof exOrRMax === 'object';
  const rMax = isObj ? (exOrRMax as { rMax: number }).rMax : (exOrRMax as number);
  const setPlan = isObj ? exOrRMax.setPlan : null;
  // Expand setPlan into a per-set cap array; extra logged sets (e.g. HV +1) inherit the last cap.
  const capsFor = (nSets: number): number[] | null => {
    if (!setPlan || !setPlan.length) return null;
    const caps: number[] = [];
    for (const sp of setPlan) for (let i = 0; i < sp.sets; i++) caps.push(sp.rMax);
    while (caps.length < nSets) caps.push(caps.length ? caps[caps.length - 1] : rMax);
    return caps;
  };
  // Collect the recent eligible (non-deload) sessions rather than only the newest. One bad day
  // used to freeze you on "beat that" until you beat it, even if the session before was a clean
  // sweep at the SAME load. We scan the last N and treat progression as earned if any of them
  // swept every slot AT THE CURRENT LOAD. Matching on the same load matters: if you have
  // deliberately dropped weight (or just moved up), that is a new working load and an older
  // sweep at a different load must not carry over.
  const N = 3;
  const recent: { top: number; hit: boolean[]; all: boolean; some: boolean }[] = [];
  for (const s of logs) {
    if (s.deload === true) continue;                       // C1
    if (s.deload == null && DLW.has(s.week)) continue;     // C1 (flag missing on older logs)
    const ex = s.exercises?.find(e => e.id === exId);
    if (!ex?.sets?.length) continue;
    const top = Math.max(...ex.sets.map(x => x.weight));
    const caps = capsFor(ex.sets.length);
    const hit = caps ? ex.sets.map((x, i) => x.reps >= caps[i]) : ex.sets.map(x => x.reps >= rMax);
    recent.push({ top, hit, all: hit.every(Boolean), some: hit.some(Boolean) });
    if (recent.length >= N) break;
  }
  if (recent.length) {
    const cur = recent[0];
    const earned = recent.find(r => r.all && r.top === cur.top);   // same load; newest counts too
    if (earned) {
      // Cut progresses on PERFORMANCE (all slots capped), never on a readiness reading. It fires
      // rarely on a deficit, which is the intended "take it when the reps are there" behaviour.
      return phase === 'cut'
        ? { type: "inc", msg: "All slots hit their cap — take the load if it's there", wt: earned.top }
        : { type: "inc", msg: "All slots hit their rep cap — increase weight", wt: earned.top };
    }
    if (cur.some) return { type: "beat", msg: "Beat the slots that fell short, keep weight", wt: cur.top };
    return { type: "keep", msg: "Keep weight, beat reps", wt: cur.top };
  }
  return { type: "first", msg: "First time — establish your working weight" };
}


export function getPrevHist(exId: string, logs: SessionLog[], limit = 3, exactOnly = false) {
  const res: { date: string; sets: SetEntry[]; week: number; swapped: string | null }[] = [];
  for (const s of logs) {
    // C1: skip deload sessions. getTarget reads getPrevHist(...,1)[0] as "last working set",
    // so including a deload made the week after a deload prescribe ~85% loads as the new baseline.
    if (s.deload === true) continue;
    if (s.deload == null && DLW.has(s.week)) continue;
    // exactOnly (progression): match ONLY this exact stream. The default (display) also matches a
    // lift swapped FROM this ID (origId) so the "previous sessions" list has no blind spot — but
    // that must NOT feed progression: a 60 kg substitute logged under origId would otherwise
    // become the baseline for the 100 kg base lift and prescribe ~62.5 kg on return (PROG-02).
    const ex = exactOnly
      ? s.exercises?.find(e => e.id === exId)
      : s.exercises?.find(e => e.id === exId || e.origId === exId);
    if (ex?.sets?.length) { res.push({date:s.date, sets:ex.sets, week:s.week, swapped: ex.id!==exId ? ex.name : null}); if(res.length>=limit) break; }
  }
  return res;
}


// Weight jumps per exercise. Your own setting (Settings > Tools and data > Weight jumps and equipment)
// wins; otherwise the jump is guessed from the exercise name, as before.
let INC_OVERRIDES: Record<string, number> = {};
export function setIncrementOverrides(m: Record<string, number> | null | undefined): void {
  const next: Record<string, number> = {};
  for (const [k, v] of Object.entries(m || {})) if (typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 50) next[k] = v;
  INC_OVERRIDES = next;
}
export function getDefaultIncrement(ex: { name?: string }): number {
  const n = (ex.name || '').toLowerCase();
  if (n.includes('pull-up') || n.includes('chin')) return 1.25;
  if (n.includes('db ') || n.includes('dumbbell')) return 2;
  if (/(lateral|fly|crunch|curl|ext|raise|face pull|adductor|pulldown|cross)/.test(n)) return 1;
  return 2.5;
}
export function getIncrement(ex: { name?: string; id?: string }): number {
  const own = ex.id ? INC_OVERRIDES[ex.id] : undefined;
  return typeof own === 'number' ? own : getDefaultIncrement(ex);
}

export function getTarget(ex: ExerciseDef, logs: SessionLog[], week: number, phase: string, histId?: string, dl: boolean = (_deloadNow == null ? DLW.has(week) : _deloadNow)) {
  // histId lets a substituted exercise read its own logged history. Without it, a swap
  // inherited the base exercise's loads (e.g. machine press targeted at RO-T8 weights).
  const _hid = histId || ex.id;
  // Exact-stream match here (not id||origId): getProgRec already matches exact id, so prev must
  // too — otherwise a substitute logged under origId sets topWeight while the base's own session
  // drives the verdict, prescribing e.g. 62.5 kg on returning to a 100 kg lift (PROG-02).
  const prev = getPrevHist(_hid, logs, 1, true)[0];
  if (!prev) return { weight: 0, reps: ex.rMin, note: 'First time — establish a working weight', first: true };
  const topWeight = Math.max(...prev.sets.map(s => s.weight));
  const rec = getProgRec(_hid, ex, logs, phase);
  const incr = getIncrement(ex);
  if (dl) {
    return { weight: Math.round((topWeight * 0.85) / 2.5) * 2.5, reps: Math.round((ex.rMin + ex.rMax) / 2), note: 'Deload — keep several reps in reserve' };
  }
  if (phase === 'cut' && rec.type !== 'inc') {
    return { weight: topWeight, reps: ex.rMax, note: 'Cut — hold load, retain muscle' };
  }
  if (rec.type === 'inc') {
    return { weight: topWeight + incr, reps: ex.rMin, note: 'Up ' + incr + 'kg — you hit top reps last time' };
  }
  if (rec.type === 'beat') {
    return { weight: topWeight, reps: ex.rMax, note: 'Same weight — some sets hit target, beat the weaker ones' };
  }
  return { weight: topWeight, reps: ex.rMax, note: 'Same weight — no sets hit target reps yet, keep building' };
}
