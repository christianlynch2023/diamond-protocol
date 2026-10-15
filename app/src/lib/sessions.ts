// Split out of App.jsx in Phase 2. Behaviour unchanged.
import { DLW, EX_DEF_BY_ID, EX_MUSCLE, MUSCLES, ORM_IDS, SESSIONS, effWR, rirDefaultFor } from '../data/programme';
import { fmtShort } from './format';
import { totalLoad } from './training';
import { TREND_MIN_SESSIONS, TREND_WINDOW, classifyTrend, e1rmEffort, needsAttention, rirNum, trendChange } from './strength';
import type { BwResolver, SessionLog, WhoopDay } from '../types';

// ---- Strength-retention index (the cut KPI) ----
// For each `orm` compound: compare best e1RM in the trailing 21 days vs the 21 days before
// that. Average the %Δ across lifts with data in BOTH windows. Read alongside the weight
// trend: weight down + e1RM held/up = fat loss; both down = losing muscle, deficit too steep.
// Actual LOGGED sets per muscle per training week. The heat map shows what the programme
// PLANS; this shows what was really done — swaps, skipped sets and abandoned sessions all
// change the answer, and only the logged version can tell you whether volume actually landed.
// A logged session counts as "performed" only if it carries real work: at least a few sets
// with reps actually recorded. Tapping finish with nothing entered still creates a log with a
// valid date and sessionId (its empty exercises are filtered out), and that must not count
// toward adherence or week-completeness. reps>0 is the work marker rather than weight, so
// bodyweight sets still count; a genuine or even deliberately abbreviated session clears the
// bar of 3 easily, while an accidental empty finish scores 0.
export function sessionRealSets(log: SessionLog | null | undefined): number {
  if (!log || !Array.isArray(log.exercises)) return 0;
  let n = 0;
  for (const e of log.exercises) {
    if (!e || !Array.isArray(e.sets)) continue;
    for (const s of e.sets) if ((s.reps||0) > 0) n++;
  }
  return n;
}

export function sessionPerformed(log: SessionLog | null | undefined): boolean { return sessionRealSets(log) >= 3; }

export function computeActualVolume(logs: SessionLog[] | null | undefined, block?: number | null) {
  const rows = (logs||[]).filter(s => s && s.week && (block==null || s.block===block) && Array.isArray(s.exercises));
  if (!rows.length) return null;
  const byWeek: Record<number, Record<string, number>> = {}, deloadWeeks = new Set<number>(), sessionsByWeek: Record<number, Set<string>> = {};
  for (const s of rows) {
    const w = s.week;
    // A deload week is half volume by design — including it in the average would read as
    // under-training. Track it, show it, but leave it out of the per-week average.
    if (s.deload === true || (s.deload == null && DLW.has(w))) deloadWeeks.add(w);
    if (sessionPerformed(s)) (sessionsByWeek[w] = sessionsByWeek[w] || new Set()).add(s.sessionId);
    if (!byWeek[w]) byWeek[w] = {};
    for (const e of s.exercises) {
      if (!e || !Array.isArray(e.sets) || !e.sets.length) continue;
      // A swapped exercise logs under its own id; fall back to the id it replaced.
      const m = EX_MUSCLE[e.id] || EX_MUSCLE[e.origId as string];
      if (!m) continue;
      const n = e.sets.filter(st => st && (st.reps||0) > 0).length;
      if (!n) continue;
      byWeek[w][m.p] = (byWeek[w][m.p]||0) + n;
      if (m.s) (Array.isArray(m.s)?m.s:[m.s]).forEach(sm => { byWeek[w][sm] = (byWeek[w][sm]||0) + n*0.5; });
    }
  }
  const weeks = Object.keys(byWeek).map(Number).sort((a,b)=>a-b);
  if (!weeks.length) return null;
  const latest = weeks[weeks.length-1];
  // Include a week in the average when it is COMPLETE, judged by distinct sessions logged
  // (>= the 4/week target), not by its position in the array. The old `weeks.slice(0, -1)`
  // always dropped the newest week, so a single fully-completed week reported 0 completed weeks
  // and the whole card stayed hidden. The latest week is still excluded while it's in progress.
  const SESSIONS_PER_WEEK = 4;
  const weekComplete = (w: number) => (sessionsByWeek[w] ? sessionsByWeek[w].size : 0) >= SESSIONS_PER_WEEK;
  const done = weeks.filter(w => !deloadWeeks.has(w) && (w !== latest || weekComplete(latest)));
  const avg: Record<string, number> = {};
  if (done.length) {
    for (const mus of Object.keys(MUSCLES)) {
      let t=0; for (const w of done) t += (byWeek[w][mus]||0);
      avg[mus] = +(t/done.length).toFixed(1);
    }
  }
  return { byWeek, weeks, latest, avg, completedWeeks: done.length, deloadWeeks: [...deloadWeeks] };
}


// Per-exercise plateau detection. For each exercise, take the best e1RM per session across
// the last N non-deload sessions; if the most recent sessions haven't beaten the best of the
// earlier ones, the lift is stalled. Deload sessions are excluded (85% load isn't a stall)
// and a lift needs >=3 sessions before any verdict — two points is noise, not a trend.
// Session duration analytics. Duration is wall-clock from start to finish, so a session that
// was paused and resumed hours later logs an inflated time. Anything over OUTLIER_MIN is
// excluded from averages (but still plotted, flagged) so one abandoned session can't skew
// the picture. Averages are per session TYPE, since Upper 3 is legitimately shorter than Lower.
export function computeDurations(logs: SessionLog[] | null | undefined, limit = 20) {
  const OUTLIER_MIN = 150;
  const rows = (logs||[]).filter((s): s is SessionLog & { duration: number } => s && typeof s.duration === 'number' && s.duration > 0);
  if (!rows.length) return null;
  const recent = rows.slice(0, limit).reverse();   // logs are newest-first; chart oldest->newest
  const series = recent.map(s => ({
    x: fmtShort(s.date),
    y: s.duration,
    name: s.sessionName || (SESSIONS[s.sessionId] && SESSIONS[s.sessionId].name) || '?',
    outlier: s.duration > OUTLIER_MIN
  }));
  const byType: Record<string, { name: string; durs: number[]; excluded: number; planned: string | null }> = {};
  for (const s of rows) {
    const key = s.sessionId || 'unknown';
    const name = s.sessionName || (SESSIONS[key] && SESSIONS[key].name) || 'Unknown';
    const rec = (byType[key] = byType[key] || { name, durs: [], excluded: 0, planned: (SESSIONS[key] && SESSIONS[key].time) || null });
    if (s.duration > OUTLIER_MIN) { rec.excluded++; continue; }
    rec.durs.push(s.duration);
  }
  const types: { key: string; name: string; avg: number; med: number; n: number; min: number; max: number; excluded: number; planned: string | null }[] = [];
  for (const key in byType) {
    const r = byType[key];
    if (!r.durs.length) continue;
    const sorted = [...r.durs].sort((a,b)=>a-b);
    const avg = Math.round(r.durs.reduce((a,b)=>a+b,0) / r.durs.length);
    const med = sorted.length % 2 ? sorted[(sorted.length-1)/2] : Math.round((sorted[sorted.length/2-1]+sorted[sorted.length/2])/2);
    types.push({ key, name: r.name, avg, med, n: r.durs.length,
                 min: sorted[0], max: sorted[sorted.length-1], excluded: r.excluded, planned: r.planned });
  }
  types.sort((a,b) => b.avg - a.avg);
  const clean = rows.filter(s => s.duration <= OUTLIER_MIN);
  const overall = clean.length ? Math.round(clean.reduce((a,b)=>a+b.duration,0)/clean.length) : null;
  const outliers = rows.length - clean.length;
  return { series, types, overall, n: clean.length, outliers };
}


// Effort-adjusted e1RM for one logged set (analytics accuracy). Reps in reserve count as reps you could
// have done; a set with no RIR logged uses the programmed target for that week and exercise.
const setE1rm = (pid: string, s: { weight: number; reps?: number | null; rir?: unknown }, l: SessionLog, bwAt?: BwResolver | null): number => {
  const planned = (): number | null => {
    const n = effWR(l.week, false).rirN;
    if (n == null) return null;
    const v = rirDefaultFor(EX_DEF_BY_ID[pid], n);
    return typeof v === 'number' && Number.isFinite(v) ? v : n;
  };
  return e1rmEffort(totalLoad(pid, s.weight, bwAt, l.date), s.reps || 0, s.rir, rirNum(s.rir) === null ? planned() : null);
};

// Per-lift trend (analytics accuracy). For each exercise, the best effort-adjusted e1RM per session
// across recent non-deload sessions, then a robust trend over the latest six: gaining, holding or
// declining, with a +/-2% noise band and at least four sessions before any verdict. A lift is
// "stalled" (needs attention) when declining, or when holding outside a cut: on a cut, holding
// strength while losing weight is the goal. Holding lifts on a cut are returned in `holding`.
export function computeStalls(logs: SessionLog[] | null | undefined, minSessions = 3, bwAt: BwResolver | null = null, phase: string | null = null) {
  const byEx: Record<string, { name: string; pts: { t: number; e1rm: number }[] }> = {};
  for (const l of (logs||[])) {
    if (l.deload === true) continue;
    if (l.deload == null && DLW.has(l.week)) continue;
    const t = new Date(l.date).getTime();
    if (isNaN(t)) continue;
    for (const ex of (l.exercises||[])) {
      if (!ex || !Array.isArray(ex.sets) || !ex.sets.length) continue;
      const pid = ex.origId || ex.id;
      const best = Math.max(...ex.sets.map(s => setE1rm(pid, s, l, bwAt)));
      if (!best || !isFinite(best)) continue;
      (byEx[pid] = byEx[pid] || { name: ex.name, pts: [] }).pts.push({ t, e1rm: best });
    }
  }
  const stalled = [], progressing = [], holding = [];
  for (const pid in byEx) {
    const rec = byEx[pid];
    if (!rec) continue;
    rec.pts.sort((a,b) => b.t - a.t);
    if (rec.pts.length < Math.max(minSessions, TREND_MIN_SESSIONS)) continue;
    const tr = trendChange(rec.pts.map(p => ({ t: p.t, v: p.e1rm })));
    if (!tr) continue;
    const trend = classifyTrend(tr.changePct);
    const pts = rec.pts.slice(0, TREND_WINDOW);
    const recent = pts.slice(0, 2).map(p => p.e1rm);
    const earlier = pts.slice(2).map(p => p.e1rm);
    const all = rec.pts.map(p => p.e1rm);
    const peak = Math.max(...all);
    let sincePeak = 0;
    for (const x of all) { if (x >= peak - 0.001) break; sincePeak++; }
    const bestRecent = Math.max(...recent);
    const entry = { id: pid, name: rec.name, sessions: tr.n, spanDays: tr.spanDays, trend,
                    bestRecent: Math.round(bestRecent), bestEarlier: Math.round(earlier.length ? Math.max(...earlier) : bestRecent),
                    pct: tr.changePct,
                    sessionsSincePeak: sincePeak, peakE1rm: Math.round(peak), lastE1rm: Math.round(all[0] ?? 0),
                    isOrm: ORM_IDS.has(pid) };
    if (trend === 'gaining') progressing.push(entry);
    else if (needsAttention(trend, phase)) stalled.push(entry);
    else holding.push(entry);
  }
  stalled.sort((a,b) => a.pct - b.pct);
  progressing.sort((a,b) => b.pct - a.pct);
  holding.sort((a,b) => a.pct - b.pct);
  if (!stalled.length && !progressing.length && !holding.length) return null;
  return { stalled, progressing, holding, total: stalled.length + progressing.length + holding.length, phase };
}


// Pain by exercise. Pain is logged 0/1/2 (none/niggle/sharp) on every exercise of every
// session, but until now only the most recent session's flag was used. For a lifter whose
// goal includes joint longevity, the pattern that matters is WHICH exercises repeatedly
// produce pain — a lift that niggles once is noise, one that niggles most sessions is a
// signal to change the movement, not to push through it.
export function computePainTrend(logs: SessionLog[] | null | undefined, minSessions = 3) {
  const byEx: Record<string, { name: string; pts: { t: number; pain: number }[] }> = {};
  for (const l of (logs||[])) {
    const t = new Date(l.date).getTime();
    if (isNaN(t)) continue;
    for (const ex of (l.exercises||[])) {
      if (!ex) continue;
      const pid = ex.origId || ex.id;
      const rec = (byEx[pid] = byEx[pid] || { name: ex.name, pts: [] });
      rec.pts.push({ t, pain: ex.pain || 0 });
    }
  }
  const flagged: { id: string; name: string; sessions: number; painCount: number; sharpCount: number; rate: number; dir: string; severity: string }[] = [];
  let totalSessions = 0, painSessions = 0;
  for (const pid in byEx) {
    const rec = byEx[pid];
    rec.pts.sort((a,b) => b.t - a.t);
    if (rec.pts.length < minSessions) continue;
    const n = rec.pts.length;
    const anyPain = rec.pts.filter(p => p.pain > 0).length;
    const sharp = rec.pts.filter(p => p.pain === 2).length;
    totalSessions += n; painSessions += anyPain;
    if (!anyPain) continue;
    // Direction: is it getting worse? Compare last 3 sessions against the ones before.
    const recent = rec.pts.slice(0,3), earlier = rec.pts.slice(3);
    const rRate = recent.filter(p=>p.pain>0).length / recent.length;
    const eRate = earlier.length ? earlier.filter(p=>p.pain>0).length / earlier.length : null;
    const dir = eRate==null ? 'flat' : rRate > eRate + 0.15 ? 'worsening' : rRate < eRate - 0.15 ? 'improving' : 'flat';
    flagged.push({ id:pid, name:rec.name, sessions:n, painCount:anyPain, sharpCount:sharp,
                   rate:Math.round(anyPain/n*100), dir,
                   severity: sharp>0 ? 'sharp' : 'niggle' });
  }
  if (!flagged.length && totalSessions===0) return null;
  flagged.sort((a,b) => (b.sharpCount - a.sharpCount) || (b.rate - a.rate));
  return { flagged, overallRate: totalSessions ? Math.round(painSessions/totalSessions*100) : 0 };
}


// Weekly training load (tonnage = sets x reps x weight) with an acute:chronic ratio.
// HONEST FRAMING: ACWR was popularised as an injury-risk predictor and has since taken
// substantial methodological criticism — the predictive claims have not replicated well.
// It is used here purely descriptively: "this week vs your recent norm". It is NOT an
// injury forecast and the card says so.
export function computeTrainingLoad(logs: SessionLog[] | null | undefined, weeks = 8) {
  const dayMs = 86400000, now = Date.now();
  const buckets: { weeksAgo: number; tonnage: number; sessions: number }[] = [];
  for (let w = 0; w < weeks; w++) {
    const hi = now - w*7*dayMs, lo = hi - 7*dayMs;
    let tonnage = 0, sessions = 0;
    for (const l of (logs||[])) {
      const t = new Date(l.date).getTime();
      if (isNaN(t) || t <= lo || t > hi) continue;
      sessions++;
      for (const ex of (l.exercises||[])) for (const s of (ex.sets||[])) tonnage += (s.weight||0) * (s.reps||0);
    }
    buckets.push({ weeksAgo: w, tonnage: Math.round(tonnage), sessions });
  }
  const series = buckets.slice().reverse();
  if (!series.some(b => b.tonnage > 0)) return null;
  const acute = buckets[0].tonnage;
  const prior = buckets.slice(1, 5).filter(b => b.tonnage > 0);
  const chronic = prior.length ? Math.round(prior.reduce((a,b)=>a+b.tonnage,0)/prior.length) : null;
  const ratio = chronic ? +(acute/chronic).toFixed(2) : null;
  let verdict = null;
  if (ratio != null && prior.length >= 2) {
    verdict = ratio > 1.5 ? 'spike' : ratio < 0.7 ? 'drop' : 'steady';
  }
  return { series, acute, chronic, ratio, verdict, weeksOfData: buckets.filter(b=>b.tonnage>0).length };
}


export function computeStrengthRetention(logs: SessionLog[], bwAt?: BwResolver | null) {
  const dayMs=86400000, nowTs=Date.now();
  const recentStart=nowTs-21*dayMs, priorStart=nowTs-42*dayMs;
  const byEx: Record<string, { name: string; recent: number; prior: number }> = {};
  for (const l of logs) {
    const t=new Date(l.date).getTime();
    if (isNaN(t) || t<priorStart || t>nowTs) continue;
    // Skip deload sessions: an 85%-load week would read as strength loss that isn't real.
    // Tagged logs carry l.deload; legacy logs fall back to the scheduled-deload weeks.
    if (l.deload === true) continue;
    if (l.deload == null && DLW.has(l.week)) continue;
    const win = t>=recentStart ? 'recent' : 'prior';
    for (const ex of (l.exercises||[])) {
      if (!ex.sets || !ex.sets.length) continue;
      const pid=ex.origId||ex.id;
      if (!ORM_IDS.has(pid)) continue;
      // Effort-adjusted: the RIR target falls through a block, so plain weight x reps would read
      // later weeks as stronger even at the same strength.
      const best=Math.max(...ex.sets.map(s=>setE1rm(pid, s, l, bwAt)));
      if (!best || !isFinite(best)) continue;
      const rec=(byEx[pid]=byEx[pid]||{name:ex.name,recent:0,prior:0});
      if (best>rec[win]) rec[win]=best;
    }
  }
  const lifts: { name: string; pct: number; recent: number; prior: number }[] = [];
  for (const id in byEx) {
    const r=byEx[id];
    if (r && r.recent>0 && r.prior>0) lifts.push({name:r.name, pct:+(((r.recent-r.prior)/r.prior)*100).toFixed(1), recent:Math.round(r.recent), prior:Math.round(r.prior)});
  }
  if (!lifts.length) return null;
  const avgPct=+(lifts.reduce((a,l)=>a+l.pct,0)/lifts.length).toFixed(1);
  return { avgPct, lifts: lifts.sort((a,b)=>a.pct-b.pct) };
}


// ---- Deload rebound: does a deload actually pay off for THIS athlete? ----
// Compares best e1RM on tracked compounds in the 7 days AFTER a deload week against the 7
// days BEFORE it. Positive = the deload bought you strength. Repeatedly negative/flat means
// deloads are costing you a week — real evidence for the take-vs-train-through decision.
export function computeDeloadRebound(logs: SessionLog[], bwAt?: BwResolver | null) {
  const isDeloadLog = (l: SessionLog) => l.deload === true || (l.deload == null && DLW.has(l.week));
  const deloadWeeks: Record<string, { block: number; week: number }> = {};
  for (const l of logs) { if (isDeloadLog(l)) { const k=(l.block||1)+'-'+l.week; deloadWeeks[k]={block:l.block||1, week:l.week}; } }
  // Best effort-adjusted e1RM per LIFT (keyed by slot id), so the same movement is compared either
  // side of the deload, and a lower RIR the week after can't masquerade as a rebound.
  const bestByEx = (arr: SessionLog[]) => {
    const m: Record<string, number> = {};
    for (const l of arr) for (const ex of (l.exercises||[])) {
      if (!ex.sets || !ex.sets.length) continue;
      const pid=ex.origId||ex.id;
      if (!ORM_IDS.has(pid)) continue;
      const e=Math.max(...ex.sets.map(s=>setE1rm(pid, s, l, bwAt)));
      if (!(pid in m) || e>(m[pid] ?? 0)) m[pid]=e;
    }
    return m;
  };
  const out: { block: number; week: number; pct: number; lifts: number }[] = [];
  for (const k in deloadWeeks) {
    const dw = deloadWeeks[k];
    if (!dw) continue;
    const { block, week } = dw;
    const before = logs.filter(l => (l.block||1)===block && l.week===week-1 && !isDeloadLog(l));
    const after  = logs.filter(l => (l.block||1)===block && l.week===week+1 && !isDeloadLog(l));
    if (!before.length || !after.length) continue;
    const B=bestByEx(before), A=bestByEx(after);
    const deltas: number[] = [];
    for (const pid in A) { const b = B[pid], a = A[pid]; if (b && b>0 && a) deltas.push(((a-b)/b)*100); }
    if (!deltas.length) continue;
    const pct = deltas.reduce((s,d)=>s+d,0)/deltas.length;
    out.push({ block, week, pct:+pct.toFixed(1), lifts:deltas.length });
  }
  if (!out.length) return null;
  const avg=+(out.reduce((s,o)=>s+o.pct,0)/out.length).toFixed(1);
  return { avg, events: out.sort((x,y)=> (y.block-x.block)||(y.week-x.week)) };
}


// ---- RIR drift: are logged reps-in-reserve matching the prescription? ----
// Positive drift = logging further from failure than the EFFECTIVE target for that exercise
// (the higher of the weekly RIR and the exercise's own floor). Negative = training harder
// than programmed, a creeping-overreach signal. P0.3: the comparison is per-exercise and
// floor-aware, so a protected 1-RIR lift on a 0-RIR week is NOT flagged as easy — that is the
// prescription, not sandbagging. A residual positive drift can still be pain, technique or a
// wrong default, so the wording below stays non-accusatory.
export function computeRirDrift(logs: SessionLog[], block: number) {
  const byWeek: Record<number, { sum: number; n: number; target: number }> = {};
  for (const l of logs) {
    if ((l.block||1) !== block) continue;
    const dl = l.deload === true || (l.deload == null && DLW.has(l.week));
    const weekRirN = effWR(l.week, dl).rirN;
    if (weekRirN == null) continue;
    for (const ex of (l.exercises||[])) {
      const target = rirDefaultFor(EX_DEF_BY_ID[ex.id], weekRirN); // per-exercise effective floor
      for (const s of (ex.sets||[])) {
        const r = (s.rir === '4+') ? 4 : (s.rir == null ? null : Number(s.rir));
        if (r == null || !isFinite(r)) continue;
        const w=(byWeek[l.week]=byWeek[l.week]||{sum:0,n:0,target:weekRirN});
        w.sum += (r - target); w.n++;
      }
    }
  }
  const weeks = Object.keys(byWeek).map(Number).sort((a,b)=>a-b);
  if (!weeks.length) return null;
  const rows = weeks.map(w => ({ week:w, drift:+(byWeek[w].sum/byWeek[w].n).toFixed(2), n:byWeek[w].n, target:byWeek[w].target }));
  const recent = rows.slice(-4);
  const avg = +(recent.reduce((s,r)=>s+r.drift,0)/recent.length).toFixed(2);
  return { rows, avg };
}


// ---- BP vs training load ----
// Assigns each BP reading to a training week by date range, then pairs weekly mean systolic
// against weekly volume-load. On an enhanced protocol BP is the health marker most likely to

// ---- WHOOP burn cross-check ----
// Compares WHOOP's measured daily expenditure (COMPLETED cycles only) against the empirical
// maintenance derived from intake vs weight trend. Agreement raises confidence in both; a
// large gap means one of them is wrong and the empirical figure should be trusted.
export function computeBurnCheck(whoopHistory: WhoopDay[] | null | undefined, tdee: number | null | undefined) {
  if (!tdee) return null;
  const finals = (whoopHistory||[]).filter(h => h.dayCalFinal && (h.dayCal as number) > 0).slice(-14);
  if (finals.length < 5) return null;
  const avg = Math.round(finals.reduce((s,h)=>s+(h.dayCal as number),0)/finals.length);
  const gap = avg - tdee;
  return { avg, tdee, gap, days: finals.length, agree: Math.abs(gap) <= 250 };
}
