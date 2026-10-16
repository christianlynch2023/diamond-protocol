// Block review (Progress, under Week in review). Sessions against plan, each lift's start and end
// effort-adjusted e1RM, muscles under their floor, repeated joint flags, bodyweight change, and up to four
// suggestions for the next block. Shows "so far" during a block and "complete" once week 12 is done.
// Suggestions only; nothing here changes the programme.
import { useMemo, useState } from 'react';
import { useApp } from '../appContext';
import { DLW, MUSCLES } from '../data/programme';
import { totalLoad } from '../lib/training';
import { e1rmSet } from '../lib/strength';
import { blockReview } from '../lib/blockReview';

export default function BlockReview() {
  const { actualVol, block, bodyMetrics, bwAt, goalPhase, logs } = useApp();
  const [all, setAll] = useState(false);
  const r = useMemo(() => {
    try {
      return blockReview({
        logs: (logs || []) as any, block: block || 1, phase: goalPhase,
        isDeloadWeek: (w: number) => DLW.has(w),
        e1rm: (pid, s, l) => e1rmSet(totalLoad(pid, s.weight, bwAt, l.date), s as any),
        muscleAvg: (actualVol && actualVol.avg) || {}, muscles: (MUSCLES || {}) as any, weights: (bodyMetrics || []) as any,
      });
    } catch (e) { try { console.error('block review failed', e); } catch (_) { /* ignore */ } return null; }
  }, [logs, block, goalPhase, bwAt, actualVol, bodyMetrics]);
  if (!r || r.weeksDone < 2) return null;
  const lifts = all ? r.lifts : r.lifts.slice(0, 6);
  return (
    <div className="ar-card wr2 br2">
      <div className="hm-head"><span className="hm-ttl">Block {block || 1} review</span><span className="hm-wk">{r.complete ? 'complete' : `so far · week ${r.weeksDone} of 12`}</span></div>
      <div className="wr2-extra br2-top">
        <div><b>Sessions</b> {r.sessions.done} of {r.sessions.planned}{r.sessions.planned ? ` (${Math.round(r.sessions.done / r.sessions.planned * 100)}%)` : ''}</div>
        {r.bodyweight && <div><b>Bodyweight</b> {r.bodyweight.start} to {r.bodyweight.end} kg ({r.bodyweight.change > 0 ? '+' : ''}{r.bodyweight.change} kg, {r.bodyweight.perWeek > 0 ? '+' : ''}{r.bodyweight.perWeek} kg a week)</div>}
        {r.under.length > 0 && <div><b>Under floor</b> {r.under.map(u => `${u.name} ${u.have} of ${u.min}`).join(', ')} sets a week</div>}
        {r.pain.length > 0 && <div><b>Joint flags</b> {r.pain.map(p => `${p.name} (${p.sessions}${p.worst === 2 ? ', sharp' : ''})`).join(', ')}</div>}
      </div>
      {r.lifts.length > 0 ? (
        <div className="br2-lifts">
          <div className="ui-eyebrow">Strength, first two weeks to last two (effort-adjusted e1RM)</div>
          {lifts.map(l => (
            <div key={l.name} className="br2-lift">
              <span className="br2-n">{l.name}</span>
              <span className="br2-v">{l.start} to {l.end} kg</span>
              <span className="br2-p" style={{ color: l.pct < -2 ? 'var(--warn)' : l.pct > 2 ? 'var(--ok)' : 'var(--t2)' }}>{l.pct > 0 ? '+' : ''}{l.pct}%</span>
            </div>
          ))}
          {r.lifts.length > 6 && <button type="button" className="td2-link" onClick={() => setAll(v => !v)}>{all ? 'Show fewer' : `Show all ${r.lifts.length} lifts`}</button>}
        </div>
      ) : <div className="td2-meta">Strength comparison appears after four training weeks.</div>}
      <div className="wr2-focus">
        <div className="ui-eyebrow">{r.complete ? 'For the next block' : 'So far, for the next block'}</div>
        {r.suggestions.map((s, i) => <div key={i} className="wr2-act"><span className="wr2-n">{i + 1}</span>{s}</div>)}
      </div>
    </div>
  );
}
