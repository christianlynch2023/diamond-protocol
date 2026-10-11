// Split out of App.jsx in Phase 2. Behaviour unchanged.
import { DLW, EX_DEF_BY_ID, EX_MUSCLE, MUSCLES, ORM_IDS, SESSIONS, effWR, rirDefaultFor } from '../data/programme.js';
import { fmtShort } from './format.js';
import { epley, totalLoad } from './training.js';

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
export function sessionRealSets(log) {
  if (!log || !Array.isArray(log.exercises)) return 0;
  let n = 0;
  for (const e of log.exercises) {
    if (!e || !Array.isArray(e.sets)) continue;
    for (const s of e.sets) if ((s.reps||0) > 0) n++;
  }
  return n;
}

export function sessionPerformed(log) { return sessionRealSets(log) >= 3; }

export function computeActualVolume(logs, block) {
  const rows = (logs||[]).filter(s => s && s.week && (block==null || s.block===block) && Array.isArray(s.exercises));
  if (!rows.length) return null;
  const byWeek = {}, deloadWeeks = new Set(), sessionsByWeek = {};
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
      const m = EX_MUSCLE[e.id] || EX_MUSCLE[e.origId];
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
  const weekComplete = w => (sessionsByWeek[w] ? sessionsByWeek[w].size : 0) >= SESSIONS_PER_WEEK;
  const done = weeks.filter(w => !deloadWeeks.has(w) && (w !== latest || weekComplete(latest)));
  const avg = {};
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
export function computeDurations(logs, limit = 20) {
  const OUTLIER_MIN = 150;
  const rows = (logs||[]).filter(s => s && typeof s.duration === 'number' && s.duration > 0);
  if (!rows.length) return null;
  const recent = rows.slice(0, limit).reverse();   // logs are newest-first; chart oldest->newest
  const series = recent.map(s => ({
    x: fmtShort(s.date),
    y: s.duration,
    name: s.sessionName || (SESSIONS[s.sessionId] && SESSIONS[s.sessionId].name) || '?',
    outlier: s.duration > OUTLIER_MIN
  }));
  const byType = {};
  for (const s of rows) {
    const key = s.sessionId || 'unknown';
    const name = s.sessionName || (SESSIONS[key] && SESSIONS[key].name) || 'Unknown';
    const rec = (byType[key] = byType[key] || { name, durs: [], excluded: 0, planned: (SESSIONS[key] && SESSIONS[key].time) || null });
    if (s.duration > OUTLIER_MIN) { rec.excluded++; continue; }
    rec.durs.push(s.duration);
  }
  const types = [];
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


export function computeStalls(logs, minSessions = 3, bwAt = null) {
  const byEx = {};
  for (const l of (logs||[])) {
    if (l.deload === true) continue;
    if (l.deload == null && DLW.has(l.week)) continue;
    const t = new Date(l.date).getTime();
    if (isNaN(t)) continue;
    for (const ex of (l.exercises||[])) {
      if (!ex || !Array.isArray(ex.sets) || !ex.sets.length) continue;
      const pid = ex.origId || ex.id;
      const best = Math.max(...ex.sets.map(s => epley(totalLoad(pid, s.weight, bwAt, l.date), s.reps||0)));
      if (!best || !isFinite(best)) continue;
      (byEx[pid] = byEx[pid] || { name: ex.name, pts: [] }).pts.push({ t, e1rm: best });
    }
  }
  const stalled = [], progressing = [];
  for (const pid in byEx) {
    const rec = byEx[pid];
    // logs are newest-first; sort explicitly so order is not assumed
    rec.pts.sort((a,b) => b.t - a.t);
    const pts = rec.pts.slice(0, 6);
    if (pts.length < minSessions) continue;
    const recent = pts.slice(0, 2).map(p => p.e1rm);       // last 2 sessions
    const earlier = pts.slice(2).map(p => p.e1rm);          // the 3rd back and older
    if (!earlier.length) continue;
    const bestRecent = Math.max(...recent), bestEarlier = Math.max(...earlier);
    const pct = bestEarlier > 0 ? ((bestRecent - bestEarlier) / bestEarlier) * 100 : 0;
    // Sessions elapsed since the all-time peak e1RM for this lift (newest-first walk).
    const all = rec.pts.map(p => p.e1rm);
    const peak = Math.max(...all);
    let sincePeak = 0;
    for (const x of all) { if (x >= peak - 0.001) break; sincePeak++; }
    const entry = { id: pid, name: rec.name, sessions: pts.length,
                    bestRecent: Math.round(bestRecent), bestEarlier: Math.round(bestEarlier),
                    pct: +pct.toFixed(1),
                    sessionsSincePeak: sincePeak, peakE1rm: Math.round(peak), lastE1rm: Math.round(all[0]),
                    isOrm: ORM_IDS.has(pid) };
    // A stall is no meaningful improvement (<1%) over the older sessions.
    if (pct < 1) stalled.push(entry); else progressing.push(entry);
  }
  stalled.sort((a,b) => a.pct - b.pct);
  progressing.sort((a,b) => b.pct - a.pct);
  if (!stalled.length && !progressing.length) return null;
  return { stalled, progressing, total: stalled.length + progressing.length };
}


// Pain by exercise. Pain is logged 0/1/2 (none/niggle/sharp) on every exercise of every
// session, but until now only the most recent session's flag was used. For a lifter whose
// goal includes joint longevity, the pattern that matters is WHICH exercises repeatedly
// produce pain — a lift that niggles once is noise, one that niggles most sessions is a
// signal to change the movement, not to push through it.
export function computePainTrend(logs, minSessions = 3) {
  const byEx = {};
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
  const flagged = [];
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
export function computeTrainingLoad(logs, weeks = 8) {
  const dayMs = 86400000, now = Date.now();
  const buckets = [];
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


export function computeStrengthRetention(logs, bwAt) {
  const dayMs=86400000, nowTs=Date.now();
  const recentStart=nowTs-21*dayMs, priorStart=nowTs-42*dayMs;
  const byEx={};
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
      const best=Math.max(...ex.sets.map(s=>epley(totalLoad(pid, s.weight, bwAt, l.date),s.reps||0)));
      if (!best || !isFinite(best)) continue;
      const rec=(byEx[pid]=byEx[pid]||{name:ex.name,recent:0,prior:0});
      if (best>rec[win]) rec[win]=best;
    }
  }
  const lifts=[];
  for (const id in byEx) {
    const r=byEx[id];
    if (r.recent>0 && r.prior>0) lifts.push({name:r.name, pct:+(((r.recent-r.prior)/r.prior)*100).toFixed(1), recent:Math.round(r.recent), prior:Math.round(r.prior)});
  }
  if (!lifts.length) return null;
  const avgPct=+(lifts.reduce((a,l)=>a+l.pct,0)/lifts.length).toFixed(1);
  return { avgPct, lifts: lifts.sort((a,b)=>a.pct-b.pct) };
}


// ---- Deload rebound: does a deload actually pay off for THIS athlete? ----
// Compares best e1RM on tracked compounds in the 7 days AFTER a deload week against the 7
// days BEFORE it. Positive = the deload bought you strength. Repeatedly negative/flat means
// deloads are costing you a week — real evidence for the take-vs-train-through decision.
export function computeDeloadRebound(logs, bwAt) {
  const isDeloadLog = l => l.deload === true || (l.deload == null && DLW.has(l.week));
  const deloadWeeks = {};
  for (const l of logs) { if (isDeloadLog(l)) { const k=(l.block||1)+'-'+l.week; deloadWeeks[k]={block:l.block||1, week:l.week}; } }
  // Best e1RM per LIFT (keyed by slot id), not one global maximum. Comparing a global max
  // before against a global max after could pair a pre-deload RDL with a post-deload leg press
  // and call the difference "rebound". Pairing by lift measures the same movement either side.
  const bestByEx = (arr) => {
    const m = {};
    for (const l of arr) for (const ex of (l.exercises||[])) {
      if (!ex.sets || !ex.sets.length) continue;
      const pid=ex.origId||ex.id;
      if (!ORM_IDS.has(pid)) continue;
      const e=Math.max(...ex.sets.map(s=>epley(totalLoad(pid, s.weight, bwAt, l.date),s.reps||0)));
      if (!(pid in m) || e>m[pid]) m[pid]=e;
    }
    return m;
  };
  const out = [];
  for (const k in deloadWeeks) {
    const { block, week } = deloadWeeks[k];
    const before = logs.filter(l => (l.block||1)===block && l.week===week-1 && !isDeloadLog(l));
    const after  = logs.filter(l => (l.block||1)===block && l.week===week+1 && !isDeloadLog(l));
    if (!before.length || !after.length) continue;
    const B=bestByEx(before), A=bestByEx(after);
    // One paired % delta per lift present on BOTH sides, then average those — so a lift missing
    // from either week is simply skipped rather than distorting the comparison.
    const deltas=[];
    for (const pid in A) { if (B[pid]>0) deltas.push(((A[pid]-B[pid])/B[pid])*100); }
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
export function computeRirDrift(logs, block) {
  const byWeek = {};
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
export function computeBurnCheck(whoopHistory, tdee) {
  if (!tdee) return null;
  const finals = (whoopHistory||[]).filter(h => h.dayCalFinal && h.dayCal > 0).slice(-14);
  if (finals.length < 5) return null;
  const avg = Math.round(finals.reduce((s,h)=>s+h.dayCal,0)/finals.length);
  const gap = avg - tdee;
  return { avg, tdee, gap, days: finals.length, agree: Math.abs(gap) <= 250 };
}
