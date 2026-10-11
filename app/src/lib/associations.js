// Split out of App.jsx in Phase 2. Behaviour unchanged.
import { DLW } from '../data/programme.js';
import { epley, totalLoad } from './training.js';

// Does training on low recovery actually cost performance? Splits sessions by the WHOOP
// recovery recorded that day and compares mean e1RM per lift, normalised so lifts with big
// absolute loads don't dominate. This is descriptive, not causal — a low-recovery day may
// coincide with a deload or a bad night — but it either supports or undermines the
// green-recovery veto with the user's own data instead of an assumption.
export function computeRecoveryPerformance(logs, whoopHistory, bwAt = null) {
  const recByDate = {};
  for (const h of (whoopHistory||[])) if (h && h.date && h.recovery != null) recByDate[h.date] = h.recovery;
  if (!Object.keys(recByDate).length) return null;
  const rows = perfRows(logs, l => {
    const rec = recByDate[(l.date||'').slice(0,10)];
    if (rec == null) return null;
    return rec < 34 ? 'low' : rec < 67 ? 'mid' : 'high';
  }, bwAt);
  if (rows.length < 8) return null;
  const r = relPerfByBucket(rows);
  if (!r) return null;
  // One point PER SESSION for the scatter: mean relative e1RM across that session's lifts,
  // paired with the day's recovery. Per-exercise points would cluster by session and
  // overstate how much independent evidence there is.
  const meanBy = {};
  for (const x of rows) (meanBy[x.pid] = meanBy[x.pid] || []).push(x.e1rm);
  for (const k in meanBy) { const a = meanBy[k]; meanBy[k] = a.reduce((p,q)=>p+q,0)/a.length; }
  const bySession = {};
  for (const x of rows) {
    const m = meanBy[x.pid]; if (!m) continue;
    const rel = (x.e1rm/m - 1) * 100;
    (bySession[x.sid] = bySession[x.sid] || { rels: [], sdate: x.sdate }).rels.push(rel);
  }
  const points = [];
  for (const sid in bySession) {
    const rec = recByDate[(bySession[sid].sdate||'').slice(0,10)];
    const rl = bySession[sid].rels;
    if (rec == null || !rl.length) continue;
    points.push({ x: rec, y: +(rl.reduce((p,q)=>p+q,0)/rl.length).toFixed(1) });
  }
  const high = r.high && r.high.mean, mid = r.mid && r.mid.mean, low = r.low && r.low.mean;
  const usable = [high, mid, low].filter(v => v != null).length;
  if (usable < 2) return null;
  let verdict = null, gap = null, provisional = false;
  const cmpVal = low != null ? low : mid;
  const cmpKey = low != null ? 'low' : 'mid';
  if (high != null && cmpVal != null) {
    gap = +(high - cmpVal).toFixed(1);
    // Only judge when BOTH compared groups clear the verdict bar. Otherwise report the gap
    // as an early signal — the difference may be real, but this many sessions cannot show it.
    const enough = r.high.sessions >= PERF_MIN_VERDICT && r[cmpKey].sessions >= PERF_MIN_VERDICT;
    if (enough) verdict = gap > 3 ? 'costly' : gap < -3 ? 'inverse' : 'negligible';
    else provisional = true;
  }
  return {
    high, mid, low, gap, verdict, provisional, points,
    minVerdict: PERF_MIN_VERDICT,
    highN: r.high ? r.high.sessions : 0,
    midN:  r.mid  ? r.mid.sessions  : 0,
    lowN:  r.low  ? r.low.sessions  : 0,
    totalSessions: new Set(rows.map(x => x.sid)).size
  };
}


// Shared engine for "does condition X change my lifting?" questions. Takes rows of
// {pid, e1rm, bucket, sid}, normalises each lift against its OWN mean so heavy compounds
// don't dominate, and returns mean relative performance per bucket. Used by the recovery,
// time-of-day and alcohol analytics so all three answer the same shape of question with
// identical maths.
// Two thresholds, not one. MIN_SHOW is the point at which a bucket's mean is worth
// displaying; MIN_VERDICT is the much higher bar for turning that mean into behavioural
// advice. Three sessions is enough to plot a number and nowhere near enough to tell someone
// to change when they train or whether to drink. Between the two, the card shows the figures
// and labels them an early signal instead of issuing a verdict.
export const PERF_MIN_SHOW = 3;

export const PERF_MIN_VERDICT = 8;


export function relPerfByBucket(rows, minSessions = PERF_MIN_SHOW) {
  if (!rows.length) return null;
  try {
    // §5.1: detrend each lift against its OWN linear progression before bucketing. Normalising
    // against the all-time mean let long-term strength gains leak into the buckets — recent
    // sessions being stronger is progression, not a recovery/time-of-day/alcohol effect. Residual =
    // actual e1RM vs the lift's fitted trend at that date, so buckets reflect deviation FROM trend.
    const byPid = {};
    for (const r of rows) (byPid[r.pid] = byPid[r.pid] || []).push(r);
    const acc = {};
    for (const pid in byPid) {
      const pr = byPid[pid].filter(r => r.date).sort((a,b)=> a.date < b.date ? -1 : 1);
      const n = pr.length;
      if (!n) continue;
      const mean = pr.reduce((s,r)=>s+r.e1rm,0)/n;
      const t0 = new Date(pr[0].date).getTime();
      const xs = pr.map(r => (new Date(r.date).getTime()-t0)/86400000); // days since first session
      // Least-squares line e1RM ~ day; fall back to a flat mean when <3 points or no time spread.
      let intercept = mean, slope = 0;
      if (n >= 3) {
        const mx = xs.reduce((a,b)=>a+b,0)/n;
        let sxx=0, sxy=0;
        for (let i=0;i<n;i++){ const dx=xs[i]-mx; sxx+=dx*dx; sxy+=dx*(pr[i].e1rm-mean); }
        if (sxx > 0) { slope = sxy/sxx; intercept = mean - slope*mx; }
      }
      for (let i=0;i<n;i++){
        const exp = intercept + slope*xs[i];
        if (!(exp > 0)) continue;
        const rel = (pr[i].e1rm - exp)/exp * 100;   // % residual vs trend
        const r = pr[i];
        const b = (acc[r.bucket] = acc[r.bucket] || { n:0, sum:0, sids:new Set() });
        b.n++; b.sum += rel; if (r.sid) b.sids.add(r.sid);
      }
    }
    const out = {};
    // Gate on distinct SESSIONS, not rows: one session is ~8 exercise-rows, so a row-based minimum
    // would let a single day qualify a bucket and produce a confident verdict from one session.
    for (const k in acc) {
      const sess = acc[k].sids.size || 0;
      out[k] = { n: acc[k].n, sessions: sess,
                 mean: sess >= minSessions ? +(acc[k].sum/acc[k].n).toFixed(1) : null,
                 provisional: sess < PERF_MIN_VERDICT };
    }
    return out;
  } catch(e) { try{console.error('relPerfByBucket failed',e);}catch(_){} return null; }
}


// One row per exercise per non-deload session, tagged by a caller-supplied bucket.
export function perfRows(logs, bucketFn, bwAt = null) {
  const rows = [];
  for (const l of (logs||[])) {
    if (l.deload === true || (l.deload == null && DLW.has(l.week))) continue;
    const bucket = bucketFn(l);
    if (bucket == null) continue;
    for (const ex of (l.exercises||[])) {
      if (!ex || !Array.isArray(ex.sets) || !ex.sets.length) continue;
      const pid = ex.origId||ex.id;
      const best = Math.max(...ex.sets.map(s => epley(totalLoad(pid, s.weight, bwAt, l.date), s.reps||0)));
      if (!best || !isFinite(best)) continue;
      rows.push({ pid, e1rm: best, bucket, sid: l.id || l.date, date: l.date });
    }
  }
  return rows;
}


// Performance by time of day. Session start is recoverable: logs store the END time plus
// duration, so start = date - duration.
//
// Bands are deliberately finer than "morning vs evening" so the card reflects when the user
// ACTUALLY trains rather than a preset assumption. The trade-off: narrow bands hold fewer
// sessions, and a band needs >=3 sessions before its mean is trustworthy. So every populated
// band is shown, but the verdict compares the two bands with the most sessions — whichever
// those happen to be. That adapts to any schedule instead of hardcoding one.
export const TOD_BANDS = [
  { k:'early',   label:'Early morning', sub:'before 7am',  lo:0,  hi:7  },
  { k:'morning', label:'Morning',       sub:'7am - 11am',  lo:7,  hi:11 },
  { k:'midday',  label:'Midday',        sub:'11am - 4pm',  lo:11, hi:16 },
  { k:'evening', label:'Evening',       sub:'4pm - 8pm',   lo:16, hi:20 },
  { k:'late',    label:'Late evening',  sub:'8pm onwards', lo:20, hi:24 },
];


export function computeTimeOfDay(logs, bwAt = null) {
  const startMins = {};   // band -> list of start times in minutes, for the real average
  const rows = perfRows(logs, l => {
    const end = new Date(l.date).getTime();
    if (isNaN(end)) return null;
    const d = new Date(end - (l.duration||60)*60000);
    const h = d.getHours();
    const band = TOD_BANDS.find(b => h >= b.lo && h < b.hi);
    if (!band) return null;
    (startMins[band.k] = startMins[band.k] || []).push(h*60 + d.getMinutes());
    return band.k;
  }, bwAt);
  if (rows.length < 8) return null;
  const r = relPerfByBucket(rows);
  if (!r) return null;

  const bands = TOD_BANDS
    .filter(b => r[b.k])
    .map(b => {
      const mins = startMins[b.k] || [];
      const avgMin = mins.length ? Math.round(mins.reduce((a,x)=>a+x,0)/mins.length) : null;
      return {
        ...b,
        sessions: r[b.k].sessions,
        mean: r[b.k].mean,
        typical: avgMin == null ? null
          : String(Math.floor(avgMin/60)).padStart(2,'0') + ':' + String(avgMin%60).padStart(2,'0')
      };
    });

  // Compare the two most-used bands, not a preset pair.
  const ranked = bands.filter(b => b.mean != null).sort((a,b) => b.sessions - a.sessions);
  let verdict = null, gap = null, better = null, worse = null, provisional = false;
  if (ranked.length >= 2) {
    const [a, b] = ranked.slice(0, 2);
    const hi = a.mean >= b.mean ? a : b;
    const lo = a.mean >= b.mean ? b : a;
    gap = +(hi.mean - lo.mean).toFixed(1);
    better = hi; worse = lo;
    // Telling someone to move their training slot is a real behavioural ask; it needs more
    // than a handful of sessions per slot before it is anything other than a guess.
    if (hi.sessions >= PERF_MIN_VERDICT && lo.sessions >= PERF_MIN_VERDICT) {
      verdict = gap > 2 ? 'clear' : 'nodiff';
    } else provisional = true;
  }
  return { bands, verdict, gap, better, worse, provisional, minVerdict: PERF_MIN_VERDICT,
           total: new Set(rows.map(x=>x.sid)).size };
}


// Alcohol vs lifting. A session counts as "after drinking" if units were logged that day or
// the day before — alcohol's effect on sleep and recovery carries into the next day.
export function computeAlcoholImpact(logs, contextLog, bwAt = null) {
  const drinkDays = new Set();
  for (const c of (contextLog||[])) {
    if (!c || !(c.units > 0)) continue;
    const d = (c.date||'').slice(0,10);
    if (d) drinkDays.add(d);
  }
  if (!drinkDays.size) return null;
  const dayMs = 86400000;
  const rows = perfRows(logs, l => {
    const t = new Date(l.date).getTime();
    if (isNaN(t)) return null;
    const today = new Date(t).toISOString().slice(0,10);
    const yest  = new Date(t - dayMs).toISOString().slice(0,10);
    return (drinkDays.has(today) || drinkDays.has(yest)) ? 'after' : 'clear';
  }, bwAt);
  if (rows.length < 8) return null;
  const r = relPerfByBucket(rows);
  if (!r || !r.after || !r.clear) return null;
  const a = r.after.mean, c = r.clear.mean;
  let verdict = null, gap = null, provisional = false;
  if (a != null && c != null) {
    gap = +(a - c).toFixed(1);
    if (r.after.sessions >= PERF_MIN_VERDICT && r.clear.sessions >= PERF_MIN_VERDICT) {
      verdict = gap < -2 ? 'costly' : gap > 2 ? 'inverse' : 'negligible';
    } else provisional = true;
  }
  return { ...r, verdict, gap, provisional, minVerdict: PERF_MIN_VERDICT,
           total: new Set(rows.map(x=>x.sid)).size, drinkDays: drinkDays.size };
}


// ---- Context flags: attribution, not just logging ----
// A recovery dip that follows alcohol, illness or a bad night is TRANSIENT and must not be
// read as accumulated training fatigue. Returns the flag relevant to today's readiness.
export const CTX_TAGS = [
  {id:'illness', label:'Illness'},
  {id:'poorsleep', label:'Bad night'},
  {id:'travel', label:'Travel'},
  {id:'stress', label:'High stress'},
];

export function ctxForDate(contextLog, dateStr) {
  return (contextLog||[]).find(c => (c.date||'').slice(0,10) === dateStr) || null;
}

// Alcohol suppresses REM and drops HRV for 24-48h, so yesterday counts as well as today.
export function recentCtx(contextLog) {
  const d = new Date();
  const day = n => { const x=new Date(d); x.setDate(x.getDate()-n); return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`; };
  const today = ctxForDate(contextLog, day(0)), yest = ctxForDate(contextLog, day(1));
  const reasons = [];
  const pick = (c, when) => {
    if (!c) return;
    if (c.units > 0) reasons.push(`alcohol ${c.units}u ${when}`);
    (c.tags||[]).forEach(t => { const m=CTX_TAGS.find(x=>x.id===t); if(m) reasons.push(m.label.toLowerCase()+' '+when); });
  };
  pick(today, 'today'); pick(yest, 'yesterday');
  return reasons.length ? reasons : null;
}
