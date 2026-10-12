// CompleteView: moved out of App.jsx in Phase 2b. Behaviour unchanged.
import React from 'react';
import { useApp } from '../appContext';

export default function CompleteView() {
  const {
    dur, getReview, ormHL, review, reviewLoading, sess, setData, setView, totalSets, week
  } = useApp();
  return (
        <div className="done-view">
          <div className="done-icon">&#9889;</div>
          <div className="done-title">Session Done</div>
          <div className="done-sub">{sess?.name} — Week {week}</div>
          <div className="done-grid">
            <div className="done-stat"><div className="dsv">{totalSets}</div><div className="dsl">Sets Logged</div></div>
            <div className="done-stat"><div className="dsv">{dur}</div><div className="dsl">Minutes</div></div>
            <div className="done-stat"><div className="dsv">{Object.keys(setData).length}</div><div className="dsl">Exercises</div></div>
            <div className="done-stat"><div className="dsv">{week}</div><div className="dsl">Week</div></div>
          </div>
          {ormHL.length > 0 && (
            <div className="done-orms">
              <div className="done-orms-lbl">Estimated 1RMs today</div>
              {ormHL.map((o,i) => (
                <div key={i} className="done-orm-row">
                  <span className="done-orm-nm">{o.name}</span>
                  <span className="done-orm-val">{o.orm}kg</span>
                </div>
              ))}
            </div>
          )}
          <div className="review-wrap">
            <button className="review-btn" disabled={reviewLoading} onClick={getReview}>
              {reviewLoading ? 'Reviewing your session...' : '⚡ Get AI Session Review'}
            </button>
            {reviewLoading && <div className="review-loading">Comparing today against your history...</div>}
            {review && (
              <div className="review-panel">
                <div className="review-tag">Coach Review</div>
                <div className="review-text">{review}</div>
              </div>
            )}
          </div>
          <button className="done-home" onClick={() => setView('home')}>Back to Program</button>
        </div>
      );
}
