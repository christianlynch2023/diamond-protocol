// WorkoutView: moved out of App.jsx in Phase 2b. Behaviour unchanged.
import React from 'react';
import { useApp } from '../appContext';
import { effWR, intBadge } from '../data/programme';
import { fmt, fmtShort } from '../lib/format';
import { epley, totalLoad, volLoad } from '../lib/training';

export default function WorkoutView() {
  const {
    activeInts, bwAt, clearIntInputs, curEx, curSetPhase, curSetWeight, curTarget, editIdx, effSets,
    exIdx, goToExercise, intEligible, intFail, intKind, intMyoStr, intPartials, logSet, loggedSetsArr,
    painData, painRef, prevHist, progRec, rir, rp, sess, setData, setEditIdx, setIntFail, setIntMyoStr,
    setIntPartials, setPainData, setRir, setRp, setShowSwap, setSkipConfirm, setWt, tryFinish, week, wt
  } = useApp();
  return (() => {
        return (
          <div className="fullscreen">
            <div className="wk-prog"><div className="wk-prog-fill" style={{width:`${(exIdx/sess.exercises.length)*100}%`}}/></div>
            <div className="wk-top"><span className="wk-sn">{sess.name} Wk{week}</span><span className="wk-cnt">{exIdx+1}/{sess.exercises.length}</span></div>
            {progRec && !(curTarget && !curTarget.first) && (   /* Round 1: the target card below already says this */
              <div className={`prog-rec ${progRec.type}`}>
                {progRec.type==='inc'&&'▲'}{progRec.type==='beat'&&'→'}{progRec.type==='keep'&&'→'}{progRec.type==='first'&&'●'} {progRec.msg}
              </div>
            )}
            {curTarget && !curTarget.first && (
              <div className="target-line">
                <span className="target-lbl">Today's target</span>
                <span className="target-val">{curSetPhase ? `${curSetWeight}kg \u00d7 ${curSetPhase.rMin}-${curSetPhase.rMax} reps` : `${curTarget.weight}kg \u00d7 ${curEx.rMin}-${curEx.rMax} reps`}</span>
                {curSetPhase && <span className="target-phase">{curSetPhase.label}{curSetPhase.pct!==1?` \u00b7 -${Math.round((1-curSetPhase.pct)*100)}% off top set`:' \u00b7 heaviest set of the day'}</span>}
                <span className="target-note">{curTarget.note}</span>
              </div>
            )}
            <div className="ex-card">
              <div className="ec-hdr">
                <div className="ec-nm">{curEx.name}{curEx.opt?' (opt)':''}</div>
                <div className="ec-meta">
                  <span className="chip">{effSets} sets</span>
                  <span className="chip">{curSetPhase ? `${curSetPhase.rMin}-${curSetPhase.rMax} reps` : `${curEx.rMin}-${curEx.rMax} reps`}</span>
                  <span className="chip rir">{curEx.rirMin===curEx.rirMax?curEx.rirMin:`${curEx.rirMin}-${curEx.rirMax}`} RIR</span>
                  <span className="chip">{fmt(curEx.rest)} rest</span>
                  {curEx.handle && <span className="chip">{curEx.handle}</span>}
                </div>
              </div>
              <div className="ec-cues">{curEx.cues.map((c,i) => <span key={i} className="cue">{c}</span>)}</div>
              {activeInts.has(curEx.id) && curEx.int && (
                <div className="int-box"><div className="int-lbl">{curEx.int.label}</div><div className="int-txt">{curEx.int.desc}</div></div>
              )}
              {curEx.avoidFail && <div className="avd-box">{curEx.avoidReason}</div>}
              <div className="set-trk">
                <div className="stl">
                  <span>{editIdx!==null?`Editing Set ${editIdx+1}`:`Set ${loggedSetsArr.length+1} of ${effSets}`}</span>
                  <span style={{color:'var(--t3)',fontFamily:'JetBrains Mono,monospace',fontSize:11}}>{loggedSetsArr.length}/{effSets} done</span>
                </div>
                <div className="dots">
                  {Array.from({length:effSets}).map((_,i) => (
                    <div key={i} className={`dot${i<loggedSetsArr.length?' d':i===loggedSetsArr.length&&editIdx===null?' c':''}`}/>
                  ))}
                </div>
              </div>
              {loggedSetsArr.length > 0 && (
                <div className="logged-sets">
                  {loggedSetsArr.map((s,i) => (
                    <div key={i} className={`ls-chip${editIdx===i?' ed':''}`}
                      onClick={() => {if(editIdx===i){setEditIdx(null);clearIntInputs();}else{setEditIdx(i);setWt(s.weight);setRp(s.reps);setRir(s.rir??effWR(week).rirN);
                        const it=s.intensifier; setIntPartials(it&&it.partialReps?String(it.partialReps):''); setIntMyoStr(it&&it.myoReps?it.myoReps.join(','):''); setIntFail(!!(it&&it.kind==='failure'));}}}>
                      <span>{s.weight}kg&#215;{s.reps}</span>
                      <span className="ls-rir">{s.rir}RIR</span>
                      {s.intensifier && <span className="ls-int">{intBadge(s.intensifier)}</span>}
                    </div>
                  ))}
                </div>
              )}
              {prevHist.length > 0 && (
                <div className="prev-sec">
                  <div className="prev-lbl">Previous sessions</div>
                  {prevHist.map((h,i) => {
                    const vl = volLoad(h.sets);
                    const older = prevHist[i+1];
                    const olderVl = older ? volLoad(older.sets) : null;
                    const pct = (olderVl && olderVl > 0) ? Math.round(((vl - olderVl) / olderVl) * 100) : null;
                    return (
                    <div key={i} className="prev-item">
                      <span className="prev-dt">{fmtShort(h.date)}</span>
                      <span>{h.sets.map(s=>`${s.weight}\u00d7${s.reps}${s.intensifier?' ('+intBadge(s.intensifier)+')':''}`).join('  ')}</span>
                      <span className="prev-prog" style={{color:'var(--t3)'}}>{vl.toLocaleString()}kg{pct!==null?` (${pct>=0?'+':''}${pct}%)`:''}</span>
                      {h.swapped && <span className="prev-prog" style={{color:'var(--t3)'}}>via {h.swapped}</span>}
                      {i===0 && progRec?.type==='inc' && <span className="prev-prog">add weight</span>}
                    </div>
                    );
                  })}
                </div>
              )}
              <div className="inp-sec">
                <div className="inp-row">
                  <div className="inp-grp">
                    <div className="inp-lbl">Weight kg</div>
                    <div className="nw">
                      <button className="nb" onClick={() => setWt(v=>Math.max(0,parseFloat(v||0)-2.5))}>&#8722;</button>
                      <input className="ni" type="number" inputMode="decimal" value={wt} onChange={e=>setWt(e.target.value)}/>
                      <button className="nb" onClick={() => setWt(v=>parseFloat(v||0)+2.5)}>+</button>
                    </div>
                  </div>
                  <div className="inp-grp">
                    <div className="inp-lbl">Reps</div>
                    <div className="nw">
                      <button className="nb" onClick={() => setRp(v=>Math.max(1,parseInt(v||1)-1))}>&#8722;</button>
                      <input className="ni" type="number" inputMode="numeric" value={rp} onChange={e=>setRp(e.target.value)}/>
                      <button className="nb" onClick={() => setRp(v=>parseInt(v||0)+1)}>+</button>
                    </div>
                  </div>
                </div>
                <div className="rir-grp">
                  <div className="inp-lbl">RIR — reps in reserve</div>
                  <div className="rir-row">
                    {[0,1,2,3,'4+'].map(r => (
                      <button key={r} className={`rirb${rir===r?' on':''}`} onClick={() => setRir(r)}>{r}</button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="pain-sec">
                <div className="pain-lbl">Joint / tendon discomfort</div>
                <div className="pain-row">
                  {[[0,'None'],[1,'Niggle'],[2,'Sharp']].map(([v,l]) => {
                    const sel=(painData[curEx.id]||0)===v;
                    const extra=v===2?' sharp':v===1?' warn':'';
                    return <button key={v} className={`painb${sel?' on'+extra:''}`} onClick={()=>{const np={...painData,[curEx.id]:v};setPainData(np);painRef.current=np;}}>{l}</button>;
                  })}
                </div>
              </div>
              {intEligible && (
                <div className="int-cap">
                  <div className="int-cap-hd">{curEx.int.label} · final set{(painData[curEx.id]||0)===2?' — sharp pain flagged, skip if it bites':''}</div>
                  {(intKind==='partials' || intKind==='partials_failure') && (
                    <div className="int-cap-row">
                      <span className="int-cap-lbl">Lengthened partials</span>
                      <div className="nw sm">
                        <button className="nb" onClick={()=>setIntPartials(v=>String(Math.max(0,(parseInt(v)||0)-1)))}>&#8722;</button>
                        <input className="ni" type="number" inputMode="numeric" placeholder="0" value={intPartials} onChange={e=>setIntPartials(e.target.value)}/>
                        <button className="nb" onClick={()=>setIntPartials(v=>String((parseInt(v)||0)+1))}>+</button>
                      </div>
                    </div>
                  )}
                  {intKind==='myo' && (
                    <div className="int-cap-row">
                      <span className="int-cap-lbl">Mini-set reps</span>
                      <input className="ni wide" type="text" inputMode="numeric" placeholder="e.g. 5,4,3,3" value={intMyoStr} onChange={e=>setIntMyoStr(e.target.value)}/>
                    </div>
                  )}
                  {(intKind==='failure' || intKind==='partials_failure') && (
                    <button className={`int-cap-fail${intFail?' on':''}`} onClick={()=>setIntFail(v=>!v)}>{intFail?'\u2713 Taken to failure':'Mark taken to failure'}</button>
                  )}
                  <div className="int-cap-note">Recorded separately — never counts toward your working reps, e1RM or progression.</div>
                </div>
              )}
              {curEx.orm && parseInt(rp)>0 && parseFloat(wt)>0 && (
                <div className="onerm-box">
                  <span className="orm-lbl">Est. 1RM</span>
                  <span className="orm-val">{epley(totalLoad(curEx.id, parseFloat(wt), bwAt, new Date().toISOString()), parseInt(rp))}kg</span>
                </div>
              )}
              <div className="log-area">
                <button className={`log-btn${editIdx!==null?' upd':''}`} onClick={logSet}>
                  {editIdx!==null?`Update Set ${editIdx+1}`:`Log Set ${loggedSetsArr.length+1}`}
                </button>
              </div>
            </div>
            <div className="wk-nav">
              <button className="wnb" disabled={exIdx===0} onClick={() => goToExercise(exIdx-1)}>Back</button>
              <button className="wnb" onClick={() => setShowSwap(true)}>Swap</button>
              <button className="wnb" onClick={() => setSkipConfirm(true)}>Skip</button>
              <button className="wnb fin" onClick={() => tryFinish(setData)}>End</button>
            </div>
          </div>
        );
      })();
}
