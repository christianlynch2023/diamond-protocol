// TodayView, round 2 (phase 3). Training days lead with the session; rest days lead with recovery and fuel.
// Readiness is information only: nothing on this screen lets recovery change the session or its targets.
// The health cards below (weight, fuel target, BP, glucose, temperature, morning wood, flags) are unchanged
// from round 1 apart from where they sit.
import React, { useState } from 'react';
import { useApp } from '../appContext';
import { SESSIONS, getPhase } from '../data/programme';
import { freshInfo } from '../lib/format';
import { bpCategory, glucoseCategory } from '../lib/health';
import { sessionPerformed } from '../lib/sessions';
import { getTarget } from '../lib/training';
import { isTrainingDay, localDateStr, metricView, nextSession, recoveryTone } from '../lib/today';
import type { MetricView } from '../lib/today';
import { Button, Card, Eyebrow, RangeBar, Sparkline } from '../components/ui';

const TONE_COLOUR = { ok: 'var(--ok)', neutral: 'var(--t)', watch: 'var(--warn)' } as const;
const hrs = (h: number) => `${Math.floor(h)}h ${String(Math.round((h % 1) * 60)).padStart(2, '0')}m`;
const r1 = (v: number) => (Math.round(v * 10) / 10).toString();

export default function TodayView() {
  const {
    allDone, block, bodyMetrics, bpStats, bwRate, ctxReasons, effPhase, effTargets, fetchWhoopData, fmtAgo, glStats,
    isDeload, latestBP, latestGl, logs, mealTime, nutriCoach, readiness, resumeWorkout, sel, setMealTime, setNewBlockConfirm,
    setShowAddBody, setShowAddCtx, setView, setWood, skinTempStat, startWorkout, tempStat, todayVitals, userSetWeek, week,
    whoopAuthFail, whoopConnected, whoopData, whoopHistory, whoopLoading, whoopStaleNote, wipData, wr
  } = useApp();
  const [advHidden, setAdvHidden] = useState(false);

  const now = new Date();
  const todayName = now.toLocaleDateString('en-GB', { weekday: 'long' });
  const trainingToday = isTrainingDay(now, Object.values(SESSIONS).map(s => s.day), logs || []);
  // Fuel target follows the Meals plan for today's day type, so Today and Fuel always show the same number.
  const planDay = effTargets && effTargets.source === 'plan' ? effTargets.dayTargets[trainingToday ? 'train' : 'rest'] : null;

  // ---- the session (no recovery input, by design) ----
  const wipSid = wipData && SESSIONS[wipData.sessionId] ? wipData.sessionId : null;
  const ns = nextSession({ order: Object.keys(SESSIONS), logs: logs || [], block, week, sel, wipSessionId: wipSid, performed: l => sessionPerformed(l as any) });
  const sess = ns.sid ? SESSIONS[ns.sid] : null;
  const ex0 = sess ? sess.exercises[0] : null;
  const t0 = ex0 ? getTarget(ex0, logs, week, effPhase) : null;
  const warns: string[] = [];
  if (latestBP) { const c = bpCategory(latestBP.sys, latestBP.dia); if (c.cls === 'red' || c.cls === 'amber') warns.push('BP ' + latestBP.sys + '/' + latestBP.dia + ' · ' + (c.label || 'elevated')); }
  if (whoopData && whoopData.cachedAt && (Date.now() - new Date(whoopData.cachedAt).getTime()) > 30 * 3600000) warns.push('WHOOP data stale');
  if (isDeload) warns.push('Deload week: sets cut to about 40 to 50% of base, 85% load');
  if (ctxReasons && ctxReasons.length) warns.push(ctxReasons.join(' · '));

  // ---- recovery numbers ----
  const todayStr = localDateStr(now);
  const hist = whoopHistory || [];
  const hasWhoop = !!(whoopData && whoopData.recovery != null);
  const tone = recoveryTone(whoopData && whoopData.recovery);
  const toneColour = tone ? TONE_COLOUR[tone] : 'var(--t)';
  const mRec = metricView(hist, 'recovery', todayStr, whoopData && whoopData.recovery);
  const mHrv = metricView(hist, 'hrv', todayStr, whoopData && whoopData.hrv);
  const mRhr = metricView(hist, 'rhr', todayStr, whoopData && whoopData.rhr);
  const mSleep = metricView(hist, 'sleepHrs', todayStr, whoopData && whoopData.sleepHrs);
  const connectWhoop = () => { window.location.href = '/.netlify/functions/whoop-auth'; };
  const firstRun = (logs || []).length === 0 && !whoopConnected && (bodyMetrics || []).length === 0;

  const sessionCard = (compact: boolean) => {
    if (!sess) return (
      <Card>
        {warns.length > 0 && <div className="td2-warn">{warns.join(' · ')}</div>}
        <Button kind="primary" full onClick={() => setView('home')}>Choose a session</Button>
      </Card>
    );
    const label = ns.inProg ? 'In progress'
      : ns.isDerived ? (ns.allDone ? 'Week complete · new rotation' : sess.day === todayName ? 'Today' : 'Next up' + (sess.day ? ' · ' + sess.day : ''))
      : 'Chosen';
    return (
      <Card className={compact ? 'td2-sess compact' : 'td2-sess'}>
        <div className="td2-cardhead">
          <Eyebrow tone={ns.inProg ? 'accent' : undefined}>{label}</Eyebrow>
          <span className="td2-meta">{getPhase(week).name} · {wr.rir}</span>
        </div>
        <div>
          <h2 className="td2-sname">{sess.name}</h2>
          <div className="td2-sfocus">{sess.focus}</div>
        </div>
        {ex0 && t0 && (
          <div className="td2-first">
            <span className="td2-first-ex">{ex0.name}</span>
            <span className="ui-fig ui-fig-s">{t0.weight ? t0.weight + ' kg' : 'establish'}{t0.reps ? ' × ' + t0.reps : ''}</span>
          </div>
        )}
        {ex0 && t0 && t0.note && <div className="td2-note">{t0.note}</div>}
        {warns.length > 0 && <div className="td2-warn">{warns.join(' · ')}</div>}
        <Button kind="primary" full onClick={() => (ns.inProg ? resumeWorkout() : startWorkout(ns.sid))}>
          {ns.inProg ? 'Resume session' : 'Start ' + sess.name}
        </Button>
        {!ns.inProg && <button type="button" className="td2-link" onClick={() => setView('home')}>Not this one? Choose another</button>}
      </Card>
    );
  };

  const metricCell = (label: string, mv: MetricView, value: string, colour: string, lineColour: string) => (
    <div className="td2-m" key={label}>
      <span className="td2-ml">{label}</span>
      <span className="ui-fig ui-fig-m" style={{ color: colour }}>{value}</span>
      <Sparkline values={mv.last7} colour={lineColour} />
    </div>
  );

  const rangeRow = (label: string, mv: MetricView, unit: string, lowerIsBetter: boolean, fmt: (v: number) => string) => {
    if (mv.today == null) return null;
    const bad = mv.band ? (lowerIsBetter ? mv.today > mv.band.hi : mv.today < mv.band.lo) : false;
    return (
      <div className="td2-rr" key={label}>
        <div className="td2-rr-top">
          <span className="td2-ml">{label}{mv.band ? ` · normal ${fmt(mv.band.lo)} to ${fmt(mv.band.hi)}` : ''}</span>
          <span className="ui-fig ui-fig-s">{fmt(mv.today)} {unit}</span>
        </div>
        {mv.band
          ? <RangeBar value={mv.today} lo={mv.band.lo} hi={mv.band.hi} min={mv.min} max={mv.max} tone={bad ? 'watch' : 'ok'} />
          : <div className="td2-meta">Your normal range appears after a week of readings</div>}
      </div>
    );
  };

  const recoveryCard = (detail: boolean) => (
    <Card className="td2-rec">
      <div className="td2-cardhead">
        <Eyebrow>Recovery · information only</Eyebrow>
        <span className="td2-meta">{whoopLoading ? 'Syncing…' : hasWhoop && whoopData.cachedAt ? fmtAgo(whoopData.cachedAt) : ''}</span>
      </div>
      {!hasWhoop ? (
        <div className="td2-none">{whoopConnected ? 'No WHOOP data yet today' : 'Connect WHOOP to see recovery, HRV and sleep here.'}</div>
      ) : detail ? (
        <>
          <div className="td2-bigrec">
            <span className="ui-fig ui-fig-xl" style={{ color: toneColour }}>{whoopData.recovery}<span className="ui-unit">%</span></span>
            <Sparkline values={mRec.last7} width={120} height={36} colour={toneColour} />
          </div>
          {rangeRow('HRV', mHrv, 'ms', false, v => String(Math.round(v)))}
          {rangeRow('Resting HR', mRhr, 'bpm', true, v => String(Math.round(v)))}
          {rangeRow('Sleep', mSleep, 'h', false, r1)}
        </>
      ) : (
        <div className="td2-strip">
          {metricCell('Recovery', mRec, whoopData.recovery + '%', toneColour, toneColour)}
          {metricCell('HRV', mHrv, whoopData.hrv != null ? whoopData.hrv + ' ms' : '—', 'var(--t)', 'var(--t2)')}
          {metricCell('Sleep', mSleep, whoopData.sleepHrs != null ? hrs(whoopData.sleepHrs) : '—', 'var(--t)', 'var(--t2)')}
        </div>
      )}
      {hasWhoop && (
        <div className="td2-meta">
          RHR {whoopData.rhr} bpm{whoopData.sleepDebt != null && whoopData.sleepDebt > 0 ? ' · sleep debt ' + whoopData.sleepDebt + 'h' : ''}
          {whoopData.spo2 != null ? ' · SpO₂ ' + whoopData.spo2 + '%' : ''}{whoopData.sleepConsistency != null ? ' · consistency ' + whoopData.sleepConsistency + '%' : ''}
        </div>
      )}
      {tone === 'watch' && <div className="td2-low">Low recovery. Your plan is unchanged. If it stays low, the deload check on Progress will flag it.</div>}
      {readiness && readiness.action && <div className="td2-guide"><b>{readiness.title}.</b> {readiness.action}</div>}
    </Card>
  );

  const fuelCard = (
    <div className="td-card">
      <div className="td-row"><span className="td-lbl">Fuel target <span className="td-prov">{planDay ? 'plan · ' + (trainingToday ? 'training day' : 'rest day') : effTargets && effTargets.source === 'locked' ? 'locked' : 'estimated'}</span></span>
        <span className="td-val">{planDay ? planDay.cals : effTargets ? effTargets.weekly : (nutriCoach && nutriCoach.suggested) ? nutriCoach.suggested : '—'}{(effTargets || (nutriCoach && nutriCoach.suggested)) ? <span className="td-muted" style={{ fontSize: 13 }}> kcal</span> : null}</span></div>
      {(() => {
        // Macros come from the same source as the calorie number above, so a locked target and its macros always reconcile.
        const P = planDay ? planDay.protein : effTargets ? effTargets.protein : (nutriCoach && nutriCoach.proteinG);
        const C = planDay ? planDay.carb : effTargets ? effTargets.carb : (nutriCoach && nutriCoach.carbG);
        const F = planDay ? planDay.fat : effTargets ? effTargets.fat : (nutriCoach && nutriCoach.fatG);
        return (P != null && Number.isFinite(P)) ? <div className="td-sub">P {P}g{C != null ? ' · C ' + C + 'g' : ''}{F != null ? ' · F ' + F + 'g' : ''}</div> : null;
      })()}
    </div>
  );

  const actions = (
    <div className="td2-actions">
      <Button kind="ghost" icon="plus" onClick={() => { setView('body'); setShowAddBody(true); }}>Log weight</Button>
      <Button kind="ghost" icon="plus" onClick={() => { setView('body'); setShowAddCtx(true); }}>Log drinks</Button>
    </div>
  );

  const prompts = (
    <>
      {whoopAuthFail && (
        <div className="td2-banner"><span>WHOOP needs reconnecting.</span><button type="button" onClick={connectWhoop}>Reconnect</button></div>
      )}
      {!whoopAuthFail && whoopStaleNote && (
        <div className="td2-banner"><span>WHOOP sync failed. Showing your last saved data.</span><button type="button" onClick={() => { fetchWhoopData(); }}>Retry</button></div>
      )}
      {firstRun && (
        <Card className="td2-setup">
          <Eyebrow tone="accent">Set up · 3 steps</Eyebrow>
          <div className="td2-step"><span>Connect WHOOP for recovery, sleep and strain</span><Button kind="primary" onClick={connectWhoop}>Connect</Button></div>
          <div className="td2-step"><span>Log your weight. Daily weigh-ins make the trend.</span><Button kind="ghost" onClick={() => { setView('body'); setShowAddBody(true); }}>Log</Button></div>
          <div className="td2-step"><span>When do you train? It sets meal timing.</span>
            <span className="td2-pair">
              <Button kind={mealTime === 'am' ? 'primary' : 'ghost'} onClick={() => setMealTime('am')}>5am</Button>
              <Button kind={mealTime === 'pm' ? 'primary' : 'ghost'} onClick={() => setMealTime('pm')}>8pm</Button>
            </span>
          </div>
        </Card>
      )}
      {allDone && !ns.inProg && !advHidden && (
        <Card tone="accent">
          <Eyebrow tone="accent">{week >= 12 ? 'Block ' + block + ' complete' : 'Week ' + week + ' complete'}</Eyebrow>
          <div className="td2-advtxt">{week >= 12 ? 'All 12 weeks done. Your working weights carry into the next block.' : 'Every session logged. Week ' + (week + 1) + ' is ' + getPhase(week + 1).name + '.'}</div>
          <div className="td2-pair">
            {week >= 12
              ? <Button kind="primary" onClick={() => setNewBlockConfirm(true)}>Start block {block + 1}</Button>
              : <Button kind="primary" onClick={() => userSetWeek(week + 1)}>Start week {week + 1}</Button>}
            <Button kind="ghost" onClick={() => setAdvHidden(true)}>Not yet</Button>
          </div>
        </Card>
      )}
    </>
  );

  return (
    <div className="screen">
      <div className="topbar"><span className="logo">Today</span><span className="top-badge">B{block} · W{week}/12</span></div>
      <div className="today-body td2">
        <div className="today-date">{now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}{trainingToday ? ' · training day' : ' · rest day'}</div>
        {prompts}
        {trainingToday ? (<>{sessionCard(false)}{recoveryCard(false)}{actions}{fuelCard}</>)
          : (<>{recoveryCard(true)}{fuelCard}{sessionCard(true)}{actions}</>)}

        <div className="td-card">
          <div className="td-row"><span className="td-lbl">Weight {(() => { const f = freshInfo(bodyMetrics[0] && bodyMetrics[0].date, 10); return <span className="td-prov" style={f && f.stale ? { color: 'var(--warn)' } : undefined}>{f ? 'measured · ' + f.label : 'measured'}</span>; })()}</span>
            <span className="td-val">{bodyMetrics[0] ? bodyMetrics[0].weight + 'kg' : '—'}{bwRate ? <span className={'td-arrow ' + (bwRate.perWeek < -0.02 ? 'good' : bwRate.perWeek > 0.02 ? 'warn' : '')}>{bwRate.perWeek > 0.02 ? '▲' : bwRate.perWeek < -0.02 ? '▼' : '→'} {Math.abs(bwRate.perWeek).toFixed(2)}/wk</span> : null}</span></div>
          {bpStats || bwRate ? <div className="td-sub">{bwRate ? ('trend ' + (bwRate.pctWeek > 0 ? '+' : '') + bwRate.pctWeek.toFixed(2) + '%/wk') : ''}</div> : null}
        </div>

        <div className="td-card">
          <div className="td-row"><span className="td-lbl">Blood pressure {(() => { const f = freshInfo(latestBP && latestBP.date, 7); return <span className="td-prov" style={f && f.stale ? { color: 'var(--warn)' } : undefined}>{f ? 'measured · ' + f.label : 'measured'}</span>; })()}</span>
            {latestBP
              ? <span className="td-val"><span className={'bpc ' + bpCategory(latestBP.sys, latestBP.dia).cls}>{latestBP.sys}/{latestBP.dia}</span></span>
              : <span className="td-val td-muted">not logged</span>}</div>
          {latestBP && bpStats && <div className="td-sub">{bpCategory(latestBP.sys, latestBP.dia).label || ''} · 7-day avg {bpStats.avgSys}/{bpStats.avgDia}{latestBP.sys > bpStats.avgSys ? ' · ▲ up' : latestBP.sys < bpStats.avgSys ? ' · ▼ down' : ' · → level'}</div>}
        </div>

        {latestGl && <div className="td-card">
          <div className="td-row"><span className="td-lbl">Glucose {(() => { const f = freshInfo(latestGl && latestGl.date, 7); return <span className="td-prov" style={f && f.stale ? { color: 'var(--warn)' } : undefined}>{f ? 'measured · ' + f.label : 'measured'}</span>; })()}</span>
            <span className="td-val"><span className={'bpc ' + glucoseCategory(latestGl.value).cls}>{latestGl.value}</span><span className="td-muted" style={{ fontSize: 13 }}> mmol/L</span></span></div>
          {glStats && <div className="td-sub">7-day avg {glStats.avg} · {glStats.inRange}% in range{latestGl.value > glStats.avg ? ' · ▲ up' : latestGl.value < glStats.avg ? ' · ▼ down' : ' · → level'}</div>}
        </div>}

        <div className="td-card">
          <div className="td-row"><span className="td-lbl">Waking temp <span className="td-prov">measured</span></span>
            <span className="td-val">{todayVitals && todayVitals.temp != null
              ? todayVitals.temp + '°'
              : (whoopData && whoopData.skinTemp != null
                ? <span>{whoopData.skinTemp}°<span className="td-chip">WHOOP skin</span></span>
                : <span className="td-muted" style={{ fontSize: 14 }}>—</span>)}</span></div>
          {todayVitals && todayVitals.temp != null && tempStat && <div className="td-sub">7-day avg {tempStat.avg}°{tempStat.delta != null && Math.abs(tempStat.delta) >= 0.05 ? ' · ' + (tempStat.delta > 0 ? '▲ +' + tempStat.delta.toFixed(1) : '▼ ' + tempStat.delta.toFixed(1)) + '° today' : tempStat.delta != null ? ' · → steady' : ''}{tempStat.n < 7 ? ' (' + tempStat.n + 'd)' : ''}</div>}
          {(!todayVitals || todayVitals.temp == null) && whoopData && whoopData.skinTemp != null && skinTempStat && <div className="td-sub">Wrist skin temp, not oral. Read the drift, not the number. 7-day avg {skinTempStat.avg}°{skinTempStat.delta != null && Math.abs(skinTempStat.delta) >= 0.05 ? ' · ' + (skinTempStat.delta > 0 ? '▲ +' + skinTempStat.delta.toFixed(1) : '▼ ' + skinTempStat.delta.toFixed(1)) + '°' : ' · → steady'}</div>}
          {(!todayVitals || todayVitals.temp == null) && <div className="td-sub" style={{ color: 'var(--t3)' }}>Log manually in Body → Waking Temp to override</div>}
        </div>

        <div className="td-card">
          <div className="td-row"><span className="td-lbl">Morning wood</span>
            <span className="td-val">{todayVitals && todayVitals.wood === true ? 'Yes' : todayVitals && todayVitals.wood === false ? 'No' : <span className="td-muted" style={{ fontSize: 14 }}>—</span>}</span></div>
          <div className="td-wood">
            <button className={todayVitals && todayVitals.wood === true ? 'on' : ''} onClick={() => setWood(true)}>Yes</button>
            <button className={todayVitals && todayVitals.wood === false ? 'on' : ''} onClick={() => setWood(false)}>No</button>
          </div>
        </div>

        {ctxReasons && ctxReasons.length > 0 && <div className="td-card">
          <div className="td-row"><span className="td-lbl">Flags today</span><span className="td-val" style={{ fontSize: 13 }}>{ctxReasons.join(' · ')}</span></div>
        </div>}
      </div>
    </div>
  );
}
