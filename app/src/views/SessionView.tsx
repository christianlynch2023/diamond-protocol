// SessionView (session preview), round 2 (phase 5). Logic unchanged: intensity techniques toggle per
// exercise up to the session's cap, the 30-minute version dims non-core lifts, set plans show loads from
// last time, progression hints come from the engine, and the AI briefing is on demand.
// Changes: new header, no emoji, and the Start button stays pinned at the bottom of the screen.
import React from 'react';
import { useApp } from '../appContext';
import { CORE_EX, SESSIONS, getEffSets } from '../data/programme';
import { fmt } from '../lib/format';
import { getPrevHist, getProgRec } from '../lib/training';
import { Icon } from '../components/Icon';

export default function SessionView() {
  const {
    activeInts, briefing, briefingLoading, condensed, effPhase, getBriefing, hvActive, isDeload, logs,
    sel, sess, setActiveInts, setCondensed, setView, showInt, startWorkout, week, wr
  } = useApp();
  const totalSets = sess.exercises.reduce((a, ex) => a + getEffSets(ex, week, hvActive), 0);
  return (
    <div className="screen ss2">
      <button className="back-btn ss2-back" onClick={() => setView('home')}><Icon name="back" size={20} /> Train</button>
      <div className="s-hdr">
        <div className="ui-eyebrow">{sess.day} · {sess.time} · {wr.rir}</div>
        <div className="s-hdr-nm">{sess.name}</div>
        <div className="s-hdr-foc">{sess.focus} · {sess.exercises.length} exercises · {totalSets} sets</div>
        <div className="s-hdr-meta">
          {showInt && <span className="mp acc">Intensity techniques on</span>}
          {isDeload && <span className="mp warn">Deload week</span>}
        </div>
      </div>
      {showInt && (
        <div className="int-ctrl">
          <span className="int-ctrl-lbl">Intensity techniques, last set only</span>
          <span className={`int-count${activeInts.size >= sess.maxInt ? ' full' : ''}`}>{activeInts.size} of {sess.maxInt}</span>
        </div>
      )}
      <div className="cond-toggle-row">
        <span className="cond-lbl">Short on time?</span>
        <button className={`cond-btn${condensed ? ' on' : ''}`} onClick={() => setCondensed(c => !c)}>{condensed ? '30-min version on' : 'Show 30-min version'}</button>
      </div>
      <div className="ex-list">
        {sess.exercises.map((ex, i) => {
          const adj = getEffSets(ex, week, hvActive);
          const rec = getProgRec(ex.id, ex, logs, effPhase);
          return (
            <div key={ex.id} className={`ex-row${condensed && !CORE_EX[sess.id]?.has(ex.id) ? ' ex-dim' : ''}`}>
              <div className="ex-n">{i + 1}</div>
              <div className="ex-body">
                <div className={`ex-nm${ex.opt ? ' opt' : ''}`}>{ex.name}{ex.opt ? ' (optional)' : ''}{condensed && CORE_EX[sess.id]?.has(ex.id) ? <span className="core-tag">core</span> : null}</div>
                <div className="chips">
                  {adj > ex.sets ? <span className="chip" style={{ color: 'var(--acc)', borderColor: 'rgba(196,255,0,.3)', background: 'var(--ag2)' }}>{adj} sets (+{adj - ex.sets})</span> : adj < ex.sets ? <span className="chip dl">{adj} sets (deload)</span> : <span className="chip">{ex.sets} sets</span>}
                  <span className="chip">{ex.setPlan ? `${ex.setPlan[0].rMin}-${ex.setPlan[0].rMax} reps (top set)` : `${ex.rMin}-${ex.rMax} reps`}</span>
                  {ex.tempo && <span className="chip">{ex.tempo} tempo</span>}
                  <span className="chip rir">{ex.rirMin === ex.rirMax ? ex.rirMin : `${ex.rirMin}-${ex.rirMax}`} RIR</span>
                  <span className="chip">{fmt(ex.rest)} rest</span>
                  {ex.handle && <span className="chip">{ex.handle}</span>}
                </div>
                {ex.setPlan ? (() => {
                  // Explicit set-by-set plan, so the chip and the plan can never disagree mid-set.
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
                            <span className="sp-load">{sp.pct === 1 ? 'top load' : `-${Math.round((1 - sp.pct) * 100)}%`}{load ? ` \u00b7 ~${load}kg` : ''}</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })() : ex.struct ? <div className="ss2-struct">{ex.struct}</div> : null}
                {ex.avoidFail && <div><span className="chip avd">{ex.avoidReason}</span></div>}
                {rec.type === 'inc' && <div className="ss2-rec inc">Increase weight: every set hit the top of the range</div>}
                {rec.type === 'beat' && <div className="ss2-rec beat">Beat the reps on the weaker sets</div>}
                {showInt && ex.int && (
                  <div className="int-tog-row">
                    <span className="int-tog-desc">{ex.int.label}: {ex.int.desc}</span>
                    <button
                      className={`int-tog${activeInts.has(ex.id) ? ' on' : ''}`}
                      disabled={!activeInts.has(ex.id) && activeInts.size >= sess.maxInt}
                      onClick={() => { const s = new Set(activeInts); s.has(ex.id) ? s.delete(ex.id) : s.add(ex.id); setActiveInts(s); }}>
                      {activeInts.has(ex.id) ? 'On' : 'Off'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="briefing-wrap">
        <button className="briefing-btn" disabled={briefingLoading} onClick={() => getBriefing(sel)}>
          {briefingLoading ? 'Generating briefing…' : 'Get an AI coaching briefing'}
        </button>
        {briefingLoading && <div className="briefing-loading">Analysing your data…</div>}
        {briefing && briefing.session === SESSIONS[sel]?.name && (
          <div className="briefing-panel">
            <div className="briefing-tag">AI briefing · {briefing.session}</div>
            <div className="briefing-text">{briefing.text}</div>
          </div>
        )}
      </div>
      <div className="ss2-start">
        <button type="button" className="ui-btn ui-btn-primary ui-full" onClick={() => startWorkout(sel)}>Start {sess.name}</button>
      </div>
    </div>
  );
}
