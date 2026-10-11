// ProgressView: moved out of App.jsx in Phase 2b. Behaviour unchanged.
import React from 'react';
import { useApp } from '../appContext.js';
import { RecoveryFuelStrip, SVGBars, SVGChart, SVGScatter } from '../components/charts.jsx';
import { ALL_EX, MUSCLES } from '../data/programme.js';
import { fmtShort } from '../lib/format.js';
import { bpCategory } from '../lib/health.js';

export default function ProgressView() {
  const {
    _metricLbl, _prLbl, _unit, actualVol, alcoholImpact, autoReg, block, bpLog, burnCheck, bwRate,
    chartEvents, curVol, deloadInfo, deloadRebound, durSplit, durations, getPeriodReview, grpOpen,
    hvActive, lastWeight, logs, movementPRs, painTrend, periodLoading, periodReview, periodScope,
    plannedVol, plateaus, prWeight, progChartData, progEx, progHist, progMetric, readiness, recFuelReady,
    recFuelRows, recPerf, rirDrift, setProgEx, setProgMetric, setVolMuscle, stalls, strengthRet,
    timeOfDay, toggleGrp, trainLoad, volMuscle, volParts, volSeries, week, weekReview, whoopConnected,
    whoopHistory
  } = useApp();
  return (
        <div className="screen">
          <div className="topbar"><span className="logo">Progress</span></div>
          {(() => {
            // §8.1 core: surface the few things that need action first, so you don't scan 17 cards.
            // Reads only already-computed signals; every access is guarded and the whole block is
            // try/caught to render null on any error — it can never crash the screen.
            try {
              const items = [];
              try { const b = bpLog && bpLog[0]; if (b) { const bc = bpCategory(b.sys, b.dia); const age = (Date.now()-new Date(b.date).getTime())/86400000; if ((bc.cls==='red'||bc.cls==='amber') && age<=7) items.push({sev:'#ff6b6b', t:`Blood pressure ${b.sys}/${b.dia} (${bc.label||'elevated'}) in the last week — take a repeat reading.`}); } } catch(_){}
              try { if (readiness && readiness.cls==='red') items.push({sev:'#ff6b6b', t:`Readiness is red today — ${readiness.action}`}); } catch(_){}
              try { const s = weekReview && weekReview.items && weekReview.items.find(i=>i.k==='Sessions'); if (s && s.verdict==='miss') items.push({sev:'#e0b020', t:`Sessions behind this week (${s.v}).`}); } catch(_){}
              try { const p = weekReview && weekReview.items && weekReview.items.find(i=>i.k==='Protein'); if (p && p.verdict==='miss') items.push({sev:'#e0b020', t:`Protein under target (${p.v}) — muscle-retention risk on a cut.`}); } catch(_){}
              try { if (plateaus && plateaus.length) items.push({sev:'#728aa2', t:`${plateaus.length} lift${plateaus.length>1?'s':''} stalled: ${plateaus.slice(0,2).map(p=>p.name).join(', ')}${plateaus.length>2?'\u2026':''}.`}); } catch(_){}
              const top = items.slice(0,3);
              if (!top.length) return null;
              return (
                <div className="ar-card" style={{borderColor:'rgba(255,107,107,.35)'}}>
                  <div className="hm-head"><span className="hm-ttl">Needs attention</span><span className="hm-wk">{top.length}</span></div>
                  {top.map((it,i)=>(<div key={i} style={{display:'flex',gap:8,padding:'6px 0',borderTop:i?'1px solid var(--bdr)':'none',fontSize:12,color:'var(--t2)',lineHeight:1.5}}><span style={{color:it.sev,fontWeight:800}}>&#8226;</span><span>{it.t}</span></div>))}
                </div>
              );
            } catch(e) { return null; }
          })()}
          {(() => {
            // Reorg: compress everything that's FINE into one glanceable strip, so healthy
            // measures don't each take a full card. Reads existing verdicts only; fully fail-safe.
            try {
              const chips = [];
              try { (weekReview && weekReview.items || []).filter(i=>i.verdict==='good').forEach(i=>chips.push(`${i.k} ${i.v}`)); } catch(_){}
              try { const b = bpLog && bpLog[0]; if (b) { const c = bpCategory(b.sys,b.dia); if (c.cls==='green') chips.push('BP normal'); } } catch(_){}
              if (!chips.length) return null;
              return (
                <div className="ar-card">
                  <div className="hm-head"><span className="hm-ttl">On track</span><span className="hm-wk">{chips.length} &#10003;</span></div>
                  <div style={{display:'flex',flexWrap:'wrap',gap:6,marginTop:6}}>
                    {chips.slice(0,8).map((c,i)=><span key={i} style={{fontSize:11,color:'#00e87a',background:'rgba(0,232,122,.1)',border:'1px solid rgba(0,232,122,.3)',borderRadius:6,padding:'3px 8px'}}>{c}</span>)}
                  </div>
                </div>
              );
            } catch(e) { return null; }
          })()}
          {weekReview && (
            <div className="ar-card">
              <div className="hm-head"><span className="hm-ttl">Week in review</span><span className="hm-wk">last 7 days</span></div>
              {weekReview.items.map((it,i)=>(
                <div key={i} className="wr-row">
                  {/* Glyph as well as colour. A coloured dot alone fails for red-green
                      deficiency (~8% of men) and in bright sunlight mid-session. */}
                  <span className={'wr-dot '+it.verdict}>{it.verdict==='good'?'\u2713':it.verdict==='ok'?'!':'\u2715'}</span>
                  <span className="wr-k">{it.k}</span>
                  <span className="wr-v">{it.v}</span>
                  <span className="wr-note">{it.note}</span>
                </div>
              ))}
              <div className="av-note" style={{marginTop:10,marginBottom:0}}>
                {weekReview.misses.length===0
                  ? 'Nothing off-target this week. Hold the line.'
                  : <>Attention: <b>{weekReview.misses.join(', ')}</b>. Fix the highest one first &#8212; the rest often follow.</>}
              </div>
            </div>
          )}
          <div className="grp-head" onClick={()=>toggleGrp('training')}><span className="grp-ttl">Training & volume</span><span className={'sec-chev'+(grpOpen('training')?' op':'')}>▾</span></div>
          {grpOpen('training') && <>

          <div className="hm-card">
            <div className="hm-head"><span className="hm-ttl">Muscle heat map</span><span className="hm-wk">planned · Wk {week}{hvActive?' · HV':''}</span></div>
            <div className="hm-grid">
              {Object.entries(MUSCLES).map(([key,mus])=>{
                // Status is judged on FRACTIONAL (effective) sets — the same basis as the
                // "Volume actually logged" card and as the landmark min/max ranges. Judging
                // planned on direct sets while judging actual on fractional made the two cards
                // contradict each other for muscles with heavy compound carryover (e.g. triceps
                // reading "under" here but "in range" below). Direct is shown as secondary detail.
                const sets=Math.round((plannedVol[key]||0)*10)/10;   // fractional — drives status
                const dsets=Math.round((volParts.dir[key]||0)*10)/10; // direct isolation — detail
                if(sets===0 && mus.optional) return null;
                const c = sets<mus.min?{bg:'rgba(74,158,255,.12)',bd:'rgba(74,158,255,.38)',fg:'#5aa9ff'}:sets>mus.max?{bg:'rgba(212,160,23,.14)',bd:'rgba(212,160,23,.5)',fg:'#e0b020'}:{bg:'rgba(0,232,122,.12)',bd:'rgba(0,232,122,.38)',fg:'#00e87a'};
                return (
                  <div key={key} className="hm-cell" style={{background:c.bg,borderColor:c.bd}}>
                    <div className="hm-mus">{mus.name}</div>
                    <div className="hm-val" style={{color:c.fg}}>{sets<mus.min?'▼ ':sets>mus.max?'▲ ':''}{sets}</div>
                    <div className="hm-rng">{mus.min}-{mus.max} · {dsets} direct</div>
                    <div className="hm-state" style={{color:c.fg}}>{sets<mus.min?'under':sets>mus.max?'over':'in range'}</div>
                  </div>
                );
              })}
            </div>
            <div className="hm-legend"><span><i style={{background:'#5aa9ff'}}/>below floor</span><span><i style={{background:'#00e87a'}}/>in range</span><span><i style={{background:'#e0b020'}}/>overreach</span></div>
          </div>

          {actualVol && actualVol.completedWeeks > 0 && (
            <div className="ar-card">
              <div className="hm-head"><span className="hm-ttl">Volume actually logged</span><span className="hm-wk">avg/wk · {actualVol.completedWeeks} completed wk{actualVol.completedWeeks===1?'':'s'}</span></div>
              <div className="av-note">What you really did, vs what the programme plans. Gaps here are swaps, cut sets or missed sessions.</div>
              {Object.entries(MUSCLES).map(([key,mus])=>{
                const act=actualVol.avg[key]||0, plan=Math.round((plannedVol[key]||0)*10)/10;
                if(act===0 && mus.optional) return null;
                const pctOfPlan = plan>0 ? (act/plan)*100 : 0;
                const col = act<mus.min ? '#5aa9ff' : act>mus.max ? '#e0b020' : '#00e87a';
                return (
                  <div key={key} className="av-row">
                    <span className="av-mus">{mus.name}</span>
                    <div className="av-bar"><div className="av-fill" style={{width:Math.min(100,pctOfPlan)+'%',background:col}}/></div>
                    <span className="av-val" style={{color:col}}>{act<mus.min?'\u25bc':act>mus.max?'\u25b2':'\u2713'} {act}</span>
                    <span className="av-plan">/ {plan}</span>
                  </div>
                );
              })}
            </div>
          )}

          {!(durations && durations.series.length > 1) && (
            <div className="ar-card">
              <div className="hm-head"><span className="hm-ttl">Session length</span><span className="hm-wk">not yet</span></div>
              <div className="av-note" style={{marginBottom:0}}>Needs at least two completed sessions with a recorded duration.</div>
            </div>
          )}
          {durations && durations.series.length > 1 && (
            <div className="ar-card">
              <div className="hm-head"><span className="hm-ttl">Session length</span><span className="hm-wk">last {durations.series.length} · avg {durations.overall} min</span></div>
              <SVGBars items={durations.types.map(t=>({label:t.name.replace('Upper','Up').replace('Lower','Low'),value:t.avg,lo:t.min,hi:t.max,sub:t.n+' sess'}))} color="#4a9eff" height={132} unit="min avg"/>
              {durations.types.map(t=>{
                return (
                  <div key={t.key} className="dur-row">
                    <span className="dur-name">{t.name}</span>
                    <span className="dur-avg">{t.avg}<span className="st-u">min avg</span></span>
                    <span className="dur-rng">{t.min}&ndash;{t.max}</span>
                    {t.planned && <span className="dur-plan">plan {t.planned.replace(' min','')}</span>}
                  </div>
                );
              })}
              {durSplit && (
                <div style={{marginTop:10,paddingTop:9,borderTop:'1px solid var(--bdr)'}}>
                  <div className="mp-hd" style={{marginBottom:6}}>
                    <span className="mp-ttl">Active vs rest &#183; last {durSplit.n}</span>
                    <span className="mp-cals">{durSplit.wall} min wall</span>
                  </div>
                  <div style={{display:'flex',height:10,borderRadius:5,overflow:'hidden',background:'var(--sur)'}}>
                    <div style={{width:(durSplit.wall?durSplit.active/durSplit.wall*100:0)+'%',background:'var(--acc)'}}/>
                    <div style={{width:(durSplit.wall?durSplit.rest/durSplit.wall*100:0)+'%',background:'#4a9eff',opacity:0.6}}/>
                  </div>
                  <div style={{display:'flex',gap:14,marginTop:6,fontSize:10.5,color:'var(--t2)'}}>
                    <span><b style={{color:'var(--acc)'}}>{durSplit.active} min</b> working</span>
                    <span><b style={{color:'#4a9eff'}}>{durSplit.rest} min</b> resting</span>
                  </div>
                  <div className="av-note" style={{marginTop:7,marginBottom:0}}>This is wall-clock time minus logged rest — so it still includes setup, transitions and any unlogged breaks, not just working sets. Read it as session length, not pure effort time. Sessions logged before this was tracked are not included.</div>
                </div>
              )}
              {durations.outliers > 0 && <div className="av-note" style={{marginTop:9,marginBottom:0}}>{durations.outliers} session{durations.outliers===1?'':'s'} over 150 min excluded from averages &#8212; almost certainly paused and resumed rather than genuinely that long.</div>}
            </div>
          )}

          </>}
          <div className="grp-head" onClick={()=>toggleGrp('recovery')}><span className="grp-ttl">Recovery & body</span><span className={'sec-chev'+(grpOpen('recovery')?' op':'')}>▾</span></div>
          {grpOpen('recovery') && <>

          {!recPerf && (
            <div className="ar-card">
              <div className="hm-head"><span className="hm-ttl">Recovery vs performance</span><span className="hm-wk">not yet</span></div>
              <div className="av-note" style={{marginBottom:0}}>Needs logged sessions on days with a WHOOP recovery score, across at least two recovery bands. Keep training and syncing &#8212; this fills in on its own.</div>
            </div>
          )}
          {recPerf && (
            <div className="ar-card">
              <div className="hm-head"><span className="hm-ttl">Recovery vs performance</span><span className="hm-wk">{recPerf.totalSessions} lift-sessions</span></div>
              <div className="av-note">One point per session: WHOOP recovery that morning against mean e1RM relative to each lift's own average. Deloads excluded. Bands mark red / yellow / green.</div>
              {recPerf.points && recPerf.points.length>=3 && (
                <SVGScatter points={recPerf.points} color="#00e87a" height={155}
                  xLabel="recovery %" yLabel="e1RM vs own avg" xMin={0} xMax={100}
                  bands={[{from:0,to:34,color:'#ff4444'},{from:34,to:67,color:'#ffd24a'},{from:67,to:100,color:'#00e87a'}]}/>
              )}
              {[['high','Green (67%+)',recPerf.high,recPerf.highN],['mid','Yellow (34-66%)',recPerf.mid,recPerf.midN],['low','Red (under 34%)',recPerf.low,recPerf.lowN]].map(([k,lbl,v,n])=>(
                <div key={k} className="st-row">
                  <span className="st-name">{lbl}</span>
                  <span className="st-e1">{n} session{n===1?'':'s'}</span>
                  <span className="st-pct" style={{color: v==null?'var(--t3)': v>0.5?'var(--ok)': v<-0.5?'var(--warn)':'var(--t2)', opacity: recPerf.provisional?0.6:1}}>{v==null?'—':(v>0?'+':'')+v+'%'}</span>
                </div>
              ))}
              <div className="av-note" style={{marginTop:9,marginBottom:0}}>
                {recPerf.provisional && <><b>Early signal, not a verdict.</b> Gap is {recPerf.gap>0?'+':''}{recPerf.gap}% so far, but at least {recPerf.minVerdict} sessions in each band are needed before that means anything. Keep logging.</>}
                {recPerf.verdict==='costly' && <>Green days out-perform low days by <b>{recPerf.gap}%</b>. Your recovery score is earning its place &#8212; respecting it is justified.</>}
                {recPerf.verdict==='negligible' && <>Difference is only <b>{recPerf.gap}%</b> &#8212; within noise. On your data, recovery score is <b>not</b> predicting lift performance, which argues for trusting bar speed and RIR over the number.</>}
                {recPerf.verdict==='inverse' && <>Low-recovery days score <b>higher</b> ({recPerf.gap}%). Almost certainly confounding &#8212; likely tren suppressing HRV on days you're actually fresh. Treat the recovery number with caution.</>}
                {!recPerf.verdict && 'Not enough sessions in two recovery bands yet.'}
              </div>
            </div>
          )}

          {!timeOfDay && (
            <div className="ar-card">
              <div className="hm-head"><span className="hm-ttl">Time of day</span><span className="hm-wk">not yet</span></div>
              <div className="av-note" style={{marginBottom:0}}>Needs sessions logged across at least two time bands before start time can be compared.</div>
            </div>
          )}
          {timeOfDay && (
            <div className="ar-card">
              <div className="hm-head"><span className="hm-ttl">Time of day</span><span className="hm-wk">{timeOfDay.total} sessions</span></div>
              <div className="av-note">Mean e1RM by when you actually started, relative to each lift&rsquo;s own average. Bands with fewer than 3 sessions show a count but no score.</div>
              {timeOfDay.bands.map(b=>(
                <div key={b.k} className="st-row">
                  <span className="st-name">{b.label}<span className="dur-plan" style={{display:'block',textAlign:'left',minWidth:0,marginTop:1}}>{b.typical?'typically '+b.typical:b.sub}</span></span>
                  <span className="st-e1">{b.sessions} sess</span>
                  <span className="st-pct" style={{color: b.mean==null?'var(--t3)': b.mean>0.5?'var(--ok)': b.mean<-0.5?'var(--warn)':'var(--t2)'}}>{b.mean==null?'\u2014':(b.mean>0?'+':'')+b.mean+'%'}</span>
                </div>
              ))}
              <div className="av-note" style={{marginTop:9,marginBottom:0}}>
                {timeOfDay.provisional && <><b>Early signal, not a verdict.</b> {timeOfDay.better.label} is ahead by {timeOfDay.gap}% so far, but moving your training slot is a real change &#8212; it needs {timeOfDay.minVerdict}+ sessions in each band first ({timeOfDay.better.label} has {timeOfDay.better.sessions}, {timeOfDay.worse.label} has {timeOfDay.worse.sessions}).</>}
                {timeOfDay.verdict==='clear' && <><b>{timeOfDay.better.label}</b> out-performs <b>{timeOfDay.worse.label}</b> by <b>{timeOfDay.gap}%</b> across your two most-used slots. Put your hardest sessions there where life allows.</>}
                {timeOfDay.verdict==='nodiff' && <>Only <b>{timeOfDay.gap}%</b> between your two most-used slots &#8212; within noise. Train whenever adherence is easiest; consistency beats the clock.</>}
                {!timeOfDay.verdict && 'Need 3+ sessions in at least two bands before comparing.'}
              </div>
            </div>
          )}

          {!alcoholImpact && (
            <div className="ar-card">
              <div className="hm-head"><span className="hm-ttl">Alcohol vs lifting</span><span className="hm-wk">not yet</span></div>
              <div className="av-note" style={{marginBottom:0}}>Needs alcohol units logged in Body &#8594; Context Flags, plus sessions on both drinking and clear days.</div>
            </div>
          )}
          {alcoholImpact && (
            <div className="ar-card">
              <div className="hm-head"><span className="hm-ttl">Alcohol vs lifting</span><span className="hm-wk">{alcoholImpact.drinkDays} day{alcoholImpact.drinkDays===1?'':'s'} logged</span></div>
              <div className="av-note">Sessions on a drinking day or the day after, vs clear days. Deloads excluded.</div>
              {[['clear','Clear days'],['after','Within 24h of alcohol']].map(([k,lbl])=>{
                const b = alcoholImpact[k];
                if (!b) return null;
                return (
                  <div key={k} className="st-row">
                    <span className="st-name">{lbl}</span>
                    <span className="st-e1">{b.sessions} session{b.sessions===1?'':'s'}</span>
                    <span className="st-pct" style={{color: b.mean==null?'var(--t3)': b.mean>0.5?'var(--ok)': b.mean<-0.5?'var(--warn)':'var(--t2)'}}>{b.mean==null?'\u2014':(b.mean>0?'+':'')+b.mean+'%'}</span>
                  </div>
                );
              })}
              <div className="av-note" style={{marginTop:9,marginBottom:0}}>
                {alcoholImpact.provisional && <><b>Early signal, not a verdict.</b> Difference is {alcoholImpact.gap>0?'+':''}{alcoholImpact.gap}% so far ({alcoholImpact.after.sessions} sessions after drinking vs {alcoholImpact.clear.sessions} clear). Needs {alcoholImpact.minVerdict}+ in each before drawing a conclusion.</>}
                {alcoholImpact.verdict==='costly' && <>Lifting is <b>{Math.abs(alcoholImpact.gap)}%</b> down within 24h of drinking. That is your own data, not a general claim &#8212; worth weighing against training days.</>}
                {alcoholImpact.verdict==='negligible' && <>Difference is <b>{Math.abs(alcoholImpact.gap)}%</b> &#8212; within noise at this sample size. Note that alcohol affects sleep, recovery and protein synthesis whether or not the bar notices.</>}
                {alcoholImpact.verdict==='inverse' && <>Sessions after drinking score <b>higher</b>, which is almost certainly confounding (weekend sessions, more rest beforehand) rather than a real effect.</>}
                {!alcoholImpact.verdict && 'Need at least 3 sessions in each group to compare.'}
              </div>
            </div>
          )}

          {painTrend && painTrend.flagged.length > 0 && (
            <div className="ar-card">
              <div className="hm-head"><span className="hm-ttl">Joint pain by lift</span><span className="hm-wk">{painTrend.overallRate}% of exercise-sessions</span></div>
              <div className="av-note">Which lifts repeatedly produce pain. One niggle is noise; a lift flagging most sessions is telling you to change the movement, not push through it.</div>
              {painTrend.flagged.slice(0,8).map(p=>(
                <div key={p.id} className="st-row">
                  <span className="st-name">{p.name}{p.severity==='sharp'&&<span className="h-pain sharp" style={{marginLeft:6}}>sharp</span>}</span>
                  <span className="st-e1">{p.painCount}/{p.sessions}</span>
                  <span className="st-pct" style={{color: p.rate>=60?'var(--err)':p.rate>=30?'var(--warn)':'var(--t2)'}}>{p.rate}%</span>
                  <span className="dur-plan" style={{color: p.dir==='worsening'?'var(--err)':p.dir==='improving'?'var(--ok)':'var(--t3)'}}>{p.dir==='worsening'?'▲ worse':p.dir==='improving'?'▼ better':'→ flat'}</span>
                </div>
              ))}
              <div className="av-note" style={{marginTop:9,marginBottom:0}}>Anything sharp, or over 60% and worsening, should be swapped for a variation rather than loaded through. Persistent joint pain is worth raising with a physio.</div>
            </div>
          )}

          {trainLoad && trainLoad.weeksOfData >= 2 && (
            <div className="ar-card">
              <div className="hm-head"><span className="hm-ttl">Training load</span><span className="hm-wk">weekly tonnage</span></div>
              <SVGChart data={trainLoad.series.map(b=>({x:b.weeksAgo===0?'now':b.weeksAgo+'w',y:Math.round(b.tonnage/1000)}))} height={110} color="#a479e2"/>
              <div className="st-row"><span className="st-name">This week</span><span className="st-e1">{Math.round(trainLoad.acute/1000)}k kg</span><span className="st-pct" style={{color:'var(--t2)'}}>{trainLoad.series[trainLoad.series.length-1].sessions} sess</span></div>
              {trainLoad.chronic!=null && <div className="st-row"><span className="st-name">4-week average</span><span className="st-e1">{Math.round(trainLoad.chronic/1000)}k kg</span><span className="st-pct" style={{color: trainLoad.verdict==='spike'?'var(--warn)':trainLoad.verdict==='drop'?'var(--inf)':'var(--ok)'}}>{trainLoad.ratio}&#215;</span></div>}
              <div className="av-note" style={{marginTop:9,marginBottom:0}}>
                {trainLoad.verdict==='spike' && <>This week is <b>{trainLoad.ratio}&#215;</b> your recent norm &#8212; a sharp jump. Not inherently bad, but pair it with a genuinely easier week rather than stacking another.</>}
                {trainLoad.verdict==='drop' && <>This week is <b>{trainLoad.ratio}&#215;</b> your recent norm. Fine if deliberate (deload, illness, travel); worth a look if not.</>}
                {trainLoad.verdict==='steady' && <>Load is steady at <b>{trainLoad.ratio}&#215;</b> your 4-week norm &#8212; consistent progression rather than lurching.</>}
                {!trainLoad.verdict && 'Need a few more weeks before the ratio means anything.'}
                <br/><span style={{color:'var(--t3)'}}>Descriptive only. Acute:chronic ratios were popularised for injury prediction and that claim has not held up well &#8212; read this as &quot;load vs my norm&quot;, not a risk score.</span>
              </div>
            </div>
          )}

          {stalls && stalls.total > 0 && (
            <div className="ar-card">
              <div className="hm-head"><span className="hm-ttl">Stalled lifts</span><span className="hm-wk">{stalls.stalled.length} of {stalls.total}</span></div>
              {stalls.stalled.length > 0 ? (<>
              <div className="av-note">Best e1RM in the last 2 sessions vs the sessions before. Deloads excluded. Under 1% improvement = stalled.</div>
              {stalls.stalled.slice(0,8).map(s=>(
                <div key={s.id} className="st-row">
                  <span className="st-name">{s.name}<span className="dur-plan" style={{display:'block',textAlign:'left',minWidth:0,marginTop:1}}>{s.sessionsSincePeak>0?s.sessionsSincePeak+' since peak · now '+s.lastE1rm+'kg vs '+s.peakE1rm+'kg peak':'at peak'}</span></span>
                  <span className="st-e1">{s.bestRecent}<span className="st-u">kg e1RM</span></span>
                  <span className="st-pct" style={{color: s.pct < -2 ? 'var(--err)' : 'var(--warn)'}}>{s.pct>0?'+':''}{s.pct}%</span>
                </div>
              ))}
              <div className="av-note" style={{marginTop:9,marginBottom:0}}>Fixes: drop to a back-off set and rebuild, change the rep range, swap to a fresh variation, or check recovery and sleep for that muscle. <b>On a cut a stall is often a win</b> — holding load while losing weight is retention. Act only if a lift stalls <b>and</b> bodyweight is stable.</div>
              </>) : (
                <div className="av-note" style={{marginBottom:0}}>No stalled lifts — everything with enough history is still progressing.</div>
              )}
            </div>
          )}

          {stalls && stalls.progressing.length > 0 && (
            <div className="ar-card">
              <div className="hm-head"><span className="hm-ttl">Progressing</span><span className="hm-wk">{stalls.progressing.length} lift{stalls.progressing.length===1?'':'s'}</span></div>
              {stalls.progressing.slice(0,6).map(s=>(
                <div key={s.id} className="st-row">
                  <span className="st-name">{s.name}</span>
                  <span className="st-e1">{s.bestRecent}<span className="st-u">kg e1RM</span></span>
                  <span className="st-pct" style={{color:'var(--ok)'}}>+{s.pct}%</span>
                </div>
              ))}
            </div>
          )}

          {burnCheck && (
            <div className="ar-card">
              <div className="hm-head"><span className="hm-ttl">Burn cross-check</span><span className="hm-wk">WHOOP vs empirical</span></div>
              <div style={{display:'flex',alignItems:'baseline',gap:10,marginBottom:6,fontFamily:"'JetBrains Mono',monospace"}}>
                <span style={{fontSize:22,fontWeight:700,color:'var(--t)'}}>{burnCheck.avg}</span>
                <span style={{fontSize:12,color:'var(--t3)'}}>WHOOP</span>
                <span style={{fontSize:22,fontWeight:700,color:'var(--acc)'}}>{burnCheck.tdee}</span>
                <span style={{fontSize:12,color:'var(--t3)'}}>empirical</span>
              </div>
              <div style={{fontSize:12,lineHeight:1.5,color:burnCheck.agree?'var(--ok)':'var(--warn)'}}>
                {burnCheck.agree
                  ? `Within ${Math.abs(burnCheck.gap)} kcal across ${burnCheck.days} completed days — the two independent methods agree, so treat the maintenance figure as solid.`
                  : `${burnCheck.gap>0?'WHOOP reads '+burnCheck.gap+' kcal HIGHER':'WHOOP reads '+Math.abs(burnCheck.gap)+' kcal LOWER'} than your intake-vs-weight maintenance across ${burnCheck.days} days. Trust the empirical figure — it is derived from what actually happened to your weight. Wearable burn estimates are commonly out by 10-20%.`}
              </div>
              <div className="ar-note">Uses only completed WHOOP cycles (true full-day burns), never the in-progress cycle. Needs 5+ complete days, so it fills in over the next week.</div>
            </div>
          )}
          {deloadRebound && (
            <div className="ar-card">
              <div className="hm-head"><span className="hm-ttl">Deload rebound</span><span className="hm-wk">week after vs week before</span></div>
              <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:30,fontWeight:700,color:deloadRebound.avg>=1?'var(--ok)':deloadRebound.avg<=-1?'var(--err)':'var(--t2)',marginBottom:6}}>
                {deloadRebound.avg>0?'+':''}{deloadRebound.avg}%
              </div>
              <div style={{fontSize:12,lineHeight:1.5,color:'var(--t2)',marginBottom:8}}>
                {deloadRebound.avg>=1?'Your deloads are paying off — strength comes back higher than it went in. Keep taking them.'
                 :deloadRebound.avg<=-1?'Strength is coming back LOWER after deloads. Either the deload is too deep, or you were not fatigued enough to need it. Consider training through the next one.'
                 :'Flat. Deloads are neither helping nor hurting measurably yet — more events needed before this is decisive.'}
              </div>
              <div className="ar-list">
                {deloadRebound.events.map((e,i)=>(
                  <div key={i} className="ar-row">
                    <span className="ar-mus" style={{textTransform:'none'}}>Block {e.block} · wk {e.week}</span>
                    <span className={`ar-chip ${e.pct>=1?'add':e.pct<=-1?'back':'hold'}`}>{e.pct>0?'+':''}{e.pct}% · {e.before}→{e.after}kg</span>
                  </div>
                ))}
              </div>
              <div className="ar-note">Compares best e1RM on tracked compounds the week after each deload against the week before it. Needs logged sessions either side, so it fills in as blocks complete. Deload weeks themselves are excluded.</div>
            </div>
          )}
          {rirDrift && (
            <div className="ar-card">
              <div className="hm-head"><span className="hm-ttl">RIR drift</span><span className="hm-wk">logged vs prescribed</span></div>
              <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:30,fontWeight:700,color:Math.abs(rirDrift.avg)<=0.5?'var(--ok)':rirDrift.avg>0.5?'var(--warn)':'var(--inf)',marginBottom:6}}>
                {rirDrift.avg>0?'+':''}{rirDrift.avg}
              </div>
              <div style={{fontSize:12,lineHeight:1.5,color:'var(--t2)',marginBottom:8}}>
                {Math.abs(rirDrift.avg)<=0.5?'Logged effort matches the prescription. Your RIR targets are being hit honestly.'
                 :rirDrift.avg>0.5?'You are logging further from failure than the effective target by about '+rirDrift.avg.toFixed(1)+' reps. That can be right (pain, technique, a protected lift) — but if not, push closer or check you are not carrying a wrong default RIR.'
                 :'You are training HARDER than prescribed by about '+Math.abs(rirDrift.avg).toFixed(1)+' reps. Fine occasionally; sustained, it accumulates fatigue faster than the block plans for.'}
              </div>
              <div className="ar-list">
                {rirDrift.rows.slice(-6).map((r,i)=>(
                  <div key={i} className="ar-row">
                    <span className="ar-mus" style={{textTransform:'none'}}>Week {r.week} <span style={{color:'var(--t3)'}}>(target {r.target}, {r.n} sets)</span></span>
                    <span className={`ar-chip ${Math.abs(r.drift)<=0.5?'hold':r.drift>0.5?'back':'load'}`}>{r.drift>0?'+':''}{r.drift}</span>
                  </div>
                ))}
              </div>
              <div className="ar-note">Positive = logging more reps in reserve than programmed. Negative = training closer to failure than programmed. Deload weeks are compared against their own target, and trained-through weeks against 1-2 RIR.</div>
            </div>
          )}
          {strengthRet && (() => {
            const wrate = bwRate ? bwRate.perWeek : null;
            const losing = wrate != null && wrate < -0.1;
            const gaining = wrate != null && wrate > 0.1;
            const sHeld = strengthRet.avgPct >= -1.5;
            const sUp = strengthRet.avgPct > 1.5;
            let verdict, vCls;
            if (losing && sHeld) { verdict = sUp ? 'Losing weight while strength climbs — consistent with recomp. Strong signal, though estimated strength and scale mass are both noisy.' : 'Weight down, strength broadly held — consistent with retaining muscle and losing mostly fat. Not proof, but a good sign. Stay the course.'; vCls='var(--ok)'; }
            else if (losing && !sHeld) { verdict = 'Weight AND strength dropping — you may be losing muscle. Check protein, sleep, and consider easing the deficit.'; vCls='var(--err)'; }
            else if (gaining && sUp) { verdict = 'Weight and strength both up — consistent with a productive gain phase.'; vCls='var(--ok)'; }
            else if (!losing && !gaining && sUp) { verdict = 'Weight flat, strength up — consistent with a slow recomp.'; vCls='var(--ok)'; }
            else if (!losing && !gaining && !sHeld) { verdict = 'Weight flat but strength slipping — look at recovery and fuel around sessions.'; vCls='var(--warn)'; }
            else { verdict = 'Strength holding. Keep watching the trend.'; vCls='var(--t2)'; }
            return (
              <div className="ar-card">
                <div className="hm-head"><span className="hm-ttl">Strength retention</span><span className="hm-wk">21d vs prior 21d · e1RM</span></div>
                <div style={{display:'flex',alignItems:'baseline',gap:10,marginBottom:6}}>
                  <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:30,fontWeight:700,color:strengthRet.avgPct>=-1.5?'var(--ok)':'var(--err)'}}>{strengthRet.avgPct>0?'+':''}{strengthRet.avgPct}%</span>
                  {wrate!=null && <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:12,color:'var(--t2)'}}>weight {wrate>0?'+':''}{wrate.toFixed(2)} kg/wk</span>}
                </div>
                <div style={{fontSize:12,lineHeight:1.5,color:vCls,marginBottom:8}}>{verdict}</div>
                <div className="ar-list">
                  {strengthRet.lifts.map((l,i)=>(
                    <div key={i} className="ar-row">
                      <span className="ar-mus" style={{textTransform:'none'}}>{l.name}</span>
                      <span className={`ar-chip ${l.pct>=1?'add':l.pct<=-2?'back':'hold'}`}>{l.pct>0?'+':''}{l.pct}% · {l.prior}→{l.recent}kg</span>
                    </div>
                  ))}
                </div>
                <div className="ar-note">On a cut, holding e1RM while weight falls is consistent with losing mostly fat and retaining muscle (not proof — strength estimates are noisy). A drop bigger than ~2-3% across several lifts over 3 weeks is the earliest reliable sign the deficit is costing muscle.</div>
              </div>
            );
          })()}
          <div className="ar-card">
            <div className="hm-head"><span className="hm-ttl">Autoregulation</span><span className="hm-wk">push when earned</span></div>
            <div className="ar-list">
              {Object.entries(MUSCLES).map(([key,mus])=>{
                const a=autoReg[key]; if(!a) return null;
                return (
                  <div key={key} className="ar-row">
                    <span className="ar-mus">{mus.name}</span>
                    <span className={`ar-chip ${a.cls}`}>{a.label}</span>
                  </div>
                );
              })}
            </div>
            <div className="ar-note">Add freely on isolation work while a muscle is progressing and recovery holds - no ceiling. Push compounds with load, not sets. Stop adding when a muscle stalls 2 sessions. Health markers override: red recovery or rising BP means hold regardless.</div>
          </div>
          </>}
          <div className="grp-head" onClick={()=>toggleGrp('detail')}><span className="grp-ttl">Detail & coach review</span><span className={'sec-chev'+(grpOpen('detail')?' op':'')}>▾</span></div>
          {grpOpen('detail') && <>

          <div className="mv-sec">
            <div className="mv-head">
              <span className="mv-ttl">Weekly Volume</span>
              <span className="mv-wk">B{block} · Wk {week}</span>
            </div>
            <div className="mv-sub">Hard sets per muscle this week vs hypertrophy target range</div>
            {Object.keys(curVol).length === 0 ? (
              <div className="mv-empty">No sets logged for Week {week} yet.<br/>Complete a session to see your volume.</div>
            ) : (
              Object.entries(MUSCLES).map(([key, mus]) => {
                const done = Math.round((curVol[key] || 0) * 10) / 10;
                if (done === 0 && mus.optional) return null;
                const status = done < mus.min ? 'low' : done > mus.max ? 'high' : 'ok';
                const pct = Math.min(done / mus.max, 1) * 100;
                const tag = status === 'low' ? 'Low' : status === 'high' ? 'High' : 'On target';
                return (
                  <div key={key} className="mv-row">
                    <div className="mv-row-top">
                      <span className="mv-name">{mus.name}</span>
                      <span className="mv-count"><b>{done}</b> / {mus.min}-{mus.max}<span className={`mv-tag ${status}`}>{tag}</span></span>
                    </div>
                    <div className="mv-track"><div className={`mv-fill ${status}`} style={{width: pct + '%'}}/></div>
                  </div>
                );
              })
            )}
            <div style={{marginTop:16}}>
              <div className="chart-lbl">Weekly hard sets — trend</div>
              <select className="ex-sel mv-trend-sel" value={volMuscle} onChange={e => setVolMuscle(e.target.value)}>
                <option value="all">All muscles (total)</option>
                {Object.entries(MUSCLES).map(([k, m]) => <option key={k} value={k}>{m.name}</option>)}
              </select>
              {volSeries.length > 1
                ? <SVGChart data={volSeries} height={130}/>
                : <div className="mv-empty">Log at least two weeks to see the trend.</div>}
            </div>
          </div>
          <div className="rec-trend-sec">
            <div className="mv-head">
              <span className="mv-ttl">Recovery & Fatigue</span>
              <span className="mv-wk">WHOOP</span>
            </div>
            {whoopHistory.length < 2 ? (
              <div className="mv-empty">{whoopConnected ? 'Building your recovery trend — check back after a few more days of WHOOP data.' : 'Connect WHOOP on the Program tab to track recovery and fatigue.'}</div>
            ) : (
              <>
                <div className={`deload-card ${deloadInfo.level}`}>
                  <div className="deload-lbl">{deloadInfo.level==='deload'?'Deload Recommended':deloadInfo.level==='moderate'?'Watch Fatigue':deloadInfo.level==='fresh'?'Recovered':'Building Data'}</div>
                  <div className="deload-msg">{deloadInfo.msg}</div>
                  {deloadInfo.rRec!=null && deloadInfo.bRec!=null && (
                    <div className="deload-stats">7-day recovery {deloadInfo.rRec}% vs {deloadInfo.bRec}% baseline{deloadInfo.rHrv!=null?` \u00b7 HRV ${deloadInfo.rHrv} vs ${deloadInfo.bHrv}ms`:''}</div>
                  )}
                </div>
                <div className="chart-lbl" style={{marginTop:14}}>Recovery — last {Math.min(whoopHistory.length,30)} readings</div>
                <SVGChart data={whoopHistory.slice(-30).map(h=>({x:h.date.slice(5),y:h.recovery,t:new Date(h.date).getTime()}))} height={120} color="#00e87a" trend={true} events={chartEvents}/>
                {whoopHistory.filter(h=>h.hrv!=null).length>1 && (
                  <>
                    <div className="chart-lbl" style={{marginTop:12}}>HRV trend (ms)</div>
                    <SVGChart data={whoopHistory.slice(-30).filter(h=>h.hrv!=null).map(h=>({x:h.date.slice(5),y:h.hrv,t:new Date(h.date).getTime()}))} height={110} color="#4a9eff"/>
                  </>
                )}
                {(() => {
                  // Sleep and body-signal trends from the per-day WHOOP history. Display only: like
                  // every readiness signal, nothing here changes the workout.
                  try {
                    const H = whoopHistory.slice(-30);
                    const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
                    const series = k => H.filter(h => h && Number.isFinite(h[k])).map(h => ({ x: h.date.slice(5), y: h[k], t: new Date(h.date).getTime() }));
                    const cmp = k => {
                      const v = H.filter(h => h && Number.isFinite(h[k]));
                      if (v.length < 5) return null;
                      const base = v.slice(0, -7).map(h => h[k]);
                      return { now: avg(v.slice(-7).map(h => h[k])), base: base.length >= 3 ? avg(base) : null };
                    };
                    const metrics = [
                      ['sleepHrs', 'Sleep', 'h', 1, '#a479e2'],
                      ['rhr', 'Resting HR', ' bpm', 0, '#ff6b6b'],
                      ['skinTemp', 'Skin temp', '\u00b0C', 1, '#e0b020'],
                      ['spo2', 'SpO\u2082', '%', 1, '#4a9eff'],
                      ['respRate', 'Resp. rate', ' rpm', 1, '#00e87a'],
                    ].map(([k, label, unit, dp, color]) => ({ k, label, unit, dp, color, data: series(k), c: cmp(k) }))
                     .filter(m => m.data.length >= 3);
                    if (!metrics.length) return null;
                    const st = H.filter(h => h && Number.isFinite(h.skinTemp));
                    let tempUp = null;
                    if (st.length >= 10) {
                      const d = avg(st.slice(-3).map(h => h.skinTemp)) - avg(st.slice(0, -3).map(h => h.skinTemp));
                      if (d >= 0.5) tempUp = d.toFixed(1);
                    }
                    return (
                      <>
                        <div className="chart-lbl" style={{ marginTop: 16 }}>Sleep and body signals (last 30 days)</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))', gap: 6, margin: '6px 0 4px' }}>
                          {metrics.map(m => {
                            const delta = m.c && m.c.base != null ? m.c.now - m.c.base : null;
                            return (
                              <div key={m.k} style={{ background: 'var(--sur)', border: '1px solid var(--bdr)', borderRadius: 8, padding: '7px 8px' }}>
                                <div style={{ fontSize: 10, color: 'var(--t3)' }}>{m.label} &#183; 7-day</div>
                                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 14, fontWeight: 700, color: m.color }}>{m.c ? m.c.now.toFixed(m.dp) + m.unit : '-'}</div>
                                <div style={{ fontSize: 10, color: 'var(--t3)' }}>{delta != null ? (delta >= 0 ? '+' : '') + delta.toFixed(m.dp) + ' vs before' : 'building baseline'}</div>
                              </div>
                            );
                          })}
                        </div>
                        {tempUp && <div style={{ fontSize: 11, color: '#e0b020', lineHeight: 1.5, margin: '6px 0' }}>Skin temp is {tempUp}&#176;C above your baseline over the last 3 days. That often comes before illness, or after very hard training. It is a prompt to check in with yourself, not a diagnosis.</div>}
                        {metrics.map(m => (
                          <React.Fragment key={m.k}>
                            <div className="chart-lbl" style={{ marginTop: 10 }}>{m.label} ({m.unit.trim()})</div>
                            <SVGChart data={m.data} height={90} color={m.color} />
                          </React.Fragment>
                        ))}
                      </>
                    );
                  } catch (e) { try { console.error('whoop trends failed', e); } catch (_) {} return null; }
                })()}
                {recFuelReady && (
                  <>
                    <div className="chart-lbl" style={{marginTop:14}}>Recovery vs fuel &#8212; last {recFuelRows.filter(r=>r.recovery!=null).length} days</div>
                    <div style={{fontSize:10,color:'var(--t3)',marginBottom:4}}>Green/amber/red dots = recovery. Blue bars = calories in. Read it yourself: do low-recovery days follow low-fuel or low-sleep days?</div>
                    <RecoveryFuelStrip rows={recFuelRows} height={150}/>
                  </>
                )}
              </>
            )}
          </div>
          {logs.length >= 1 && (
            <div className="period-sec">
              <div className="mv-head"><span className="mv-ttl">Coach Review</span></div>
              <div className="mv-sub">Zoom out &#8212; let the AI coach review your week or the whole block</div>
              <div className="period-btns">
                <button className="period-btn" onClick={() => getPeriodReview('week')} disabled={periodLoading}>{periodLoading && periodScope==='week' ? 'Reviewing\u2026' : 'Weekly Check-in'}</button>
                <button className="period-btn" onClick={() => getPeriodReview('block')} disabled={periodLoading}>{periodLoading && periodScope==='block' ? 'Reviewing\u2026' : 'End-of-Block Review'}</button>
              </div>
              {periodReview && <div className="period-out">{periodReview}</div>}
            </div>
          )}
          <div className="ex-sel-wrap">
            <div className="ex-sel-lbl">Select Exercise</div>
            <select className="ex-sel" value={progEx||''} onChange={e=>setProgEx(e.target.value)}>
              <option value="">Choose an exercise</option>
              {ALL_EX.map(e => <option key={e.id} value={e.id}>{e.name} ({e.session})</option>)}
            </select>
          </div>
          {progEx && progChartData.length > 1 && (
            <>
              <div className="metric-tog">
                {[['e1rm','Est. 1RM'],['weight','Top set'],['volume','Volume']].map(([m,lbl])=>(
                  <button key={m} className={`mtog-btn${progMetric===m?' on':''}`} onClick={()=>setProgMetric(m)}>{lbl}</button>
                ))}
              </div>
              <div className="chart-area">
                <div className="chart-lbl">{_metricLbl}</div>
                <SVGChart data={progChartData} height={130}/>
              </div>
              <div className="pstats">
                <div className="pst"><div className="pst-v">{prWeight}{_unit}</div><div className="pst-l">{_prLbl}</div></div>
                <div className="pst"><div className="pst-v">{lastWeight}{_unit}</div><div className="pst-l">Last Session</div></div>
                <div className="pst"><div className="pst-v">{progChartData.length}</div><div className="pst-l">Sessions</div></div>
              </div>
            </>
          )}
          {progEx && (
            <div className="prog-hist">
              {progHist.length===0
                ? <div className="no-data">No data yet.<br/>Log a session to see progress.</div>
                : progHist.map((h,i) => (
                    <div key={i} className="ph-row">
                      <span className="ph-dt">{fmtShort(h.date)}</span>
                      <div className="ph-sets">{h.sets.map((s,j) => <span key={j} className="ph-s">{s.weight}&#215;{s.reps}</span>)}</div>
                    </div>
                  ))
              }
            </div>
          )}
          {!progEx && <div className="empty-msg">Select an exercise above to see your progression chart and history.</div>}
          {movementPRs.length > 0 && (
            <div style={{marginTop:16,background:'var(--crd)',border:'1px solid var(--bdr)',borderRadius:12,padding:14}}>
              <div style={{fontSize:14,fontWeight:800,color:'var(--t)',marginBottom:2}}>Lifetime movement PRs</div>
              <div style={{fontSize:11,color:'var(--t3)',lineHeight:1.5,marginBottom:10}}>Best estimated 1RM for each movement, pooled across every programme slot it appears in. Read-only &#183; this does not change any session prescription.</div>
              {movementPRs.map((m,i)=>(
                <div key={i} style={{display:'flex',alignItems:'baseline',gap:8,padding:'6px 0',borderTop:i?'1px solid var(--bdr)':'none'}}>
                  <span style={{flex:1,fontSize:13,color:'var(--t)',fontWeight:600}}>{m.name}</span>
                  <span style={{fontSize:13,color:'var(--acc)',fontWeight:800,fontFamily:"'JetBrains Mono',monospace"}}>{m.bestE1RM}kg</span>
                  <span style={{fontSize:10,color:'var(--t3)',minWidth:118,textAlign:'right',fontFamily:"'JetBrains Mono',monospace"}}>{m.sessions} sess &#183; {fmtShort(m.lastDate)}</span>
                </div>
              ))}
            </div>
          )}
          </>}
        </div>
      );
}
