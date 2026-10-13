import { useEffect } from 'react';
import { ALT_BY_MUSCLE, EX_MUSCLE, SESSIONS } from './data/programme';
import { fmt } from './lib/format';
import { RootBoundary } from './components/RootBoundary';
import { AppCtx } from './appContext';
import BodyView from './views/BodyView';
import HistoryView from './views/HistoryView';
import MealsView from './views/MealsView';
import PrivacyView from './views/PrivacyView';
import ProgramView from './views/ProgramView';
import ProgressView from './views/ProgressView';
import TodayView from './views/TodayView';
import ToolsView from './views/ToolsView';
import CompleteView from './views/CompleteView';
import SessionView from './views/SessionView';
import WorkoutView from './views/WorkoutView';
import { useAppState } from './state/useAppState';

function App() {
  const __app = useAppState();
  const {
    BODY_TYPES, CIRC, R, applySwap, baseEx, block, clearAllData, clearConfirm, curEx, dashOff, doSkipEx, editBody,
    editBodyDraft, finishModal, goToExercise, newBlockConfirm, restFlash, saveAndFinish, saveBodyEdit, sel, sess,
    setClearConfirm, setData, setEditBody, setEditBodyDraft, setFinishModal, setNewBlockConfirm, setShowSwap,
    setSkipConfirm, setStorageFail, setView, showSwap, skipConfirm, skipTimer, startNewBlock, storageFail, subMap,
    timerMsg, timerOn, timerSecs, view
  } = __app;

  // Bottom tabs: shrink a label only if it doesn't fit its tab (PROGRESS on narrow phones), rather than
  // cutting it to "PROGRE...". Measured in the browser, so it works for any font and screen width.
  useEffect(() => {
    const fit = () => document.querySelectorAll<HTMLElement>('.bn-lb').forEach(el => {
      el.style.fontSize = '';
      if (el.scrollWidth > el.clientWidth + 0.5) el.style.fontSize = Math.max(6.5, 8 * el.clientWidth / el.scrollWidth - 0.1).toFixed(2) + 'px';
    });
    fit();
    (document as any).fonts?.ready?.then(fit);
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [view]);

  return (
    <AppCtx.Provider value={__app}>
<div className="app">
      {storageFail && (
        <div style={{position:'sticky',top:0,zIndex:9999,background:'rgba(255,68,68,0.14)',borderBottom:'1px solid rgba(255,68,68,0.5)',color:'#ff9a9a',fontFamily:"'JetBrains Mono',monospace",fontSize:11,padding:'8px 12px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:10}}>
          <span>Storage write failed ({storageFail}). Your device storage may be full or blocked — recent changes might not survive a reload. Export a backup, then free space.</span>
          <button onClick={()=>setStorageFail(null)} style={{background:'none',border:'1px solid rgba(255,68,68,0.5)',color:'#ff9a9a',borderRadius:6,padding:'3px 8px',cursor:'pointer',flexShrink:0}}>Dismiss</button>
        </div>
      )}
      {timerOn && (
        <div className="timer-ov">
          <div className="t-lbl">Rest Period</div>
          <div className="t-ring">
            <svg width="200" height="200" viewBox="0 0 200 200">
              <circle className="t-track" cx="100" cy="100" r={R}/>
              <circle className="t-fill" cx="100" cy="100" r={R} strokeDasharray={CIRC} strokeDashoffset={dashOff}/>
            </svg>
            <div className="t-ctr"><div className="t-secs">{fmt(timerSecs)}</div><div className="t-unit">remaining</div></div>
          </div>
          <div className="t-msg">{timerMsg}</div>
          <button className="t-skip" onClick={skipTimer}>Skip Rest</button>
        </div>
      )}

      {editBody && editBodyDraft && (() => {
        const cfg = BODY_TYPES[editBody.type];
        const dv = cfg.dateOnly ? (editBodyDraft.date||'') : (editBodyDraft.date||'').slice(0,10);
        const setDate = (val) => setEditBodyDraft(d => ({...d, date: cfg.dateOnly ? val : `${val}T12:00:00.000Z`}));
        return (
          <div className="modal-ov">
            <div className="modal">
              <div className="modal-title">{cfg.title}</div>
              {cfg.ro && cfg.ro.map(([k,lbl])=>(<div key={k} className="modal-sub">{lbl}: {editBodyDraft[k]}</div>))}
              <div className="ebody-grid">
                <div className="ebody-f"><label>Date</label><input type="date" value={dv} onChange={e=>setDate(e.target.value)}/></div>
                {cfg.fields.map(([k,lbl,kind])=>(
                  <div key={k} className="ebody-f"><label>{lbl}</label>
                    <input type={kind==='num'?'number':'text'} inputMode={kind==='num'?'decimal':'text'} value={editBodyDraft[k]==null?'':editBodyDraft[k]} onChange={e=>setEditBodyDraft(d=>({...d,[k]:e.target.value}))}/>
                  </div>
                ))}
              </div>
              <div className="modal-btns">
                <button className="mbt danger" onClick={()=>{ cfg.setter(prev=>prev.map(e => ((e.id||'')===editBody.id) ? {...e, deletedAt: Date.now(), updatedAt: Date.now()} : e)); setEditBody(null); setEditBodyDraft(null); }}>Delete</button>
                <button className="mbt ghost" onClick={()=>{setEditBody(null);setEditBodyDraft(null);}}>Cancel</button>
                <button className="mbt go" onClick={saveBodyEdit}>Save</button>
              </div>
            </div>
          </div>
        );
      })()}

      {newBlockConfirm && (
        <div className="modal-ov">
          <div className="modal">
            <div className="modal-title">Start Block {block+1}?</div>
            <div className="modal-sub">This begins a fresh 12-week wave at Week 1. Your logged sessions stay in History tagged Block {block}, and your working weights carry forward &#8212; nothing is reset or deleted.</div>
            <div className="modal-btns">
              <button className="mbt ghost" onClick={()=>setNewBlockConfirm(false)}>Cancel</button>
              <button className="mbt go" onClick={startNewBlock}>Start Block {block+1}</button>
            </div>
          </div>
        </div>
      )}

      {finishModal && (() => {
        const sess=SESSIONS[sel];
        const undone=sess.exercises.map((ex,i)=>({ex,i})).filter(({ex})=>{ if(ex.opt) return false; const eid=subMap[ex.id]?subMap[ex.id].id:ex.id; return !(setData[eid]&&setData[eid].length>0); });
        return (
          <div className="modal-ov">
            <div className="modal">
              <div className="modal-title">Finish session?</div>
              <div className="modal-sub">You haven't logged {undone.length} exercise{undone.length>1?'s':''} yet. Jump to one to do it now, or finish anyway.</div>
              <div className="swap-list">
                {undone.map(({ex,i})=>(<button key={i} className="swap-opt" onClick={()=>goToExercise(i)}>{(subMap[ex.id]&&subMap[ex.id].name)||ex.name}</button>))}
              </div>
              <div className="modal-btns">
                <button className="mbt ghost" onClick={()=>setFinishModal(false)}>Keep going</button>
                <button className="mbt danger" onClick={()=>{setFinishModal(false); saveAndFinish(setData);}}>Finish anyway</button>
              </div>
            </div>
          </div>
        );
      })()}

      {skipConfirm && (
        <div className="modal-ov">
          <div className="modal">
            <div className="modal-title">Skip Exercise?</div>
            <div className="modal-sub">Skip {curEx?.name}? Unlogged sets will not be saved.</div>
            <div className="modal-btns">
              <button className="mbt ghost" onClick={() => setSkipConfirm(false)}>Cancel</button>
              <button className="mbt danger" onClick={doSkipEx}>Skip</button>
            </div>
          </div>
        </div>
      )}

      {showSwap && curEx && (
        <div className="modal-ov">
          <div className="modal">
            <div className="modal-title">Swap Exercise</div>
            <div className="modal-sub">Replace {curEx.name} with another option for the same muscle. Your set and rep scheme carries over; it tracks as its own lift.</div>
            <div className="swap-list">
              {(ALT_BY_MUSCLE[EX_MUSCLE[baseEx?.id]?.p] || []).filter(o => o.name !== curEx.name).map((o, i) => (
                <button key={i} className="swap-opt" onClick={() => applySwap(o)}>{o.name}</button>
              ))}
            </div>
            <div className="modal-btns"><button className="mbt ghost" onClick={() => setShowSwap(false)}>Cancel</button></div>
          </div>
        </div>
      )}

      {clearConfirm && (
        <div className="modal-ov">
          <div className="modal">
            <div className="modal-title">Clear All Data?</div>
            <div className="modal-sub">This permanently deletes everything — workout history, logs, settings, and all health metrics (bodyweight, measurements, nutrition, BP, cardio, protocol). Export a backup first if you want to keep your data.</div>
            <div className="modal-btns">
              <button className="mbt ghost" onClick={() => setClearConfirm(false)}>Cancel</button>
              <button className="mbt danger" onClick={clearAllData}>Clear Everything</button>
            </div>
          </div>
        </div>
      )}

      {view === 'today' && <TodayView />}

      {view === 'home' && <ProgramView />}

      {view === 'session' && sess && <SessionView />}

      {view === 'workout' && sess && curEx && <WorkoutView />}

      {view === 'complete' && <CompleteView />}

      {view === 'progress' && <ProgressView />}
      {view === 'history' && <HistoryView />}

      {view === 'meals' && <MealsView />}
      {view === 'privacy' && <PrivacyView />}
      {view === 'tools' && <ToolsView />}


      {view==='body'&&<BodyView />}

      {restFlash && <div className="rest-flash"><div className="rest-flash-txt">REST OVER</div></div>}
      {view !== 'workout' && view !== 'complete' && (
        <div className="bnav">
          {[['today','&#128197;','Today'],['meals','&#127869;','Meals'],['home','&#127947;','Program'],['progress','&#128200;','Progress'],['history','&#128203;','History'],['body','&#9878;','Body'],['privacy','&#128274;','Privacy'],['tools','&#128295;','Tools']].map(([v,icon,label]) => (
            <div key={v} className={`bn${view===v?' on':''}`} onClick={() => setView(v)}>
              <span className="bn-ic" dangerouslySetInnerHTML={{__html:icon}}/>
              <span className="bn-lb">{label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
    </AppCtx.Provider>
  );
}

export { App, RootBoundary };
