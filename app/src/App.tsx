import { Suspense, lazy, useEffect, useRef } from 'react';
import { ALT_BY_MUSCLE, EX_MUSCLE, SESSIONS } from './data/programme';
import { fmt } from './lib/format';
import { RootBoundary } from './components/RootBoundary';
import { Icon } from './components/Icon';
import { Segmented } from './components/ui';
import { TABS, isSettings, showsNav, showsSettingsButton, tabFor } from './lib/nav';
import { AppCtx } from './appContext';
import HistoryView from './views/HistoryView';
import MealsView from './views/MealsView';
import ProgramView from './views/ProgramView';
import TodayView from './views/TodayView';
import CompleteView from './views/CompleteView';
import SessionView from './views/SessionView';
import WorkoutView from './views/WorkoutView';
import { useAppState } from './state/useAppState';
import { ViewBoundary } from './components/ViewBoundary';

// Round 2 phase 7: the two heaviest screens (Progress, Body) and the two rarely used ones (Tools, Privacy)
// load as separate files, so the app opens faster. Two safeguards:
//  - a few seconds after start-up they are fetched in the background, so the service worker caches them
//    and they still open offline;
//  - if a file has gone (a new deploy replaced it while the app sat open), the app reloads once to pick
//    up the new version instead of showing a broken screen.
const RELOAD_KEY = 'dp_chunk_reload';
function lazyView(load: () => Promise<{ default: any }>) {
  return lazy(() => load().then(m => { try { sessionStorage.removeItem(RELOAD_KEY); } catch (_) { /* ignore */ } return m; }).catch(err => {
    try { if (!sessionStorage.getItem(RELOAD_KEY)) { sessionStorage.setItem(RELOAD_KEY, '1'); window.location.reload(); } } catch (_) { /* ignore */ }
    throw err;
  }));
}
const loadProgress = () => import('./views/ProgressView');
const loadBody = () => import('./views/BodyView');
const loadTools = () => import('./views/ToolsView');
const loadPrivacy = () => import('./views/PrivacyView');
const ProgressView = lazyView(loadProgress);
const BodyView = lazyView(loadBody);
const ToolsView = lazyView(loadTools);
const PrivacyView = lazyView(loadPrivacy);
const Loading = () => <div className="screen"><div className="empty-msg">Loading…</div></div>;

function App() {
  const __app = useAppState();
  const {
    BODY_TYPES, CIRC, R, applySwap, baseEx, block, clearAllData, clearConfirm, curEx, dashOff, doSkipEx, editBody,
    editBodyDraft, finishModal, goToExercise, newBlockConfirm, restFlash, saveAndFinish, saveBodyEdit, sel, sess,
    setClearConfirm, setData, setEditBody, setEditBodyDraft, setFinishModal, setNewBlockConfirm, setShowSwap,
    setSkipConfirm, setStorageFail, setView, showSwap, skipConfirm, skipTimer, startNewBlock, storageFail, subMap,
    timerMsg, timerOn, timerSecs, view, logs, week
  } = __app;

  // Train remembers whether you were on Plan or History; Settings remembers which tab opened it.
  const trainSub = useRef<string>('home');
  const settingsFrom = useRef<string>('today');
  // Warm the separately loaded screens once the first screen is up, so they are cached for offline use.
  useEffect(() => {
    const id = window.setTimeout(() => { [loadProgress, loadBody, loadTools, loadPrivacy].forEach(f => { f().catch(() => {}); }); }, 2500);
    return () => window.clearTimeout(id);
  }, []);
  useEffect(() => {
    if (view === 'home' || view === 'history') trainSub.current = view;
    if (tabFor(view)) settingsFrom.current = view;
  }, [view]);

  return (
    <AppCtx.Provider value={__app}>
<div className="app">
      {storageFail && (
        <div style={{position:'sticky',top:0,zIndex:9999,background:'rgba(255,90,79,0.14)',borderBottom:'1px solid rgba(255,90,79,0.5)',color:'#ff9a9a',fontFamily:'var(--font-text)',fontSize:13,padding:'8px 12px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:10}}>
          <span>Storage write failed ({storageFail}). Your device storage may be full or blocked — recent changes might not survive a reload. Export a backup, then free space.</span>
          <button onClick={()=>setStorageFail(null)} style={{background:'none',border:'1px solid rgba(255,90,79,0.5)',color:'#ff9a9a',borderRadius:8,padding:'0 10px',minHeight:36,cursor:'pointer',flexShrink:0}}>Dismiss</button>
        </div>
      )}
      {/* During a workout the rest timer runs inline on the workout screen (phase 5), with logging locked. */}
      {timerOn && view !== 'workout' && (
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

      {view === 'today' && <ViewBoundary name="Today"><TodayView /></ViewBoundary>}

      {(view === 'home' || view === 'history') && (
        <div className="tabwrap">
          <div className="tabhead">
            <div className="tabhead-row">
              <div>
                <h1 className="tabhead-title">Train</h1>
                <div className="tabhead-sub">{view === 'history' ? `${logs.length} sessions logged` : `Block ${block} · Week ${week} of 12`}</div>
              </div>
            </div>
            <Segmented label="Train" value={view === 'history' ? 'history' : 'home'} onChange={v => setView(v)}
              options={[{ value: 'home', label: 'Plan' }, { value: 'history', label: 'History' }]} />
          </div>
          <ViewBoundary name="Train">{view === 'home' ? <ProgramView /> : <HistoryView />}</ViewBoundary>
        </div>
      )}

      {view === 'session' && sess && <ViewBoundary name="Session"><SessionView /></ViewBoundary>}

      {view === 'workout' && sess && curEx && <ViewBoundary name="Workout"><WorkoutView /></ViewBoundary>}

      {view === 'complete' && <ViewBoundary name="Session summary"><CompleteView /></ViewBoundary>}

      {view === 'progress' && <ViewBoundary name="Progress"><Suspense fallback={<Loading />}><ProgressView /></Suspense></ViewBoundary>}

      {view === 'meals' && <ViewBoundary name="Fuel"><MealsView /></ViewBoundary>}
      {isSettings(view) && (
        <div className="tabwrap">
          <div className="tabhead">
            <div className="tabhead-row no-set">
              <h1 className="tabhead-title">Settings</h1>
              <button type="button" className="done-btn" onClick={() => setView(settingsFrom.current)}>Done</button>
            </div>
            <Segmented label="Settings" value={view === 'privacy' ? 'privacy' : 'tools'} onChange={v => setView(v)}
              options={[{ value: 'tools', label: 'Tools and data' }, { value: 'privacy', label: 'Privacy' }]} />
          </div>
          <ViewBoundary name="Settings"><Suspense fallback={<Loading />}>{view === 'privacy' ? <PrivacyView /> : <ToolsView />}</Suspense></ViewBoundary>
        </div>
      )}


      {view==='body'&&<ViewBoundary name="Body"><Suspense fallback={<Loading />}><BodyView /></Suspense></ViewBoundary>}

      {restFlash && <div className="rest-flash"><div className="rest-flash-txt">REST OVER</div></div>}
      {showsSettingsButton(view) && (
        <button type="button" className="set-btn" aria-label="Settings" onClick={() => setView('tools')}>
          <Icon name="settings" size={20} />
        </button>
      )}
      {showsNav(view) && (
        <nav className="bnav" aria-label="Main">
          {TABS.map(t => {
            const on = tabFor(view) === t.id;
            return (
              <button key={t.id} type="button" className={`bn${on ? ' on' : ''}`} aria-current={on ? 'page' : undefined}
                onClick={() => setView(t.id === 'train' ? trainSub.current : t.home)}>
                <span className="bn-ic"><Icon name={t.icon} size={22} /></span>
                <span className="bn-lb">{t.label}</span>
              </button>
            );
          })}
        </nav>
      )}
    </div>
    </AppCtx.Provider>
  );
}

export { App, RootBoundary };
