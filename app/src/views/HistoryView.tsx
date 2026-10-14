// HistoryView: moved out of App.jsx in Phase 2b. Behaviour unchanged.
import React from 'react';
import { useApp } from '../appContext';
import { DLW, SESSIONS } from '../data/programme';
import { fmtDate } from '../lib/format';
import { sessionVol } from '../lib/training';
import { matchWorkout } from '../lib/whoop';

export default function HistoryView() {
  const {
    addExercise, addSet, delExercise, delSet, editDraft, editingLog, expandLog, logs, saveEdit,
    setEditDraft, setEditingLog, setExpandLog, updSet, whoopWorkouts
  } = useApp();
  return (
        <div className="screen">
          <div className="topbar"><span className="logo">History</span><span className="top-badge">{logs.length} sessions</span></div>
          {logs.length === 0
            ? <div className="empty-msg">No sessions logged yet.<br/>Complete a workout to see it here.</div>
            : <div className="hist-list">
                {logs.map((log,i) => (
                  <div key={i} className="h-item" onClick={() => { if(editingLog===i) return; setExpandLog(expandLog===i?null:i); }}>
                    <div className="h-date">{fmtDate(log.date)} — Block {log.block||1} · Week {log.week}</div>
                    <div className="h-nm">{log.sessionName}</div>
                    <div className="h-det">{log.exercises.length} exercises · {log.duration||'?'} min · {log.exercises.reduce((a,e)=>a+e.sets.length,0)} sets{log.deload===true?<span className="h-pain mild" style={{marginLeft:6}}>deload</span>:(log.deload===false && DLW.has(log.week))?<span className="core-tag" style={{marginLeft:6}}>trained through</span>:null}{log.hv?<span className="core-tag" style={{marginLeft:6}}>high-vol</span>:null}</div>
                    {(() => {
                      const vl = sessionVol(log);
                      // compare to the previous session of the SAME type (e.g. last Upper 1), not just the prior day
                      const priorSame = logs.slice(i+1).find(l => l.sessionId === log.sessionId);
                      const priorVl = priorSame ? sessionVol(priorSame) : null;
                      const pct = (priorVl && priorVl > 0) ? Math.round(((vl - priorVl) / priorVl) * 100) : null;
                      const cls = pct === null ? '' : pct >= 3 ? 'vl-up' : pct <= -8 ? 'vl-dn' : '';
                      return <div className={`h-vol ${cls}`}>Volume: {vl.toLocaleString()}kg{pct!==null?` (${pct>=0?'+':''}${pct}% vs last ${log.sessionName})`:''}</div>;
                    })()}
                    {(() => { const w = matchWorkout(log, whoopWorkouts); return w ? <div className="h-whoop">{w.strain} strain{w.avgHr?` \u00b7 ${w.avgHr} avg HR`:''}{w.maxHr?` \u00b7 ${w.maxHr} max`:''}{w.kcal?` \u00b7 ${w.kcal} cal`:''}</div> : null; })()}
                    {expandLog===i && editingLog!==i && (
                      <div className="h-exp">
                        {log.exercises.map((ex,j) => (
                          <div key={j} className="h-ex">
                            <div className="h-ex-nm">{ex.name}{ex.pain?<span className={`h-pain ${ex.pain===2?'sharp':'mild'}`}>{ex.pain===2?'sharp pain':'niggle'}</span>:null}</div>
                            <div className="h-sets">{ex.sets.map((s,k) => <span key={k} className="h-set">{s.weight}kg&#215;{s.reps}{s.rir!=null?` @${s.rir}RIR`:''}</span>)}</div>
                          </div>
                        ))}
                        <button className="edit-start" onClick={(e)=>{e.stopPropagation(); setEditingLog(i); setEditDraft(JSON.parse(JSON.stringify(log)));}}>Edit session</button>
                      </div>
                    )}
                    {expandLog===i && editingLog===i && editDraft && (
                      <div className="h-exp" onClick={e=>e.stopPropagation()}>
                        {editDraft.exercises.map((ex,j) => (
                          <div key={j} className="edit-ex">
                            <div className="edit-ex-hdr"><span className="h-ex-nm">{ex.name}</span><button className="edit-x" aria-label="Remove this exercise" onClick={()=>delExercise(j)}>&#215;</button></div>
                            {ex.sets.map((s,k) => (
                              <div key={k} className="edit-set">
                                <input className="edit-in" type="number" inputMode="decimal" value={s.weight} placeholder="kg" onChange={e=>updSet(j,k,'weight',e.target.value)}/>
                                <span className="edit-x2">&#215;</span>
                                <input className="edit-in" type="number" inputMode="numeric" value={s.reps} placeholder="reps" onChange={e=>updSet(j,k,'reps',e.target.value)}/>
                                <input className="edit-in sm" type="number" inputMode="numeric" value={s.rir==null?'':s.rir} placeholder="RIR" onChange={e=>updSet(j,k,'rir',e.target.value)}/>
                                <button className="edit-del" aria-label="Remove this set" onClick={()=>delSet(j,k)}>&#215;</button>
                              </div>
                            ))}
                            <button className="edit-addset" onClick={()=>addSet(j)}>+ set</button>
                          </div>
                        ))}
                        {(() => { const sess=SESSIONS[editDraft.sessionId]; const missing=(sess?sess.exercises:[]).filter(e=>!editDraft.exercises.some(de=>de.id===e.id)); return missing.length ? (
                          <div className="edit-addex">
                            <select className="edit-sel" value="" onChange={e=>{if(e.target.value)addExercise(e.target.value);}}>
                              <option value="">+ Add a missed exercise</option>
                              {missing.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
                            </select>
                          </div>
                        ) : null; })()}
                        <div className="edit-btns">
                          <button className="edit-cancel" onClick={()=>{setEditingLog(null);setEditDraft(null);}}>Cancel</button>
                          <button className="edit-save" onClick={saveEdit}>Save changes</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
          }
        </div>
      );
}
