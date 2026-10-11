// Split out of App.jsx in Phase 2. Behaviour unchanged.
import { bpCategory } from './health.js';

export function computeDeloadReadiness(history, week) {
  if (!history || history.length < 6) return { level: 'unknown', msg: 'Need about a week of WHOOP data to assess fatigue.' };
  const sorted = [...history].sort((x, y) => x.date < y.date ? -1 : 1);
  const recent = sorted.slice(-7);
  const base = sorted.length >= 14 ? sorted.slice(-14, -7) : sorted.slice(0, -7);
  const avg = (arr, k) => { const v = arr.map(e => e[k]).filter(n => n != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const rRec = avg(recent, 'recovery'), bRec = avg(base, 'recovery');
  const rHrv = avg(recent, 'hrv'), bHrv = avg(base, 'hrv');
  // §5.6: recovery-down, recovery-low and HRV-down are all the SAME autonomic domain — WHOOP
  // recovery is itself derived from HRV/RHR, and "down 8pts" + "sitting low" read the same number.
  // Counting them separately let one correlated dip triple-count into a >=2 "deload" call. Collect
  // the observations for context, but the autonomic domain casts ONE vote. A deload then needs a
  // genuinely independent corroborating factor (end of an accumulation block), not stacked
  // correlated metrics — which also respects the tren-suppressed-HRV veto below.
  const reasons = [];
  if (rRec != null && bRec != null && (rRec - bRec) <= -8) reasons.push('recovery down ' + Math.round(bRec - rRec) + ' pts');
  if (rHrv != null && bHrv != null && ((rHrv - bHrv) / bHrv * 100) <= -10) reasons.push('HRV down ' + Math.round((bHrv - rHrv) / bHrv * 100) + '%');
  if (rRec != null && rRec < 40) reasons.push('recovery sitting low');
  const autonomicVote = reasons.length > 0 ? 1 : 0;
  const endOfBlock = [3, 7, 11].includes(week);
  // Today's recovery is the strongest single signal. If the most recent recovery is solidly
  // green (>=67), don't raise a deload/fatigue flag off trend deltas alone - on tren, HRV/RHR
  // run chronically suppressed so the baseline comparison produces false fatigue signals.
  const latestRec = sorted.length ? sorted[sorted.length-1].recovery : null;
  const greenNow = latestRec != null && latestRec >= 67;
  let level, msg;
  if (autonomicVote && endOfBlock && !greenNow) { level = 'deload'; msg = 'End of an accumulation block with an autonomic fatigue signal (' + reasons.join(', ') + ') — a deload is well timed now.'; }
  else if (autonomicVote && !greenNow) { level = 'moderate'; msg = 'Autonomic fatigue signal (' + reasons.join(', ') + '). These are correlated recovery metrics, so treat them as one signal: hold volume, prioritise sleep, and watch performance — a deload is warranted only if your lifts also start dropping.'; }
  else { level = 'fresh'; msg = endOfBlock ? 'Recovery is holding well — you could push one more hard week before deloading.' : 'Recovery is holding well — keep progressing as planned.'; }
  return { level, msg, rRec: rRec != null ? Math.round(rRec) : null, bRec: bRec != null ? Math.round(bRec) : null, rHrv: rHrv != null ? Math.round(rHrv) : null, bHrv: bHrv != null ? Math.round(bHrv) : null };
}


export function computeReadiness(recovery, whoopData, deloadInfo, logs, week, whoopHistory, latestBP, deloadActive, ctxReasons) {
  const lastLog = logs && logs[0];
  // Pain only counts if it is recent. Previously a sharp-pain flag from the last logged
  // workout capped readiness indefinitely, even after months away.
  const _painAge = lastLog && lastLog.date ? (Date.now() - new Date(lastLog.date).getTime())/86400000 : null;
  const painFresh = _painAge != null && _painAge >= 0 && _painAge <= 14;  // >=0 rejects future-dated logs
  const recentPain = painFresh ? (lastLog?.exercises || []).filter(e => e.pain).map(e => ({ name: e.name, level: e.pain })) : [];
  const sharpPain = recentPain.some(p => p.level === 2);
  const nigglePain = recentPain.some(p => p.level === 1);
  const sharpName = recentPain.find(p => p.level === 2)?.name;
  // WHOOP freshness: cached recovery must not gate today. BP already had this guard;
  // WHOOP did not, so a stale green score could still trigger green_push / high volume.
  const whoopAgeH = whoopData?.cachedAt ? (Date.now() - whoopData.cachedAt)/3600000 : null;
  const whoopStale = whoopAgeH != null && whoopAgeH > 30; // >~1 day old
  const rec = whoopStale ? null : whoopData?.recovery;
  const recLow = rec != null && rec < 34;
  const recMidLow = rec != null && rec >= 34 && rec < 50;
  const recHigh = rec != null && rec >= 67;
  const sleep = whoopStale ? null : whoopData?.sleep;
  const sleepPoor = sleep != null && sleep < 70;
  const sleepGreat = sleep != null && sleep >= 85;
  const subjBeat = recovery === 'beat';
  const subjExcellent = recovery === 'excellent';
  const trend = deloadInfo?.level;
  const deloadWk = deloadActive != null ? deloadActive : [4, 8, 12].includes(week);
  const peakWk = [9, 10, 11].includes(week);

  const factors = [];
  let major = 0, minor = 0, pos = 0;
  if (subjBeat) { major++; factors.push('you flagged feeling beat up'); }
  // Attribution: a dip that follows alcohol, illness or a bad night is transient and is NOT
  // accumulated training fatigue. Name the cause and don't let the TREND signal escalate on
  // it. Today's raw low recovery still counts — you still train easier today, you just don't
  // get told to deload for it.
  const ctxAttributed = !!(ctxReasons && ctxReasons.length);
  if (ctxAttributed) factors.push('recent ' + ctxReasons.join(', ') + ' — likely transient, not training fatigue');
  if (recLow) { major++; factors.push('WHOOP recovery red (' + rec + '%)'); }
  if (trend === 'deload' && !ctxAttributed) { major++; factors.push('fatigue trend building'); }
  if (sleepPoor && !ctxAttributed) { minor++; factors.push('poor sleep (' + sleep + '%)'); }
  if (trend === 'moderate' && !ctxAttributed) { minor++; factors.push('early fatigue signal'); }
  if (nigglePain) { minor++; factors.push('joint niggle flagged last session'); }
  if (recMidLow) { minor++; factors.push('WHOOP recovery low-yellow (' + rec + '%)'); }
  if (subjExcellent) { pos++; factors.push('you feel fresh'); }
  if (recHigh) { pos++; factors.push('WHOOP recovery green (' + rec + '%)'); }
  if (trend === 'fresh') pos++;
  if (sleepGreat) { pos++; factors.push('strong sleep (' + sleep + '%)'); }

  // Cumulative-fatigue + illness signals from the richer WHOOP feed
  const sd = whoopStale ? null : whoopData?.sleepDebt;
  if (sd != null && sd >= 2) { minor++; factors.push('sleep debt ' + sd + 'h'); }
  const rrVals = (whoopHistory || []).map(h => h.respRate).filter(v => v != null);
  if (!whoopStale && whoopData?.respRate != null && rrVals.length >= 5) {
    const baseArr = rrVals.slice(0, -1).slice(-14);
    const baseAvg = baseArr.reduce((a, b) => a + b, 0) / baseArr.length;
    if (whoopData.respRate >= baseAvg + 1) { major++; factors.push('respiratory rate up vs baseline (possible illness)'); }
  }

  const ORDER = ['red_stop', 'red_min', 'amber', 'green_standard', 'green_push'];
  let mode;
  if (deloadWk) mode = 'amber';
  else if (major >= 3 || (sharpPain && major >= 2)) mode = 'red_stop';
  else if (major >= 2) mode = 'red_min';
  else if (major === 1 || minor >= 2) mode = 'amber';
  else if (pos >= 2) mode = 'green_push';
  else mode = 'green_standard';
  if (sharpPain && ORDER.indexOf(mode) > ORDER.indexOf('amber')) mode = 'amber';
  if (peakWk && mode === 'green_standard' && pos >= 1 && major === 0 && !sharpPain) mode = 'green_push';

  // BP hard-gate: a raised MORNING reading caps readiness regardless of recovery (mirrors autoreg gate).
  // Only valid on a same-day reading — BP varies daily, so a stale reading must not gate today's call.
  // Stage 2 / Crisis (>=140/90) -> minimum dose. Stage 1 / Elevated (>=120) -> no grinders.
  if (latestBP) {
    const bpc = bpCategory(latestBP.sys, latestBP.dia);
    const bpAgeDays = (Date.now() - new Date(latestBP.date).getTime()) / 86400000;
    const bpFresh = bpAgeDays <= 1.0;   // reading from today (or last ~24h) only
    if (bpFresh && bpc.cls === 'red' && ORDER.indexOf(mode) > ORDER.indexOf('red_min')) {
      mode = 'red_min'; factors.push('blood pressure ' + latestBP.sys + '/' + latestBP.dia + ' (' + bpc.label + ')');
    } else if (bpFresh && bpc.cls === 'amber' && ORDER.indexOf(mode) > ORDER.indexOf('amber')) {
      mode = 'amber'; factors.push('blood pressure ' + latestBP.sys + '/' + latestBP.dia + ' (' + bpc.label + ')');
    } else if (!bpFresh && (bpc.cls === 'red' || bpc.cls === 'amber')) {
      // stale elevated reading: inform, do not gate — prompt a fresh measurement
      factors.push('last BP ' + latestBP.sys + '/' + latestBP.dia + ' (' + bpc.label + ') was ' + Math.round(bpAgeDays) + 'd ago \u2014 measure again today');
    }
  }

  const META = {
    green_push:     { title: 'Green \u00b7 Push',        cls: 'green', action: 'Full session. Push your top sets and add load wherever your targets call for it. Intensifiers on if this week programmes them.' },
    green_standard: { title: 'Green \u00b7 Standard',    cls: 'green', action: 'Full session as planned. Hit your targets with honest reps in reserve, no extra volume.' },
    amber:          { title: 'Amber \u00b7 Modify',      cls: 'amber', action: deloadWk ? 'Deload week. Keep the main lifts light, cut accessory volume, and stay well short of failure.' : 'Train, but modify. Keep your main compounds, trim one or two isolation sets, and stay a rep or two shy of failure.' },
    red_min:        { title: 'Red \u00b7 Minimum Dose',  cls: 'red',   action: 'Minimum effective dose. Run the 30-minute version, skip intensifiers, leave 2-3 in reserve, and chase a pump rather than a PR.' },
    red_stop:       { title: 'Red \u00b7 Recover',       cls: 'red',   action: "Back off today. Mobility, a walk, or easy cardio, or just rest. This mix of signals isn't the day to grind." },
  };
  const meta = META[mode];
  let action = meta.action;
  if (sharpPain && sharpName && mode === 'amber') action += ' Swap ' + sharpName + ' for a joint-friendly alternative.';
  return { mode, cls: meta.cls, title: meta.title, action, factors };
}
