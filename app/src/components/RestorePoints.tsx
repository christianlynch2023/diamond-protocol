// Restore points (Settings > Tools and data). Lists the dated copies cloud sync keeps (the latest 14 days)
// and restores one. Restoring downloads your current data first as a safety copy, then replaces your data
// through the same validated import the backup file uses (anything missing from the copy is left as it is).
import { useState } from 'react';
import { useApp } from '../appContext';
import { Button } from './ui';

const label = (d: string): string => {
  const today = new Date(); const pad = (n: number) => String(n).padStart(2, '0');
  const iso = (x: Date) => `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`;
  const y = new Date(today.getTime() - 86400000);
  if (d === iso(today)) return 'Today';
  if (d === iso(y)) return 'Yesterday';
  return new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
};

export default function RestorePoints() {
  const { syncCode, exportData, applyBackup } = useApp();
  const [dates, setDates] = useState<string[] | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const code = syncCode || '';

  const load = async () => {
    setBusy(true); setMsg('');
    try {
      const r = await fetch('/.netlify/functions/sync-data?restore=list', { headers: { 'x-sync-code': code } });
      const d = await r.json();
      if (!r.ok) throw new Error(d && d.error ? d.error : 'HTTP ' + r.status);
      setDates(Array.isArray(d.dates) ? d.dates : []);
    } catch (e: any) { setMsg('Could not load restore points: ' + (e && e.message ? e.message : 'network error') + '.'); }
    finally { setBusy(false); }
  };

  const restore = async (date: string) => {
    setBusy(true); setMsg('');
    try {
      exportData();   // safety copy of what you have now, before anything is replaced
      const r = await fetch('/.netlify/functions/sync-data?restore=' + encodeURIComponent(date), { headers: { 'x-sync-code': code } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data = await r.json();
      applyBackup(data);
      setPick(null);
      setMsg('Restored from ' + label(date) + '. Keep the app open and online for a few seconds so the restored data syncs back to the cloud.');
    } catch (e: any) { setMsg('Restore failed, nothing was changed: ' + (e && e.message ? e.message : 'network error') + '.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="ui-card rp2">
      <div className="ui-eyebrow">Restore points</div>
      {!code ? (
        <div className="td2-meta">Restore points need cloud sync. Turn on sync above and a dated copy is kept each day for 14 days.</div>
      ) : (
        <>
          <div className="td2-meta">Cloud sync keeps a copy of your data from the start of each day, for the last 14 days. Use one to undo a mistake or bad data.</div>
          {dates === null && <Button kind="ghost" onClick={load} disabled={busy}>{busy ? 'Loading…' : 'Show restore points'}</Button>}
          {dates !== null && dates.length === 0 && <div className="td2-meta">None yet. The first one is kept at your next sync.</div>}
          {dates !== null && dates.length > 0 && !pick && (
            <div className="rp2-list">
              {dates.map(d => <button key={d} type="button" className="rp2-row" onClick={() => setPick(d)} disabled={busy}><span>{label(d)}</span><span className="td2-meta">{d}</span></button>)}
            </div>
          )}
          {pick && (
            <div className="rp2-confirm">
              <div className="rp2-q">Replace your data with the copy from {label(pick)}?</div>
              <div className="td2-meta">Anything logged since then will be lost. Your current data is downloaded first as a safety copy you can re-import.</div>
              <div className="td2-pair">
                <Button kind="danger" onClick={() => restore(pick)} disabled={busy}>{busy ? 'Restoring…' : 'Download current, then restore'}</Button>
                <Button kind="ghost" onClick={() => setPick(null)} disabled={busy}>Cancel</Button>
              </div>
            </div>
          )}
        </>
      )}
      {msg && <div className="rp2-msg">{msg}</div>}
    </div>
  );
}
