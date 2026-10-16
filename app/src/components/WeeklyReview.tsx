// Week in review (Progress), upgraded. Keeps the existing weekly checks (sessions, volume, calories,
// protein, weight rate, blood pressure, flagged lifts) and adds the strength picture, recovery against
// your normal range, logging consistency, and this week's focus: up to two concrete actions from your
// own rules. Suggestions only; nothing here changes targets or the programme.
import { useApp } from '../appContext';
import { MUSCLES } from '../data/programme';
import { localDateStr, metricView } from '../lib/today';
import { loggingWeek, strengthMix, weekVsNormal, weeklyFocus } from '../lib/weekly';

const MARK: Record<string, [string, string]> = { good: ['\u2713', 'var(--ok)'], ok: ['!', 'var(--warn)'], miss: ['\u2715', 'var(--err)'] };

export default function WeeklyReview() {
  const { actualVol, bodyMetrics, bpStats, bwRate, calStats, goalPhase, nutrition, stalls, weekReview, whoopHistory } = useApp();
  if (!weekReview) return null;
  try {
    const items: any[] = weekReview.items || [];
    const todayStr = localDateStr(new Date());
    const mix = strengthMix(stalls);
    const rec = metricView(whoopHistory || [], 'recovery', todayStr);
    const hrv = metricView(whoopHistory || [], 'hrv', todayStr);
    const recW = weekVsNormal(rec.last7, rec.band);
    const hrvW = weekVsNormal(hrv.last7, hrv.band);
    const logW = loggingWeek(nutrition || [], bodyMetrics || [], todayStr);
    const sess = items.find(i => i.k === 'Sessions');
    const sm = sess ? /(\d+)\s*\/\s*(\d+)/.exec(String(sess.v)) : null;
    const sessionsShort = sm ? Math.max(0, Number(sm[2]) - Number(sm[1])) : 0;
    const underMuscles = Object.entries((MUSCLES || {}) as Record<string, any>)
      .filter(([k, m]) => m && !m.optional && typeof m.min === 'number' && ((actualVol && actualVol.avg && actualVol.avg[k]) || 0) < m.min)
      .map(([k, m]) => ({ name: String(m.label || m.name || k).toLowerCase(), have: (actualVol && actualVol.avg && actualVol.avg[k]) || 0, min: m.min }))
      .sort((a, b) => a.have / a.min - b.have / b.min);
    const focus = weeklyFocus(items, {
      phase: goalPhase, sessionsShort, underMuscles,
      calDelta: calStats ? calStats.calDelta : null, pDelta: calStats ? calStats.pDelta : null,
      weightPct: bwRate ? bwRate.pctWeek : null, declining: mix.declining,
      bp: bpStats ? { sys: bpStats.avgSys, dia: bpStats.avgDia } : null,
    });
    const where = (w: string | null) => (w === 'below' ? ' (below your normal)' : w === 'above' ? ' (above your normal)' : w === 'within' ? ' (normal)' : '');

    return (
      <div className="ar-card wr2">
        <div className="hm-head"><span className="hm-ttl">Week in review</span><span className="hm-wk">last 7 days</span></div>
        {items.map((it, i) => {
          const [sym, col] = MARK[it.verdict] || MARK.miss;
          return (
            <div key={i} className="wr2-row">
              <span className="wr2-mark" style={{ color: col }}>{sym}</span>
              <span className="wr2-k">{it.k}</span>
              <span className="wr2-v">{it.v}</span>
              <span className="wr2-note">{it.note}</span>
            </div>
          );
        })}
        <div className="wr2-extra">
          {mix.total > 0 && <div><b>Strength</b> {mix.gaining} gaining · {mix.holding} holding · {mix.declining.length} declining{goalPhase === 'cut' ? '. On a cut, holding is the goal.' : ''}</div>}
          {recW.avg !== null && <div><b>Recovery</b> averaged {Math.round(recW.avg)}%{where(recW.where)}{hrvW.avg !== null ? `, HRV ${Math.round(hrvW.avg)} ms${where(hrvW.where)}` : ''}</div>}
          <div><b>Logging</b> food on {logW.foodDays} of 7 days · weighed on {logW.weighDays} of 7</div>
        </div>
        <div className="wr2-focus">
          <div className="ui-eyebrow">This week{'\u2019'}s focus</div>
          {focus.length === 0
            ? <div className="wr2-act">Nothing off target. Hold the line.</div>
            : focus.map((a, i) => <div key={i} className={'wr2-act ' + a.sev}><span className="wr2-n">{i + 1}</span>{a.text}</div>)}
        </div>
      </div>
    );
  } catch (e) {
    try { console.error('weekly review failed', e); } catch (_) { /* ignore */ }
    return null;
  }
}
