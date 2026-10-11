// ToolsView: moved out of App.jsx in Phase 2b. Behaviour unchanged.
import React from 'react';
import { useApp } from '../appContext.js';
import { epley } from '../lib/training';

export default function ToolsView() {
  const {
    BUILD_ID, cloudErr, cloudStatus, connectSync, disconnectSync, disconnectWhoop, exportData,
    exportSummary, fetchWhoopData, genSyncCode, importData, ormRp, ormWt, plateRes, plateTgt,
    pullFromCloud, setClearConfirm, setOrmRp, setOrmWt, setPlateTgt, setSyncCodeInput, setWarmWt,
    syncCode, syncCodeInput, syncNow, warmWt, warmups, whoopAuthFail, whoopConnected, whoopData,
    whoopStaleNote
  } = useApp();
  return (
        <div className="screen">
          <div className="topbar"><span className="logo">Tools</span></div>
          <div className="tool-sec">
            <div className="tool-ttl">Plate Calculator</div>
            <div className="tool-sub">20kg bar · standard plates</div>
            <div className="tool-inp-row">
              <span className="tool-lbl">Target</span>
              <div className="tool-nw">
                <button className="tool-nb" onClick={() => setPlateTgt(v=>Math.max(20,parseFloat(v||20)-2.5))}>&#8722;</button>
                <input className="tool-ni" type="number" inputMode="decimal" value={plateTgt} onChange={e=>setPlateTgt(e.target.value)}/>
                <button className="tool-nb" onClick={() => setPlateTgt(v=>parseFloat(v||20)+2.5)}>+</button>
              </div>
              <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:12,color:'var(--t2)',minWidth:20}}>kg</span>
            </div>
            <div className="tool-result">
              {plateRes.ok
                ? plateRes.plates.length===0
                  ? <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:12,color:'var(--t2)'}}>Bar only — 20kg</div>
                  : <>
                      <div style={{fontSize:9,letterSpacing:'.15em',color:'var(--t3)',marginBottom:6,textTransform:'uppercase'}}>Each side:</div>
                      {plateRes.plates.map((p,i) => (
                        <div key={i} className="plate-row">
                          <span className="plate-kg">{p.kg}kg &#215; {p.count}</span>
                          <div className="plate-dots">{Array.from({length:Math.min(p.count,8)}).map((_,j) => <div key={j} className="pdot"/>)}</div>
                        </div>
                      ))}
                    </>
                : <div style={{color:'var(--err)',fontSize:12}}>Cannot make {plateTgt}kg with standard plates</div>
              }
            </div>
          </div>
          <div className="tool-sec">
            <div className="tool-ttl">Warm-Up Sets</div>
            <div className="tool-sub">Ramp to your working weight</div>
            <div className="tool-inp-row">
              <span className="tool-lbl">Working</span>
              <div className="tool-nw">
                <button className="tool-nb" onClick={() => setWarmWt(v=>Math.max(20,parseFloat(v||20)-2.5))}>&#8722;</button>
                <input className="tool-ni" type="number" inputMode="decimal" value={warmWt} onChange={e=>setWarmWt(e.target.value)}/>
                <button className="tool-nb" onClick={() => setWarmWt(v=>parseFloat(v||20)+2.5)}>+</button>
              </div>
              <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:12,color:'var(--t2)',minWidth:20}}>kg</span>
            </div>
            <div className="tool-result">
              {warmups.map((w,i) => <div key={i} className="wu-row"><span className="wu-wt">{w.wt}kg</span><span className="wu-reps">{w.reps} reps</span><span className="wu-pct">{w.pct}</span></div>)}
              <div className="wu-row" style={{borderTop:'1px solid var(--acc)',marginTop:4,paddingTop:8}}>
                <span className="wu-wt" style={{color:'var(--acc)'}}>{warmWt}kg</span>
                <span className="wu-reps" style={{color:'var(--t)'}}>Working set</span>
                <span className="wu-pct" style={{color:'var(--acc)'}}>100%</span>
              </div>
            </div>
          </div>
          <div className="tool-sec">
            <div className="tool-ttl">1RM Estimator</div>
            <div className="tool-sub">Epley formula</div>
            <div className="tool-inp-row">
              <span className="tool-lbl">Weight</span>
              <div className="tool-nw">
                <button className="tool-nb" onClick={() => setOrmWt(v=>Math.max(0,parseFloat(v||0)-2.5))}>&#8722;</button>
                <input className="tool-ni" type="number" inputMode="decimal" value={ormWt} onChange={e=>setOrmWt(e.target.value)}/>
                <button className="tool-nb" onClick={() => setOrmWt(v=>parseFloat(v||0)+2.5)}>+</button>
              </div>
              <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:12,color:'var(--t2)',minWidth:20}}>kg</span>
            </div>
            <div className="tool-inp-row">
              <span className="tool-lbl">Reps</span>
              <div className="tool-nw">
                <button className="tool-nb" onClick={() => setOrmRp(v=>Math.max(1,parseInt(v||1)-1))}>&#8722;</button>
                <input className="tool-ni" type="number" inputMode="numeric" value={ormRp} onChange={e=>setOrmRp(e.target.value)}/>
                <button className="tool-nb" onClick={() => setOrmRp(v=>parseInt(v||0)+1)}>+</button>
              </div>
            </div>
            <div className="tool-result">
              <div className="orm-big-wrap">
                <div className="orm-big">{epley(ormWt,ormRp)}</div>
                <div className="orm-unit">kg estimated 1RM</div>
              </div>
            </div>
          </div>
          <div className="tool-sec">
            <div className="tool-ttl">WHOOP</div>
            <div className="tool-sub">{whoopAuthFail?'Reconnect required — your WHOOP authorisation expired':(whoopConnected?'Connected — recovery syncs automatically on app open':'Connect to pull recovery, HRV and sleep data automatically')}</div>
            {whoopStaleNote && !whoopAuthFail && <div className="info-banner" style={{margin:'0 0 10px'}}>Showing cached WHOOP data — last refresh failed. Tap Refresh Now to retry.</div>}
            {whoopAuthFail && <div className="info-banner err" style={{margin:'0 0 10px'}}>WHOOP disconnected — tap Connect WHOOP to re-authorise. Readiness will use your manual recovery selection until then.</div>}
            {whoopConnected?(
              <div>
                {whoopData?.recovery!=null&&<div style={{fontFamily:'JetBrains Mono,monospace',fontSize:12,color:'var(--ok)',marginBottom:10}}>&#10003; Recovery {whoopData.recovery}% · HRV {whoopData.hrv}ms · RHR {whoopData.rhr}bpm</div>}
                <div className="data-btns" style={{gridTemplateColumns:'1fr'}}>
                  <button className="data-btn" onClick={()=>fetchWhoopData()}>&#8635; Refresh Now</button>
                  <button className="data-btn danger" onClick={disconnectWhoop}>Disconnect WHOOP</button>
                </div>
              </div>
            ):(
              <div className="data-btns" style={{gridTemplateColumns:'1fr'}}>
                <button className="data-btn" onClick={()=>window.location.href='/.netlify/functions/whoop-auth'}>Connect WHOOP</button>
              </div>
            )}
          </div>
          <div className="tool-sec">
            <div className="tool-ttl">Cloud Sync</div>
            <div className="tool-sub">Back up your training, body, nutrition and health logs to the cloud so they survive clearing Safari or switching phones. Enter the same code on another device to restore. <b>Check-in photos are NOT cloud-synced</b> — they stay on this device only, so export a backup if you want to keep them.</div>
            {syncCode ? (
              <div>
                <div className={`sync-status ${cloudStatus}`}>
                  {cloudStatus==='syncing'?'Syncing…':cloudStatus==='error'?('Sync error'+(cloudErr?' ('+cloudErr+')':'')+' — will retry on next change'):cloudStatus==='synced'?'✓ Backed up to cloud':'Connected'}
                </div>
                <div className="data-btns" style={{gridTemplateColumns:'1fr 1fr'}}>
                  <button className="data-btn" onClick={()=>syncNow()}>&#8593; Sync Now</button>
                  <button className="data-btn" onClick={()=>pullFromCloud()}>&#8595; Restore</button>
                </div>
                <button className="data-btn danger" style={{width:'100%',marginTop:8}} onClick={disconnectSync}>Disconnect Sync</button>
              </div>
            ) : (
              <div className="api-row">
                <div className="bf-lbl">Sync Code (min 8 characters)</div>
                <button className="data-btn" style={{width:'100%',marginBottom:6}} onClick={genSyncCode}>Generate secure code</button>
                <input className="api-in" type="text" autoCapitalize="none" autoCorrect="off" placeholder="generate one, or type an existing code" value={syncCodeInput} onChange={e=>setSyncCodeInput(e.target.value)}/>
                <div className="api-note">Anyone with this exact code can read and overwrite your data, and there's no rate limit on guesses &#8212; tap <b>Generate secure code</b> for a strong random one. Only type your own if you're restoring on a new device. Don't share or reuse it.</div>
                <button className="bf-save" style={{marginTop:6}} onClick={connectSync}>Enable Cloud Sync</button>
              </div>
            )}
          </div>
          <div className="tool-sec">
            <div className="tool-ttl">AI Coaching</div>
            <div className="tool-sub">AI runs through a server-side proxy — no API key is stored on this device</div>
            <div style={{fontSize:9,color:'var(--t3)',fontFamily:"'JetBrains Mono',monospace",marginTop:6}}>build {BUILD_ID}</div>
            <div className="api-note">The key lives in the Netlify ANTHROPIC_API_KEY env var, never in the browser. Nothing to enter here.</div>
          </div>
          <div className="tool-sec">
            <div className="tool-ttl">Data</div>
            <div className="tool-sub">Export a backup before any app update. Import restores full history.</div>
            <div className="data-btns">
              <button className="data-btn" onClick={exportData}>&#8595; Export Backup</button>
              <button className="data-btn" onClick={exportSummary}>&#128203; Summary (coach/AI)</button>
              <button className="data-btn" onClick={importData}>&#8593; Import Backup</button>
              <button className="data-btn danger" onClick={() => setClearConfirm(true)}>&#128465; Clear All Data</button>
            </div>
            <div className="ver">Diamond Protocol v2.0 — data stored in localStorage</div>
          </div>
        </div>
      );
}
