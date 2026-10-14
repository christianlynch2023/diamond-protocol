// ProgramView: moved out of App.jsx in Phase 2b. Behaviour unchanged.
import React from 'react';
import { useApp } from '../appContext';
import { DEF_INTS, DLW, SESSIONS } from '../data/programme';

export default function ProgramView() {
  const {
    allDone, bannerColor, bannerName, block, clearWip, deloadActive, deloadInfo, doneToday, fmtAgo,
    getWhoopCls, goalPhase, highVol, isDeload, logs, readiness, recovery, resumeWorkout, scheduledDeload,
    setActiveInts, setDeloadSkips, setNewBlockConfirm, setSel, setView, showInt, userSetHighVol,
    userSetPhase, userSetRecovery, userSetWeek, week, whoopConnected, whoopData, whoopLoading, wipData,
    wr
  } = useApp();
  return (
        <div className="screen">
          <div className="topbar"><span className="logo">Diamond Protocol</span><span className="top-badge">B{block} · W{week}/12</span></div>
          <div className={`phase-bar ${bannerColor}`}>
            <div><div className="ph-name">{bannerName}</div><div className="ph-sub">{isDeload?"~40-50% volume · 85% load · 3-4 RIR":(scheduledDeload && !deloadActive)?"Base volume, full load \u2014 ramp resets this week":showInt?"Intensifiers active, selective failure":"Straight sets only, no failure"}</div></div>
            <div className="rir-val">{wr.rir}</div>
          </div>
          <div className="wksel">
            <button className="wkb" disabled={week===1} onClick={() => userSetWeek(w=>Math.max(1,w-1))}>&#8249;</button>
            <div><div className="wknum">{week}</div><div className="wksub">Block {block} · of 12</div></div>
            <button className="wkb" disabled={week===12} onClick={() => userSetWeek(w=>Math.min(12,w+1))}>&#8250;</button>
          </div>
          <div className="grid12">
            {Array.from({length:12},(_,i) => {
              const w2=i+1;
              const ws=new Set(logs.filter(l=>l.week===w2 && (l.block||1)===block).map(l=>l.sessionId));
              const cls=w2===week?'cur':ws.size>=4?'all':ws.size>0?'part':DLW.has(w2)?'dl':'';
              return <div key={w2} className={`wc ${cls}`} onClick={() => userSetWeek(w2)}><span className="wc-n">{w2}</span></div>;
            })}
          </div>
          {allDone && week < 12 && (
            <div className="adv-banner">
              <span className="adv-txt">All 4 sessions done — Week {week} complete</span>
              <button className="adv-btn" onClick={() => userSetWeek(w=>Math.min(12,w+1))}>Week {week+1} &#8250;</button>
            </div>
          )}
          {allDone && week === 12 && (
            <div className="adv-banner">
              <span className="adv-txt">Block {block} complete — nice work</span>
              <button className="adv-btn" onClick={() => setNewBlockConfirm(true)}>Start Block {block+1} &#8250;</button>
            </div>
          )}
          {!(allDone && week === 12) && (
            <button className="newblock-btn" onClick={() => setNewBlockConfirm(true)}>&#8635; Start a new block</button>
          )}
          <div className="rec-sec">
            <div className="sec-lbl">Goal Phase</div>
            <div className="rec-row">
              {[['bulk','Bulk'],['maintain','Maintain'],['cut','Cut']].map(([p,lbl])=>(
                <button key={p} className={`rc${goalPhase===p?' nm':''}`} onClick={()=>userSetPhase(p)}>{lbl}</button>
              ))}
            </div>
          </div>
          <div className="rec-sec">
            <div className="sec-lbl">High-Volume Track</div>
            <div className="rec-row">
              <button className={`rc${!highVol?' nm':''}`} onClick={()=>userSetHighVol(false)}>Off</button>
              <button className={`rc${highVol?' nm':''}`} onClick={()=>userSetHighVol(true)}>On</button>
            </div>
            <div className="hv-sub">{!highVol ? 'Standard volume' : DLW.has(week) ? 'Paused \u00b7 deload week' : goalPhase==='cut' ? 'Paused \u00b7 cut phase' : 'Active \u00b7 +1 set on priority muscles'}</div>
          </div>
          {wipData && (
            <div className="resume-box">
              <div className="rb-title">Resume workout?</div>
              <div className="rb-sub">Unfinished {SESSIONS[wipData.sessionId]?.name} session.</div>
              <div className="rb-btns">
                <button className="rb-btn p" onClick={resumeWorkout}>Resume</button>
                <button className="rb-btn g" onClick={clearWip}>Discard</button>
              </div>
            </div>
          )}
          <div className="rec-sec">
            <div className="sec-lbl">Recovery Status</div>
            <div className="rec-row">
              {[['excellent','ok','Excellent'],['normal','nm','Normal'],['beat','bt','Beat Up']].map(([k,cls,label]) => (
                <button key={k} className={`rc${recovery===k?' '+cls:''}`} onClick={() => userSetRecovery(k)}>{label}</button>
              ))}
            </div>
          </div>
          {scheduledDeload && (
            <div className="rec-sec">
              <div className="sec-lbl">Scheduled Deload</div>
              <div className="rec-row">
                <button className={`rc${deloadActive?' bt':''}`} onClick={()=>setDeloadSkips(m=>({...m,[block+'-'+week]:false}))}>Take deload</button>
                <button className={`rc${!deloadActive?' nm':''}`} onClick={()=>setDeloadSkips(m=>({...m,[block+'-'+week]:true}))}>Train through</button>
              </div>
              <div className="hv-sub">{deloadActive?'~40-50% volume · 85% load · 3-4 RIR':'Training through · base volume, full load & 1-2 RIR · ramp resets'}</div>
            </div>
          )}
          {isDeload && <div className="info-banner warn">Deload week — sets roughly halved (floored, so odd-set lifts drop a little more)</div>}
          {recovery==='beat' && <div className="info-banner err">Beat up — drop volume 25-40%, skip intensifiers</div>}
          {whoopConnected && deloadInfo.level==='deload' && <div className="info-banner err">Fatigue rising across your WHOOP data — a deload is recommended. See Progress.</div>}
          {/* WHOOP Biometrics */}
          {whoopConnected ? (
            <div className={`whoop-panel${whoopData?.recovery!=null?' '+getWhoopCls(whoopData.recovery):''}`}>
              <div className="whoop-hdr">
                <span className="whoop-nm">WHOOP{whoopData?.recovery!=null&&<span className={`whoop-auto-badge ${getWhoopCls(whoopData.recovery)}`} style={{marginLeft:8}}>{whoopData.recovery>=67?'Green':whoopData.recovery>=34?'Yellow':'Red'}</span>}</span>
                <span className="whoop-sync">{whoopLoading?'Syncing...':fmtAgo(whoopData?.cachedAt)}</span>
              </div>
              {whoopLoading&&!whoopData?<div className="whoop-loading">Loading recovery data...</div>
              :whoopData?.recovery!=null?(
                <div className="whoop-body">
                  <div className="wr-block">
                    <div className={`wr-score ${getWhoopCls(whoopData.recovery)}`}>{whoopData.recovery}%</div>
                    <div className="wr-lbl">Recovery</div>
                  </div>
                  <div className="whoop-stats">
                    {whoopData.hrv!=null&&<div className="wst"><div className="wst-v">{whoopData.hrv}</div><div className="wst-l">HRV ms</div></div>}
                    {whoopData.rhr!=null&&<div className="wst"><div className="wst-v">{whoopData.rhr}</div><div className="wst-l">RHR bpm</div></div>}
                    {whoopData.sleepHrs!=null?<div className="wst"><div className="wst-v">{whoopData.sleepHrs}h</div><div className="wst-l">Sleep</div></div>:whoopData.sleep!=null&&<div className="wst"><div className="wst-v">{whoopData.sleep}%</div><div className="wst-l">Sleep</div></div>}
                    {whoopData.deepHrs!=null&&<div className="wst"><div className="wst-v">{whoopData.deepHrs}h</div><div className="wst-l">Deep</div></div>}
                    {whoopData.remHrs!=null&&<div className="wst"><div className="wst-v">{whoopData.remHrs}h</div><div className="wst-l">REM</div></div>}
                    {whoopData.respRate!=null&&<div className="wst"><div className="wst-v">{whoopData.respRate}</div><div className="wst-l">Resp br/m</div></div>}
                    {whoopData.spo2!=null&&<div className="wst"><div className="wst-v">{whoopData.spo2}%</div><div className="wst-l">SpO2</div></div>}
                    {whoopData.strain!=null&&<div className="wst"><div className="wst-v">{whoopData.strain}</div><div className="wst-l">Strain</div></div>}
                    {whoopData.dayCal!=null&&<div className="wst"><div className="wst-v">{whoopData.dayCal}</div><div className="wst-l">Cal out</div></div>}
                  </div>
                </div>
              ):<div className="whoop-nodata">No recovery data yet — check back after your next sleep cycle.</div>}
            </div>
          ):(
            <button className="connect-whoop" onClick={()=>window.location.href='/.netlify/functions/whoop-auth'}>
              Connect <b>WHOOP</b> to auto-sync your recovery
            </button>
          )}
          <div className={`readiness-card ${readiness.cls}`}>
            <div className="rd-label">Today's call</div>
            <div className="rd-mode">{readiness.title}</div>
            <div className="rd-action">{readiness.action}</div>
            {readiness.factors.length > 0 && <div className="rd-factors">{readiness.factors.join(' \u00b7 ')}</div>}
            <div className="rd-factors" style={{marginTop:6,opacity:0.7}}>Guidance only — this never changes your sets, targets or logged loads. You decide.</div>
          </div>
          <div className="sec-lbl" style={{padding:'0 15px 6px'}}>This week</div>
          <div className="wk-strip">
            {[['Mon','rest'],['Tue','Upper 2'],['Wed','Z2'],['Thu','Upper 3'],['Fri','Z2'],['Sat','Upper 1'],['Sun','Lower']].map(([d,label]) => (
              <div key={d} className={`wk-day${label==='rest'?' wk-rest':label==='Z2'?' wk-cardio':' wk-train'}`}>
                <div className="wk-dn">{d}</div>
                <div className="wk-lbl">{label==='Z2'?'Zone 2':label==='rest'?'Rest':label}</div>
              </div>
            ))}
          </div>
          <div className="sec-lbl" style={{padding:'0 15px 6px'}}>Sessions</div>
          <div className="sg">
            {(() => { const DORD={Monday:1,Tuesday:2,Wednesday:3,Thursday:4,Friday:5,Saturday:6,Sunday:7}; return Object.values(SESSIONS).slice().sort((a,b)=>(DORD[a.day]||9)-(DORD[b.day]||9)); })().map(s => (
              <div key={s.id} className={`sc${doneToday.has(s.id)?' done':''}`}
                onClick={() => {setSel(s.id);setActiveInts(showInt?new Set(DEF_INTS[s.id]):new Set());setView('session');}}>
                {doneToday.has(s.id) && <div className="s-done">&#10003;</div>}
                <div className="s-day">{s.day}</div>
                <div className="s-nm">{s.name}</div>
                <div className="s-foc">{s.focus}</div>
                <div className="s-time">{s.time}</div>
              </div>
            ))}
          </div>
        </div>
      );
}
