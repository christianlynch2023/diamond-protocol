// TodayView: moved out of App.jsx in Phase 2b. Behaviour unchanged.
import React from 'react';
import { useApp } from '../appContext';
import { SESSIONS, getPhase } from '../data/programme';
import { freshInfo } from '../lib/format';
import { bpCategory, glucoseCategory } from '../lib/health';
import { sessionPerformed } from '../lib/sessions';
import { getTarget } from '../lib/training';

export default function TodayView() {
  const {
    block, bodyMetrics, bpStats, bwRate, ctxReasons, effPhase, effTargets, fmtAgo, getWhoopCls, glStats,
    isDeload, latestBP, latestGl, logs, nutriCoach, readiness, resumeWorkout, sel, setView, setWood,
    skinTempStat, startWorkout, tempStat, todayVitals, week, whoopData, wipData, wr
  } = useApp();
  return (
        <div className="screen">
          <div className="topbar"><span className="logo">Today</span><span className="top-badge">B{block} · W{week}/12</span></div>
          <div className="today-date">{new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'})}</div>

          {/* ACTION FIRST. Today used to open on a recovery dashboard, so the thing you actually
              need — what to train and what to load — sat below the fold. This card answers it:
              readiness call (advice), the session, the first lift's exact prescription, any
              warnings, and Start. Everything below stays as the supporting detail. */}
          {(() => {
            const inProg = wipData && SESSIONS[wipData.sessionId];
            // Derive the next session durably from what's actually been completed this programme
            // week, instead of depending on `sel` (which is null on every fresh load and forced a
            // "Choose a session" dead-end). Rotation order = programme order; the first session not
            // yet performed this week is "next up". An explicit selection still overrides.
            const order = Object.keys(SESSIONS);
            const doneThisWeek = new Set((logs||[]).filter(l => (l.block||1)===block && l.week===week && sessionPerformed(l)).map(l => l.sessionId));
            const derivedNext = order.find(id => !doneThisWeek.has(id)) || order[0];
            const allDone = doneThisWeek.size >= order.length;
            const sid = inProg ? wipData.sessionId : (sel || derivedNext);
            const isDerived = !inProg && !sel;
            const sess = sid ? SESSIONS[sid] : null;
            const ex0 = sess ? sess.exercises[0] : null;
            const t0 = ex0 ? getTarget(ex0, logs, week, effPhase) : null;
            const warns = [];
            if (latestBP) { const c = bpCategory(latestBP.sys, latestBP.dia); if (c.cls==='red'||c.cls==='amber') warns.push('BP '+latestBP.sys+'/'+latestBP.dia+' — '+(c.label||'elevated')); }
            if (whoopData && whoopData.cachedAt && (Date.now()-new Date(whoopData.cachedAt).getTime())>30*3600000) warns.push('WHOOP data stale');
            if (isDeload) warns.push('Deload week — sets cut to ~40-50% of base, 85% load');
            if (ctxReasons && ctxReasons.length) warns.push(ctxReasons.join(' · '));
            return (
              <div className={`td-act ${readiness.cls}`}>
                <div className="ta-top">
                  <span className={`ta-mode ${readiness.cls}`}>{readiness.title}</span>
                  <span className="ta-prov">guidance</span>
                </div>
                <div className="ta-action">{readiness.action}</div>
                {sess ? (
                  <>
                    <div className="ta-sess">{sess.name}{inProg && <span className="td-chip">in progress</span>}{isDerived && !allDone && <span className="td-chip">next up{sess.day?' · '+sess.day:''}</span>}{isDerived && allDone && <span className="td-chip">week complete · new rotation</span>}</div>
                    <div className="ta-sub">{sess.focus} · {getPhase(week).name} · target {wr.rir}</div>
                    {ex0 && t0 && (
                      <div className="ta-first">
                        <span className="ta-ex">{ex0.name}</span>
                        <span className="ta-tgt">{t0.weight ? t0.weight+'kg' : 'establish'} {t0.reps?'× '+t0.reps:''}</span>
                      </div>
                    )}
                    {ex0 && t0 && t0.note && <div className="ta-note">{t0.note}</div>}
                    {warns.length > 0 && <div className="ta-warn">{warns.join(' · ')}</div>}
                    <button className="ta-go" onClick={()=> inProg ? resumeWorkout() : startWorkout(sid)}>
                      {inProg ? 'Resume session' : 'Start '+sess.name}
                    </button>
                    {!inProg && <button onClick={()=>setView('home')} style={{marginTop:8,background:'none',border:'none',color:'var(--t3)',fontSize:12,textDecoration:'underline',cursor:'pointer',width:'100%',textAlign:'center',fontFamily:'inherit'}}>Not this one? Choose another</button>}
                  </>
                ) : (
                  <>
                    {warns.length > 0 && <div className="ta-warn">{warns.join(' · ')}</div>}
                    <button className="ta-go" onClick={()=>setView('home')}>Choose a session</button>
                  </>
                )}
              </div>
            );
          })()}

          <div className="td-hero">
            <div className="th-lbl">Recovery <span className="td-prov">measured · WHOOP</span></div>
            {whoopData && whoopData.recovery!=null ? (
              <>
                <div className="th-val"><span className={'wcls '+getWhoopCls(whoopData.recovery)}>{whoopData.recovery}<span style={{fontSize:26}}>%</span></span>
                  <span className="th-tag" style={{color: whoopData.recovery>=67?'var(--ok)':whoopData.recovery>=34?'#ffd24a':'var(--err)'}}>{whoopData.recovery>=67?'Green':whoopData.recovery>=34?'Yellow':'Red'}</span></div>
                <div className="th-sub">RHR {whoopData.rhr}bpm · HRV {whoopData.hrv}ms{whoopData.sleepHrs!=null?' · Sleep '+whoopData.sleepHrs+'h':''}{whoopData.sleepDebt!=null&&whoopData.sleepDebt>0?<span style={{color:whoopData.sleepDebt>=1?'var(--warn)':'inherit'}}> · Debt {whoopData.sleepDebt}h</span>:''}<br/>{whoopData.sleepConsistency!=null?'Consistency '+whoopData.sleepConsistency+'% · ':''}{whoopData.spo2!=null?'SpO₂ '+whoopData.spo2+'% · ':''}{fmtAgo(whoopData.cachedAt)}</div>
              </>
            ) : <div className="th-none">No WHOOP data yet today</div>}
          </div>

          <div className="td-card">
            <div className="td-row"><span className="td-lbl">Weight {(() => { const f=freshInfo(bodyMetrics[0]&&bodyMetrics[0].date,10); return <span className="td-prov" style={f&&f.stale?{color:'var(--warn)'}:undefined}>{f?'measured · '+f.label:'measured'}</span>; })()}</span>
              <span className="td-val">{bodyMetrics[0]?bodyMetrics[0].weight+'kg':'—'}{bwRate?<span className={'td-arrow '+(bwRate.perWeek<-0.02?'good':bwRate.perWeek>0.02?'warn':'')}>{bwRate.perWeek>0.02?'▲':bwRate.perWeek<-0.02?'▼':'→'} {Math.abs(bwRate.perWeek).toFixed(2)}/wk</span>:null}</span></div>
            {bpStats||bwRate?<div className="td-sub">{bwRate?('trend '+(bwRate.pctWeek>0?'+':'')+bwRate.pctWeek.toFixed(2)+'%/wk'):''}</div>:null}
          </div>

          <div className="td-card">
            <div className="td-row"><span className="td-lbl">Fuel target <span className="td-prov">estimated</span></span>
              <span className="td-val">{effTargets ? effTargets.weekly : (nutriCoach && nutriCoach.suggested) ? nutriCoach.suggested : '—'}{(effTargets || (nutriCoach && nutriCoach.suggested)) ? <span className="td-muted" style={{fontSize:13}}> kcal{effTargets && effTargets.source==='locked' ? ' \u00b7 locked' : ''}</span> : null}</span></div>
            {(() => {
              // Macros come from the SAME source as the calorie number above (effTargets), so a
              // locked calorie target and its macros always reconcile. Reading protein/carb/fat
              // off the live engine while calories came from the lock let them silently disagree
              // (locked cals, but carbs derived from a different live estimate). Falls back to the
              // live engine only when there is no effTargets at all.
              const P = effTargets ? effTargets.protein : (nutriCoach && nutriCoach.proteinG);
              const C = effTargets ? effTargets.carb    : (nutriCoach && nutriCoach.carbG);
              const F = effTargets ? effTargets.fat     : (nutriCoach && nutriCoach.fatG);
              return (P != null && Number.isFinite(P))
                ? <div className="td-sub">P {P}g{C!=null?' · C '+C+'g':''}{F!=null?' · F '+F+'g':''}</div>
                : null;
            })()}
          </div>

          <div className="td-card">
            <div className="td-row"><span className="td-lbl">Blood pressure {(() => { const f=freshInfo(latestBP&&latestBP.date,7); return <span className="td-prov" style={f&&f.stale?{color:'var(--warn)'}:undefined}>{f?'measured · '+f.label:'measured'}</span>; })()}</span>
              {latestBP
                ? <span className="td-val"><span className={'bpc '+bpCategory(latestBP.sys,latestBP.dia).cls}>{latestBP.sys}/{latestBP.dia}</span></span>
                : <span className="td-val td-muted">not logged</span>}</div>
            {latestBP && bpStats && <div className="td-sub">{bpCategory(latestBP.sys,latestBP.dia).label||''} · 7-day avg {bpStats.avgSys}/{bpStats.avgDia}{latestBP.sys>bpStats.avgSys?' · ▲ up':latestBP.sys<bpStats.avgSys?' · ▼ down':' · → level'}</div>}
          </div>

          {latestGl && <div className="td-card">
            <div className="td-row"><span className="td-lbl">Glucose {(() => { const f=freshInfo(latestGl&&latestGl.date,7); return <span className="td-prov" style={f&&f.stale?{color:'var(--warn)'}:undefined}>{f?'measured · '+f.label:'measured'}</span>; })()}</span>
              <span className="td-val"><span className={'bpc '+glucoseCategory(latestGl.value).cls}>{latestGl.value}</span><span className="td-muted" style={{fontSize:13}}> mmol/L</span></span></div>
            {glStats && <div className="td-sub">7-day avg {glStats.avg} · {glStats.inRange}% in range{latestGl.value>glStats.avg?' · ▲ up':latestGl.value<glStats.avg?' · ▼ down':' · → level'}</div>}
          </div>}

          <div className="td-card">
            <div className="td-row"><span className="td-lbl">Waking temp <span className="td-prov">measured</span></span>
              <span className="td-val">{todayVitals && todayVitals.temp!=null
                ? todayVitals.temp+'°'
                : (whoopData && whoopData.skinTemp!=null
                    ? <span>{whoopData.skinTemp}°<span className="td-chip">WHOOP skin</span></span>
                    : <span className="td-muted" style={{fontSize:14}}>—</span>)}</span></div>
            {todayVitals && todayVitals.temp!=null && tempStat && <div className="td-sub">7-day avg {tempStat.avg}°{tempStat.delta!=null && Math.abs(tempStat.delta)>=0.05 ? ' · '+(tempStat.delta>0?'▲ +'+tempStat.delta.toFixed(1):'▼ '+tempStat.delta.toFixed(1))+'° today' : tempStat.delta!=null?' · → steady':''}{tempStat.n<7?' ('+tempStat.n+'d)':''}</div>}
            {(!todayVitals || todayVitals.temp==null) && whoopData && whoopData.skinTemp!=null && skinTempStat && <div className="td-sub">Wrist skin temp, not oral &#8212; read the drift, not the number. 7-day avg {skinTempStat.avg}°{skinTempStat.delta!=null && Math.abs(skinTempStat.delta)>=0.05 ? ' · '+(skinTempStat.delta>0?'▲ +'+skinTempStat.delta.toFixed(1):'▼ '+skinTempStat.delta.toFixed(1))+'°' : ' · → steady'}</div>}
            {(!todayVitals || todayVitals.temp==null) && <div className="td-sub" style={{color:'var(--t3)'}}>Log manually in Body &#8594; Waking Temp to override</div>}
          </div>

          <div className="td-card">
            <div className="td-row"><span className="td-lbl">Morning wood</span>
              <span className="td-val">{todayVitals && todayVitals.wood===true?'Yes':todayVitals && todayVitals.wood===false?'No':<span className="td-muted" style={{fontSize:14}}>—</span>}</span></div>
            <div className="td-wood">
              <button className={todayVitals && todayVitals.wood===true?'on':''} onClick={()=>setWood(true)}>Yes</button>
              <button className={todayVitals && todayVitals.wood===false?'on':''} onClick={()=>setWood(false)}>No</button>
            </div>
          </div>

          {ctxReasons && ctxReasons.length>0 && <div className="td-card">
            <div className="td-row"><span className="td-lbl">Flags today</span><span className="td-val" style={{fontSize:13}}>{ctxReasons.join(' · ')}</span></div>
          </div>}
        </div>
      );
}
