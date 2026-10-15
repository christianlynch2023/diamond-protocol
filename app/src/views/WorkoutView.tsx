// WorkoutView, round 2 (phase 5). Same handlers as before (logSet, edit by tapping a set, swap, skip,
// back, end, pain, intensifier capture); the layout changes:
//  - a last-time vs today set table replaces the dots and set chips
//  - the engine's target is the only target shown
//  - rest runs inline: while it runs, logging and editing are locked so a second tap can't advance the
//    session twice; the countdown, its message and Skip rest take the Log button's place.
import React, { useState } from 'react';
import { useApp } from '../appContext';
import { effWR, intBadge } from '../data/programme';
import { fmt, fmtShort } from '../lib/format';
import { getIncrement, totalLoad, volLoad } from '../lib/training';
import { e1rmEffort } from '../lib/strength';
import { equipmentFor } from '../lib/equipment';
import { guessKind, platesPerSide } from '../lib/plates';
import { restLeft, setRows } from '../lib/workout';

export default function WorkoutView() {
  const {
    activeInts, bwAt, CIRC, clearIntInputs, curEx, curSetPhase, curSetWeight, curTarget, dashOff, dur, editIdx, effSets,
    exIdx, goToExercise, intEligible, intFail, intKind, intMyoStr, intPartials, logSet, loggedSetsArr,
    painData, painRef, prevHist, progRec, rir, rp, sess, setData, setEditIdx, setIntFail, setIntMyoStr,
    setIntPartials, setPainData, setRir, setRp, setShowSwap, setSkipConfirm, setWt, skipTimer, subMap, timerMsg, timerOn,
    timerSecs, tryFinish, week, wt
  } = useApp();
  const [showHist, setShowHist] = useState(false);

  const last = prevHist && prevHist[0] ? prevHist[0] : null;
  const rows = setRows(effSets, loggedSetsArr, last ? last.sets : null, editIdx);
  const nextBase = sess.exercises[exIdx + 1];
  const nextName = nextBase ? ((subMap && subMap[nextBase.id] && subMap[nextBase.id].name) || nextBase.name) : null;
  const fmtSet = (x: any) => `${x.weight} × ${x.reps}${x.rir != null && x.rir !== '' ? ' @' + x.rir : ''}`;
  const startEdit = (i: number) => {
    if (timerOn) return;                    // locked during rest
    const s = loggedSetsArr[i];
    if (!s) return;
    if (editIdx === i) { setEditIdx(null); clearIntInputs(); return; }
    setEditIdx(i); setWt(s.weight); setRp(s.reps); setRir(s.rir ?? effWR(week).rirN);
    const it = s.intensifier; setIntPartials(it && it.partialReps ? String(it.partialReps) : ''); setIntMyoStr(it && it.myoReps ? it.myoReps.join(',') : ''); setIntFail(!!(it && it.kind === 'failure'));
  };
  const left = restLeft(dashOff, CIRC);
  // Your real weight jump for this exercise (Settings > Tools and data), and plates per side if it's plate-loaded.
  const step = getIncrement(curEx);
  const kit = equipmentFor(curEx.id);
  const isPlates = (kit.kind || guessKind(curEx.name || '')) === 'plates';
  const plates = isPlates ? platesPerSide(parseFloat(wt), kit.base || 0) : null;

  return (
    <div className="fullscreen wo2">
      <div className="wo2-top">
        <div className="wo2-top-row">
          <span className="wo2-sess">{sess.name} · Week {week}</span>
          <span className="ui-fig ui-fig-m">{dur} min</span>
        </div>
        <div className="wo2-segs" style={{ gridTemplateColumns: `repeat(${sess.exercises.length}, minmax(0, 1fr))` }}>
          {sess.exercises.map((ex, i) => {
            const eid = subMap && subMap[ex.id] ? subMap[ex.id].id : ex.id;
            const done = !!(setData[eid] && setData[eid].length);
            return <span key={ex.id} className={'wo2-seg' + (i === exIdx ? ' cur' : done ? ' done' : '')} />;
          })}
        </div>
        <div className="wo2-top-row">
          <span className="ui-eyebrow">Exercise {exIdx + 1} of {sess.exercises.length}</span>
          {nextName && <span className="td2-meta">Next: {nextName}</span>}
        </div>
      </div>

      <div className="wo2-body">
        <div>
          <h1 className="wo2-name">{curEx.name}{curEx.opt ? ' (optional)' : ''}</h1>
          <div className="wo2-spec">
            {effSets} sets · {curSetPhase ? `${curSetPhase.rMin}-${curSetPhase.rMax}` : `${curEx.rMin}-${curEx.rMax}`} reps · {curEx.rirMin === curEx.rirMax ? curEx.rirMin : `${curEx.rirMin}-${curEx.rirMax}`} RIR · {fmt(curEx.rest)} rest{curEx.handle ? ' · ' + curEx.handle : ''}
          </div>
        </div>

        {curTarget && !curTarget.first ? (
          <div className="wo2-target">
            <div className="wo2-target-row">
              <span className="ui-eyebrow">Target</span>
              <span className="ui-fig ui-fig-m">{curSetPhase ? `${curSetWeight} kg × ${curSetPhase.rMin}-${curSetPhase.rMax}` : `${curTarget.weight} kg × ${curEx.rMin}-${curEx.rMax}`}</span>
            </div>
            {curSetPhase && <div className="td2-meta">{curSetPhase.label}{curSetPhase.pct !== 1 ? ` · ${Math.round((1 - curSetPhase.pct) * 100)}% off top set` : ' · heaviest set of the day'}</div>}
            {curTarget.note && <div className="td2-meta">{curTarget.note}</div>}
          </div>
        ) : progRec ? (
          <div className={`prog-rec ${progRec.type}`}>{progRec.msg}</div>
        ) : null}

        {(curEx.cues && curEx.cues.length > 0) && <div className="wo2-cues">{curEx.cues.map((c, i) => <span key={i} className="cue">{c}</span>)}</div>}
        {activeInts.has(curEx.id) && curEx.int && <div className="int-box"><div className="int-lbl">{curEx.int.label}</div><div className="int-txt">{curEx.int.desc}</div></div>}
        {curEx.avoidFail && <div className="avd-box">{curEx.avoidReason}</div>}

        <div className="wo2-table">
          <div className="wo2-tr wo2-th"><span>Set</span><span>Last time{last ? ' · ' + fmtShort(last.date) : ''}</span><span>Today</span></div>
          {rows.map((r, i) => (
            <button type="button" key={r.n} className={'wo2-tr ' + r.state} disabled={!r.today || timerOn} onClick={() => startEdit(i)}>
              <span className="wo2-n">{r.n}</span>
              <span className="wo2-last">{r.last ? fmtSet(r.last) : '—'}</span>
              <span className="wo2-today">
                {r.today ? fmtSet(r.today) : r.state === 'current' ? 'Next' : '—'}
                {r.today && (r.today as any).intensifier && <span className="ls-int"> {intBadge((r.today as any).intensifier)}</span>}
                {r.beat && <span className="wo2-beat">+</span>}
                {r.state === 'editing' && <span className="wo2-editing">editing</span>}
              </span>
            </button>
          ))}
          <div className="td2-meta">{loggedSetsArr.length} of {effSets} done. Tap a logged set to change it.</div>
        </div>

        <div className="inp-sec wo2-inputs">
          <div className="inp-row">
            <div className="inp-grp">
              <div className="inp-lbl">Weight kg</div>
              <div className="nw">
                <button className="nb" aria-label="Less weight" onClick={() => setWt(v => Math.max(0, Math.round((parseFloat(v || 0) - step) * 100) / 100))}>&#8722;</button>
                <input className="ni" type="number" inputMode="decimal" value={wt} onChange={e => setWt(e.target.value)} />
                <button className="nb" aria-label="More weight" onClick={() => setWt(v => Math.round((parseFloat(v || 0) + step) * 100) / 100)}>+</button>
              </div>
              {plates && <div className="wo2-plates">{plates.side.length ? 'Per side: ' + plates.side.join(' · ') : (kit.base ? 'Empty bar or sled' : '')}{plates.leftover ? ' (+' + plates.leftover + ' kg unmatched)' : ''}</div>}
              <div className="wo2-step">± {step} kg</div>
            </div>
            <div className="inp-grp">
              <div className="inp-lbl">Reps</div>
              <div className="nw">
                <button className="nb" aria-label="Fewer reps" onClick={() => setRp(v => Math.max(1, parseInt(v || 1) - 1))}>&#8722;</button>
                <input className="ni" type="number" inputMode="numeric" value={rp} onChange={e => setRp(e.target.value)} />
                <button className="nb" aria-label="More reps" onClick={() => setRp(v => parseInt(v || 0) + 1)}>+</button>
              </div>
            </div>
          </div>
          <div className="rir-grp">
            <div className="inp-lbl">Reps in reserve</div>
            <div className="rir-row">
              {[0, 1, 2, 3, '4+'].map(r => (
                <button key={r} className={`rirb${rir === r ? ' on' : ''}`} onClick={() => setRir(r)}>{r}</button>
              ))}
            </div>
          </div>
          {curEx.orm && parseInt(rp) > 0 && parseFloat(wt) > 0 && (
            <div className="td2-meta">Estimated 1RM for this set: <b className="wo2-orm">{e1rmEffort(totalLoad(curEx.id, parseFloat(wt), bwAt, new Date().toISOString()), parseInt(rp), rir)} kg</b></div>
          )}
        </div>

        {intEligible && (
          <div className="int-cap">
            <div className="int-cap-hd">{curEx.int.label} · final set{(painData[curEx.id] || 0) === 2 ? ' · sharp pain flagged, skip if it bites' : ''}</div>
            {(intKind === 'partials' || intKind === 'partials_failure') && (
              <div className="int-cap-row">
                <span className="int-cap-lbl">Lengthened partials</span>
                <div className="nw sm">
                  <button className="nb" onClick={() => setIntPartials(v => String(Math.max(0, (parseInt(v) || 0) - 1)))}>&#8722;</button>
                  <input className="ni" type="number" inputMode="numeric" placeholder="0" value={intPartials} onChange={e => setIntPartials(e.target.value)} />
                  <button className="nb" onClick={() => setIntPartials(v => String((parseInt(v) || 0) + 1))}>+</button>
                </div>
              </div>
            )}
            {intKind === 'myo' && (
              <div className="int-cap-row">
                <span className="int-cap-lbl">Mini-set reps</span>
                <input className="ni wide" type="text" inputMode="numeric" placeholder="e.g. 5,4,3,3" value={intMyoStr} onChange={e => setIntMyoStr(e.target.value)} />
              </div>
            )}
            {(intKind === 'failure' || intKind === 'partials_failure') && (
              <button className={`int-cap-fail${intFail ? ' on' : ''}`} onClick={() => setIntFail(v => !v)}>{intFail ? '\u2713 Taken to failure' : 'Mark taken to failure'}</button>
            )}
            <div className="int-cap-note">Recorded separately. Never counts toward your working reps, e1RM or progression.</div>
          </div>
        )}

        <div className="pain-sec wo2-pain">
          <div className="pain-lbl">Joint or tendon discomfort on this exercise</div>
          <div className="pain-row">
            {[[0, 'None'], [1, 'Niggle'], [2, 'Sharp']].map(([v, l]) => {
              const on = (painData[curEx.id] || 0) === v;
              const extra = v === 2 ? ' sharp' : v === 1 ? ' warn' : '';
              return <button key={v} className={`painb${on ? ' on' + extra : ''}`} onClick={() => { const np = { ...painData, [curEx.id]: v }; setPainData(np); painRef.current = np; }}>{l}</button>;
            })}
          </div>
        </div>

        {timerOn ? (
          <div className="wo2-rest" role="timer" aria-live="polite">
            <div className="wo2-rest-row">
              <span className="td2-ml">Rest{timerMsg ? ' · ' + timerMsg : ''}</span>
              <span className="ui-fig ui-fig-l">{fmt(timerSecs)}</span>
            </div>
            <span className="wo2-rest-track"><span className="wo2-rest-fill" style={{ width: (left * 100) + '%' }} /></span>
            <button type="button" className="ui-btn ui-btn-ghost ui-full" onClick={skipTimer}>Skip rest</button>
          </div>
        ) : (
          <button type="button" className={`ui-btn ui-btn-primary ui-full${editIdx !== null ? ' wo2-upd' : ''}`} onClick={logSet}>
            {editIdx !== null ? `Update set ${editIdx + 1}` : `Log set ${loggedSetsArr.length + 1}`}
          </button>
        )}

        {prevHist.length > 0 && (
          <div className="wo2-hist">
            <button type="button" className="td2-link" onClick={() => setShowHist(v => !v)}>{showHist ? 'Hide' : 'Show'} the last {prevHist.length} sessions</button>
            {showHist && prevHist.map((h, i) => {
              const vl = volLoad(h.sets);
              const older = prevHist[i + 1];
              const olderVl = older ? volLoad(older.sets) : null;
              const pct = (olderVl && olderVl > 0) ? Math.round(((vl - olderVl) / olderVl) * 100) : null;
              return (
                <div key={i} className="prev-item">
                  <span className="prev-dt">{fmtShort(h.date)}</span>
                  <span>{h.sets.map(x => `${x.weight}\u00d7${x.reps}${x.intensifier ? ' (' + intBadge(x.intensifier) + ')' : ''}`).join('  ')}</span>
                  <span className="prev-prog" style={{ color: 'var(--t3)' }}>{vl.toLocaleString()}kg{pct !== null ? ` (${pct >= 0 ? '+' : ''}${pct}%)` : ''}</span>
                  {h.swapped && <span className="prev-prog" style={{ color: 'var(--t3)' }}>via {h.swapped}</span>}
                  {i === 0 && progRec?.type === 'inc' && <span className="prev-prog">add weight</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="wk-nav wo2-nav">
        <button className="wnb" disabled={exIdx === 0 || timerOn} onClick={() => goToExercise(exIdx - 1)}>Back</button>
        <button className="wnb" disabled={timerOn} onClick={() => setShowSwap(true)}>Swap</button>
        <button className="wnb" disabled={timerOn} onClick={() => setSkipConfirm(true)}>Skip</button>
        <button className="wnb fin" disabled={timerOn} onClick={() => tryFinish(setData)}>End</button>
      </div>
    </div>
  );
}
