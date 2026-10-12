// Split out of App.jsx in Phase 2. Behaviour unchanged.
import React from 'react';

// Top-level error boundary. Without this, any render exception unmounts the whole tree and the
// screen goes black with no clue and no recovery. This catches it, shows the actual message, and
// gives a way back — the in-progress session lives in dp_wip, so it is offered for resume on reload.
export class RootBoundary extends React.Component<{ children?: any }, { err: any; info: any }> {
  constructor(p){ super(p); this.state={ err:null, info:null }; }
  static getDerivedStateFromError(err){ return { err }; }
  componentDidCatch(err, info){ this.setState({ info }); try{ console.error('Diamond crash:', err, info); }catch(e){} }
  render(){
    if(!this.state.err) return this.props.children;
    const e=this.state.err;
    let hasWip=false; try{ hasWip=!!localStorage.getItem('dp_wip'); }catch(_){}
    const box={maxWidth:520,margin:'40px auto',padding:'20px',fontFamily:"'JetBrains Mono',monospace",color:'#e8e8e8',background:'#141414',border:'1px solid #333',borderRadius:12};
    const btn={display:'inline-block',marginTop:14,marginRight:10,padding:'10px 16px',borderRadius:8,border:'1px solid #444',background:'#1e1e1e',color:'#c4ff00',fontFamily:"'JetBrains Mono',monospace",fontSize:13,cursor:'pointer'};
    return React.createElement('div',{style:box},
      React.createElement('div',{style:{color:'#ff5555',fontWeight:700,letterSpacing:'.06em',marginBottom:10}},'SOMETHING THREW — the app caught it'),
      hasWip
        ? React.createElement('div',{style:{fontSize:12,color:'#8a8a8a',marginBottom:12}},'Your in-progress session is saved. Reload and it will offer to resume — you have not lost your logged sets.')
        : React.createElement('div',{style:{fontSize:12,color:'#8a8a8a',marginBottom:12}},'No in-progress session was saved at the point of the error.'),
      React.createElement('div',{style:{fontSize:12,color:'#c4ff00',marginBottom:6}},'Error'),
      React.createElement('pre',{style:{whiteSpace:'pre-wrap',fontSize:11,color:'#ddd',background:'#0c0c0c',padding:10,borderRadius:8,border:'1px solid #262626',overflow:'auto',maxHeight:220}},
        String(e && (e.stack || e.message || e))),
      React.createElement('div',null,
        React.createElement('button',{style:btn,onClick:()=>location.reload()},'Reload'),
        React.createElement('button',{style:{...btn,color:'#e8e8e8'},onClick:()=>{ try{ navigator.clipboard.writeText(String(e && (e.stack||e.message||e))); }catch(_){} }},'Copy error')
      )
    );
  }
}
