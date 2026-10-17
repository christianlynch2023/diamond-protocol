// Health watch (Body, under the summary tiles). The markers that matter most on your protocol, from every
// stored blood panel: what needs attention first (act, then watch), the trend since the previous panel,
// your 7-day blood pressure, and when the next panel is due. Information only; never suggests doses.
import { useMemo, useState } from 'react';
import { useApp } from '../appContext';
import { bpStatus, healthWatch, retestDue } from '../lib/healthWatch';
import type { Status, WatchRow } from '../lib/healthWatch';
import { localDateStr } from '../lib/today';

const LABEL: Record<Status, string> = { ok: 'fine', watch: 'watch', act: 'act' };
const COLOUR: Record<Status, string> = { ok: 'var(--ok)', watch: 'var(--warn)', act: 'var(--err)' };
const ARROW = { up: '\u2191', down: '\u2193', flat: '\u2192' } as const;
const fmtDate = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export default function HealthWatch() {
  const { bloodsLog, bpStats } = useApp();
  const [all, setAll] = useState(false);
  const rows = useMemo(() => { try { return healthWatch(bloodsLog as any); } catch { return []; } }, [bloodsLog]);
  const today = localDateStr(new Date());
  const rt = retestDue(rows, bloodsLog as any, today);
  const bp = bpStats ? bpStatus(bpStats.avgSys, bpStats.avgDia) : null;
  const found = rows.filter(r => r.latest);
  const rank = (r: WatchRow) => (r.status === 'act' ? 0 : r.status === 'watch' ? 1 : 2);
  const attention = found.filter(r => r.status !== 'ok').sort((a, b) => rank(a) - rank(b));
  const fine = found.filter(r => r.status === 'ok');

  const row = (r: WatchRow, detail: boolean) => {
    const st = r.status as Status;
    return (
      <div key={r.def.id} className="hw2-row">
        <div className="hw2-line">
          <span className="hw2-n">{r.def.name}</span>
          <span className="hw2-v">{r.latest?.value} {r.def.unit}{r.trend ? <span className="hw2-t" title={r.prev ? `previous ${r.prev.value} on ${fmtDate(r.prev.date)}` : ''}> {ARROW[r.trend]}</span> : null}</span>
          <span className="hw2-s" style={{ color: COLOUR[st], borderColor: COLOUR[st] }}>{LABEL[st]}</span>
        </div>
        {detail && <div className="hw2-why">{r.def.why}{st === 'act' ? ' ' + r.def.actNote : ''} <span className="hw2-lv">Watch {r.def.high ? 'from' : 'below'} {r.def.watch}, act {r.def.high ? 'from' : 'below'} {r.def.act}.</span></div>}
      </div>
    );
  };

  return (
    <div className="ui-card hw2">
      <div className="td2-cardhead">
        <span className="ui-eyebrow">Health watch</span>
        <span className="td2-meta">{rt.last ? 'last panel ' + fmtDate(rt.last) : 'no panels yet'}</span>
      </div>
      {!rt.last ? (
        <div className="td2-meta">Add a blood panel in Bloods below and the markers that matter on your protocol are tracked here, with when to retest.</div>
      ) : (
        <>
          <div className={'hw2-retest' + (rt.overdue ? ' due' : '')}>
            <b>{rt.overdue ? 'Retest due now' : 'Next panel by ' + fmtDate(rt.due as string)}</b>
            <span>{rt.overdue ? `It was due ${fmtDate(rt.due as string)}. ` : ''}{rt.reason} If your protocol has changed since, retest 6 to 8 weeks after the change.</span>
            <span className="hw2-inc">Include: {rt.include.join(', ')}.</span>
          </div>
          {bp && <div className="hw2-bp">Blood pressure, 7-day average {bpStats.avgSys}/{bpStats.avgDia} <span className="hw2-s" style={{ color: COLOUR[bp], borderColor: COLOUR[bp] }}>{LABEL[bp]}</span></div>}
          {attention.length > 0
            ? <div className="hw2-list">{attention.map(r => row(r, true))}</div>
            : <div className="td2-meta">Nothing at watch or act on your latest results.</div>}
          {fine.length > 0 && (
            <>
              <button type="button" className="td2-link" onClick={() => setAll(v => !v)}>{all ? 'Hide' : 'Show'} the {fine.length} marker{fine.length > 1 ? 's' : ''} that are fine</button>
              {all && <div className="hw2-list">{fine.map(r => row(r, false))}</div>}
            </>
          )}
        </>
      )}
      <div className="hw2-note">Information only, not medical advice. Thresholds follow mainstream clinical guidance; discuss results with your GP or prescriber. The app never suggests doses.</div>
    </div>
  );
}
