// Body summary (round 2, phase 6): one glance at everything Body tracks, each with a date, before the
// detailed sections. Tapping a tile opens that section and scrolls to it. Display only: every entry
// is still added, edited and deleted in the sections below, exactly as before.
import React from 'react';
import { useApp } from '../appContext';
import { MEAL_PLAN } from '../data/mealPlan';
import { bpCategory, glucoseCategory } from '../lib/health';
import { agoLabel, lastDays, newest } from '../lib/body';
import { Button, Card, Eyebrow } from './ui';

// Section ids and the titles BodyView prints in each section header.
const SECTIONS: Record<string, string> = {
  weight: 'Body Weight', measurements: 'Measurements', bp: 'Blood Pressure', glucose: 'Fasting Glucose',
  bloods: 'Bloods', cardio: 'Cardio', protocol: 'Protocol Log',
};
const toneOf = (cls?: string) => (cls === 'red' ? 'ui-t-problem' : cls === 'amber' ? 'ui-t-watch' : 'ui-t-ok');

export default function BodySummary() {
  const {
    bloodsLog, bodyMetrics, bpStats, bwRate, cardioLog, latestBP, latestGl, measurements, protocolLog,
    secOpen, setShowAddBody, toggleSec
  } = useApp();
  const now = new Date();
  const open = (id: string) => {
    if (!secOpen(id)) toggleSec(id);
    window.setTimeout(() => {
      const t = Array.from(document.querySelectorAll('.body-ttl')).find(el => el.textContent === SECTIONS[id]);
      const head = t ? t.closest('.sec-head') : null;
      if (head) head.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  };

  const lastWeigh = newest(bodyMetrics as any[]);
  const trend = bwRate && Number.isFinite(bwRate.ewma) ? bwRate.ewma : lastWeigh && Number.isFinite((lastWeigh as any).weight) ? (lastWeigh as any).weight : null;
  const rate = bwRate && Number.isFinite(bwRate.perWeek) ? bwRate.perWeek : null;
  const toGo = trend != null ? trend - MEAL_PLAN.goalKg : null;

  const waist: any = newest(measurements as any[], (m: any) => /waist/i.test(String(m.site || '')));
  const waistVal = waist ? [waist.value, waist.val, waist.cm].find(v => typeof v === 'number' && Number.isFinite(v)) : undefined;
  const lastMeas: any = newest(measurements as any[]);
  const bp = latestBP ? bpCategory(latestBP.sys, latestBP.dia) : null;
  const gl = latestGl ? glucoseCategory(latestGl.value) : null;
  const bloods: any = newest(bloodsLog as any[]);
  const cardio = lastDays(cardioLog as any[], now, 7, 'minutes' as any);
  const prot: any = newest(protocolLog as any[]);

  const tile = (id: string, label: string, value: React.ReactNode, sub: React.ReactNode, subCls = '') => (
    <button type="button" key={id} className="bs2-tile" onClick={() => open(id)}>
      <span className="ui-eyebrow">{label}</span>
      <span className="bs2-val">{value}</span>
      <span className={'bs2-sub ' + subCls}>{sub}</span>
    </button>
  );

  return (
    <div className="bs2">
      <Card>
        <div className="td2-cardhead">
          <Eyebrow>Bodyweight · trend</Eyebrow>
          {rate != null && <span className={'bs2-pill ' + (rate < -0.02 ? 'good' : rate > 0.02 ? 'watch' : '')}>{rate > 0 ? '+' : rate < 0 ? '−' : ''}{Math.abs(rate).toFixed(2)} kg/wk</span>}
        </div>
        <div className="bs2-wrow">
          <span className="ui-fig ui-fig-xl">{trend != null ? trend.toFixed(1) : '—'}<span className="ui-unit">kg</span></span>
          <Button kind="primary" icon="plus" onClick={() => { setShowAddBody(true); open('weight'); }}>Log weight</Button>
        </div>
        <div className="td2-meta">
          {toGo != null ? (toGo > 0 ? `${toGo.toFixed(1)} kg to your ${MEAL_PLAN.goalKg} kg goal` : `At or below your ${MEAL_PLAN.goalKg} kg goal`) : 'Log a weigh-in to start the trend'}
          {lastWeigh ? ` · last weigh-in ${agoLabel((lastWeigh as any).date, now)}` : ''}
        </div>
      </Card>
      <div className="bs2-grid">
        {tile('measurements', 'Measurements',
          waistVal != null ? <>{waistVal}<span className="ui-unit">cm waist</span></> : lastMeas ? 'Logged' : '—',
          waist ? agoLabel(waist.date, now) : lastMeas ? agoLabel(lastMeas.date, now) : 'nothing logged yet')}
        {tile('bp', 'Blood pressure',
          latestBP ? `${latestBP.sys}/${latestBP.dia}` : '—',
          latestBP ? `${bp && bp.label ? bp.label + ' · ' : ''}${agoLabel(latestBP.date, now)}${bpStats ? ' · 7-day ' + bpStats.avgSys + '/' + bpStats.avgDia : ''}` : 'nothing logged yet',
          latestBP && bp ? toneOf(bp.cls) : '')}
        {tile('glucose', 'Fasting glucose',
          latestGl ? <>{latestGl.value}<span className="ui-unit">mmol/L</span></> : '—',
          latestGl ? `${gl && gl.label ? gl.label + ' · ' : ''}${agoLabel(latestGl.date, now)}` : 'nothing logged yet',
          latestGl && gl ? toneOf(gl.cls) : '')}
        {tile('bloods', 'Bloods', bloods ? new Date(bloods.date).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : '—', bloods ? agoLabel(bloods.date, now) : 'no panels yet')}
        {tile('cardio', 'Cardio', cardio.count ? <>{cardio.sum}<span className="ui-unit">min</span></> : '0', `${cardio.count} session${cardio.count === 1 ? '' : 's'} in the last 7 days`)}
        {tile('protocol', 'Protocol log', prot ? 'Logged' : '—', prot ? 'last entry ' + agoLabel(prot.date, now) : 'nothing logged yet')}
      </div>
    </div>
  );
}
