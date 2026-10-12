// PrivacyView: moved out of App.jsx in Phase 2b. Behaviour unchanged.
import React from 'react';
import { useApp } from '../appContext';

export default function PrivacyView() {
  const {
    disconnectSync, disconnectWhoop, exportData, setView, storageBreakdown, syncCode, whoopConnected
  } = useApp();
  return (() => {
        const fmtB = b => b < 1024 ? b+' B' : b < 1048576 ? (b/1024).toFixed(1)+' KB' : (b/1048576).toFixed(2)+' MB';
        const syncOn = !!syncCode;
        const total = storageBreakdown.total;
        const QUOTA = 5 * 1048576; // ~5MB typical localStorage limit
        const pct = Math.min(100, Math.round(total / QUOTA * 100));
        return (
          <div className="screen">
            <div className="topbar"><span className="logo">Privacy</span><span className="top-badge">{fmtB(total)} on device</span></div>
            <div style={{fontSize:12,color:'var(--t2)',lineHeight:1.6,margin:'4px 0 14px'}}>Everything below is stored on <b>this device</b> in the browser. Nothing is sold or shared. Data leaves this device only when you sync to the cloud or export a backup &#8212; and check-in photos never leave at all.</div>

            <div style={{background:'var(--crd)',border:'1px solid var(--bdr)',borderRadius:12,padding:14,marginBottom:12}}>
              <div style={{fontSize:14,fontWeight:800,marginBottom:2}}>On-device storage</div>
              <div style={{fontSize:11,color:'var(--t3)',marginBottom:10}}>Approx {fmtB(total)} of a ~5 MB browser limit ({pct}%). Photos are usually the heavy item.</div>
              <div style={{height:6,background:'var(--sur)',borderRadius:3,overflow:'hidden',marginBottom:12}}><div style={{width:pct+'%',height:'100%',background:pct>80?'var(--err)':pct>50?'var(--warn)':'var(--acc)'}}/></div>
              {storageBreakdown.rows.map((r,i)=>(
                <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderTop:i?'1px solid var(--bdr)':'none',fontSize:12}}>
                  <span style={{color:'var(--t)'}}>{r.name}</span>
                  <span style={{color:'var(--t3)',fontFamily:"'JetBrains Mono',monospace"}}>{fmtB(r.bytes)}</span>
                </div>
              ))}
            </div>

            <div style={{background:'var(--crd)',border:'1px solid var(--bdr)',borderRadius:12,padding:14,marginBottom:12}}>
              <div style={{fontSize:14,fontWeight:800,marginBottom:8}}>Connected services</div>
              <div style={{fontSize:12,color:'var(--t2)',lineHeight:1.6}}>
                <div>&#8226; <b>Cloud sync:</b> {syncOn ? 'on — training, body, nutrition & health sync to Netlify Blobs. Photos do NOT sync.' : 'off — data stays on this device only.'}</div>
                <div style={{marginTop:6}}>&#8226; <b>WHOOP:</b> {whoopConnected ? 'connected — recovery/sleep read from WHOOP on app open.' : 'not connected.'}</div>
                <div style={{marginTop:6}}>&#8226; <b>AI coaching:</b> runs through a server-side proxy. No API key is stored on this device.</div>
              </div>
            </div>

            <div style={{background:'var(--crd)',border:'1px solid var(--bdr)',borderRadius:12,padding:14,marginBottom:12}}>
              <div style={{fontSize:14,fontWeight:800,marginBottom:8}}>Your controls</div>
              <button className="data-btn" style={{width:'100%',marginBottom:8}} onClick={exportData}>&#8595; Export a backup</button>
              {syncOn && <button className="data-btn" style={{width:'100%',marginBottom:8}} onClick={disconnectSync}>Disconnect cloud sync (keeps local data)</button>}
              {whoopConnected && <button className="data-btn" style={{width:'100%',marginBottom:8}} onClick={disconnectWhoop}>Disconnect WHOOP (local token only)</button>}
              <button className="data-btn danger" style={{width:'100%'}} onClick={()=>setView('tools')}>Clear all data &#8594; in Tools</button>
            </div>

            <div style={{background:'rgba(212,160,23,.08)',border:'1px solid rgba(212,160,23,.3)',borderRadius:12,padding:14,marginBottom:12}}>
              <div style={{fontSize:13,fontWeight:800,color:'var(--warn)',marginBottom:6}}>What this app can&#8217;t do for you</div>
              <div style={{fontSize:12,color:'var(--t2)',lineHeight:1.6}}>
                <div>&#8226; <b>Revoke WHOOP access:</b> disconnecting here only deletes the local token. To fully revoke, go to your WHOOP account &#8594; Connected Apps.</div>
                <div style={{marginTop:6}}>&#8226; <b>Delete cloud data:</b> use &#8220;Clear all data&#8221; in Tools &#8212; it deletes the cloud snapshot too.</div>
                <div style={{marginTop:6}}>&#8226; <b>Rotate secrets:</b> the AI key and any tokens live in your Netlify/provider consoles, not here.</div>
              </div>
            </div>
          </div>
        );
      })();
}
