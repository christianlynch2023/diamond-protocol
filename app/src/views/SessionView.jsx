// SessionView: moved out of App.jsx in Phase 2b. Behaviour unchanged.
import React from 'react';
import { useApp } from '../appContext.js';
import { CORE_EX, SESSIONS, getEffSets } from '../data/programme';
import { fmt } from '../lib/format';
import { getPrevHist, getProgRec } from '../lib/training';

export default function SessionView() {
  const {
    activeInts, briefing, briefingLoading, condensed, effPhase, getBriefing, hvActive, isDeload, logs,
    sel, sess, setActiveInts, setCondensed, setView, showInt, startWorkout, week, wr
  } = useApp();
  return (
        <div className="screen">
          <button className="back-btn" onClick={() => setView('home')}>&#8592; Back</button>
          <div className="s-hdr">
            <div className="s-hdr-nm">{sess.name}</div>
            <div className="s-hdr-foc">{sess.focus}</div>
            <div className="s-hdr-meta">
              <span className="mp">{sess.day}</span><span className="mp">{sess.time}</span><span className="mp">{wr.rir}</span>
              {showInt && <span className="mp acc">Intensifiers ON</span>}
              {isDeload && <span className="mp warn">Deload</span>}
            </div>
          </div>
          {showInt && (
            <div className="int-ctrl">
              <span className="int-ctrl-lbl">Intensifiers active</span>
              <span className={`int-count${activeInts.size>=sess.maxInt?' full':''}`}>{activeInts.size} / {sess.maxInt}</span>
            </div>
          )}
          <div className="cond-toggle-row">
            <span className="cond-lbl">Short on time?</span>
            <button className={`cond-btn${condensed?' on':''}`} onClick={() => setCondensed(c => !c)}>{condensed?'30-min version ON':'Show 30-min version'}</button>
          </div>
          <div className="ex-list">
            {sess.exercises.map((ex, i) => {
              const adj = getEffSets(ex, week, hvActive);
              const rec = getProgRec(ex.id, ex, logs, effPhase);
              return (
                <div key={ex.id} className={`ex-row${condensed && !CORE_EX[sess.id]?.has(ex.id) ? ' ex-dim' : ''}`}>
                  <div className="ex-n">{i+1}</div>
                  <div className="ex-body">
                    <div className={`ex-nm${ex.opt?' opt':''}`}>{ex.name}{ex.opt?' (opt)':''}{condensed && CORE_EX[sess.id]?.has(ex.id) ? <span className="core-tag">core</span> : null}</div>
                    <div className="chips">
                      {adj>ex.sets ? <span className="chip" style={{color:'var(--acc)',borderColor:'rgba(196,255,0,.3)',background:'var(--ag2)'}}>{adj}x (+{adj-ex.sets})</span> : adj<ex.sets ? <span className="chip dl">{adj}x (deload)</span> : <span className="chip">{ex.sets}x</span>}
                      <span className="chip">{ex.setPlan ? `${ex.setPlan[0].rMin}-${ex.setPlan[0].rMax} reps (top set)` : `${ex.rMin}-${ex.rMax} reps`}</span>
                      {ex.tempo && <span className="chip">{ex.tempo} tempo</span>}
                      <span className="chip rir">{ex.rirMin===ex.rirMax?ex.rirMin:`${ex.rirMin}-${ex.rirMax}`} RIR</span>
                      <span className="chip">{fmt(ex.rest)} rest</span>
                      {ex.handle && <span className="chip">{ex.handle}</span>}
                    </div>
                    {ex.setPlan ? (() => {
                      // Explicit set-by-set plan. The old free-text 'struct' line disagreed with
                      // the rep chip (chip showed the whole 6-10 envelope while the note said
                      // "top set 6-8, back-offs 8-10"), forcing the user to reconcile it mid-set.
                      const topW = (() => {
                        const ph = getPrevHist(ex.id, logs, 1)[0];
                        if (!ph || !ph.sets || !ph.sets.length) return null;
                        return Math.max(...ph.sets.map(s => s.weight || 0)) || null;
                      })();
                      let n = 0;
                      return (
                        <div className="setplan">
                          {ex.setPlan.map((sp, si) => {
                            const from = n + 1; n += sp.sets; const to = n;
                            const lbl = sp.sets > 1 ? `Sets ${from}-${to}` : `Set ${from}`;
                            const load = topW ? Math.round(topW * sp.pct / 2.5) * 2.5 : null;
                            return (
                              <div key={si} className="sp-row">
                                <span className="sp-set">{lbl}</span>
                                <span className="sp-lbl">{sp.label}</span>
                                <span className="sp-reps">{sp.rMin}-{sp.rMax}</span>
                                <span className="sp-load">{sp.pct===1 ? 'top load' : `-${Math.round((1-sp.pct)*100)}%`}{load ? ` \u00b7 ~${load}kg` : ''}</span>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })() : ex.struct ? <div style={{fontSize:10,color:'var(--mut)',marginTop:3}}>{ex.struct}</div> : null}
                    {ex.avoidFail && <div><span className="chip avd">{ex.avoidReason}</span></div>}
                    {rec.type==='inc' && <div style={{fontSize:10,color:'var(--ok)',marginTop:4}}>&#9650; Increase weight — all sets hit top range</div>}
                    {rec.type==='beat' && <div style={{fontSize:10,color:'var(--acc)',marginTop:4}}>&#8594; Beat reps on weaker sets</div>}
                    {showInt && ex.int && (
                      <div className="int-tog-row">
                        <span className="int-tog-desc">{ex.int.label}: {ex.int.desc}</span>
                        <button
                          className={`int-tog${activeInts.has(ex.id)?' on':''}`}
                          disabled={!activeInts.has(ex.id) && activeInts.size>=sess.maxInt}
                          onClick={() => {const s=new Set(activeInts);s.has(ex.id)?s.delete(ex.id):s.add(ex.id);setActiveInts(s);}}>
                          {activeInts.has(ex.id)?'ON':'OFF'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="briefing-wrap">
            <button className="briefing-btn" disabled={briefingLoading} onClick={()=>getBriefing(sel)}>
              {briefingLoading?'Generating briefing...':'⚡ Get AI Coaching Briefing'}
            </button>
            {briefingLoading&&<div className="briefing-loading">Analysing your data...</div>}
            {briefing&&briefing.session===SESSIONS[sel]?.name&&(
              <div className="briefing-panel">
                <div className="briefing-tag">AI Briefing — {briefing.session}</div>
                <div className="briefing-text">{briefing.text}</div>
              </div>
            )}
          </div>
          <button className="start-btn" onClick={() => startWorkout(sel)}>Start Workout &#8594;</button>
        </div>
      );
}
