// CompleteView, round 2 (phase 5). Same data as before (sets, minutes, exercises, week, estimated 1RMs,
// AI review), plus a summary of any joint or tendon discomfort you flagged during the session.
import React from 'react';
import { useApp } from '../appContext';
import { painFlags } from '../lib/workout';
import { Icon } from '../components/Icon';

export default function CompleteView() {
  const {
    dur, getReview, ormHL, painData, review, reviewLoading, sess, setData, setView, subMap, totalSets, week
  } = useApp();
  // painData is keyed by the exercise id as performed (a swap's id when swapped), so look names up both ways.
  const nameOf = (id: string) => {
    const ex = sess ? sess.exercises.find(e => e.id === id || (subMap && subMap[e.id] && subMap[e.id].id === id)) : null;
    return ex ? ((subMap && subMap[ex.id] && subMap[ex.id].name) || ex.name) : id;
  };
  const pain = painFlags(painData, nameOf);
  return (
    <div className="done-view dn2">
      <span className="dn2-check"><Icon name="check" size={28} strokeWidth={2.6} /></span>
      <div className="ui-eyebrow">Week {week}</div>
      <div className="done-title">{sess?.name} done</div>
      <div className="done-grid">
        <div className="done-stat"><div className="dsv">{totalSets}</div><div className="dsl">sets logged</div></div>
        <div className="done-stat"><div className="dsv">{dur}</div><div className="dsl">minutes</div></div>
        <div className="done-stat"><div className="dsv">{Object.keys(setData).length}</div><div className="dsl">exercises</div></div>
        <div className="done-stat"><div className="dsv">{week}</div><div className="dsl">week</div></div>
      </div>
      {ormHL.length > 0 && (
        <div className="done-orms">
          <div className="done-orms-lbl">Estimated 1RMs today</div>
          {ormHL.map((o, i) => (
            <div key={i} className="done-orm-row">
              <span className="done-orm-nm">{o.name}</span>
              <span className="done-orm-val">{o.orm} kg</span>
            </div>
          ))}
        </div>
      )}
      <div className="done-orms">
        <div className="done-orms-lbl">Joint check</div>
        {pain.length === 0
          ? <div className="done-orm-row"><span className="done-orm-nm">No discomfort flagged</span><span className="dn2-ok">clear</span></div>
          : pain.map((p, i) => (
            <div key={i} className="done-orm-row">
              <span className="done-orm-nm">{p.name}</span>
              <span className={p.level === 2 ? 'dn2-sharp' : 'dn2-niggle'}>{p.level === 2 ? 'sharp' : 'niggle'}</span>
            </div>
          ))}
        {pain.length > 0 && <div className="dn2-note">Saved with the session. Progress shows the joint pain trend.</div>}
      </div>
      <div className="review-wrap">
        <button className="review-btn" disabled={reviewLoading} onClick={getReview}>
          {reviewLoading ? 'Reviewing your session…' : 'Get an AI session review'}
        </button>
        {reviewLoading && <div className="review-loading">Comparing today against your history…</div>}
        {review && (
          <div className="review-panel">
            <div className="review-tag">Coach review</div>
            <div className="review-text">{review}</div>
          </div>
        )}
      </div>
      <button type="button" className="ui-btn ui-btn-primary ui-full dn2-done" onClick={() => setView('today')}>Done</button>
      <button type="button" className="td2-link" onClick={() => setView('home')}>Back to Train</button>
    </div>
  );
}
