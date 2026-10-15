// Fuel tab. Everything nutrition lives here (round 2 phase 4, then the Body move and the Fuel tidy).
// Order: today's intake (log or correct any day), daily targets and hydration, the last seven days,
// maintenance estimate and lock, energy balance, protein trend, the full log, then the meal plan as before
// (where you are, plan, adjustment rules, habits).
// Targets follow the one rule used everywhere: a locked target, then the meal plan, then the live engine.
import React, { useState } from 'react';
import { useApp } from '../appContext';
import { MEAL_PLAN } from '../data/mealPlan';
import { SESSIONS } from '../data/programme';
import { dayRecord, kcalOf, logToDay, weekView } from '../lib/fuel';
import type { DayTarget, NutLike } from '../lib/fuel';
import { isTrainingDay, localDateStr } from '../lib/today';
import { Button, Card, Eyebrow, Segmented } from '../components/ui';
import { FuelEnergy, FuelLog, FuelProtein, FuelTargets } from '../components/NutritionDetail';

const makeId = (): string => {
  try { if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID(); } catch (_) { /* fall through */ }
  return 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
};
const fmt = (v: number) => Math.round(v).toLocaleString('en-GB');

export default function MealsView() {
  const {
    acceptTarget, bodyMetrics, bwRate, effTargets, lockCals, logs, mealDay, mealTime, nutriCoach, nutrition,
    setLockCals, setMealDay, setMealTime, setNutrition, targetLock
  } = useApp();
  const [p, setP] = useState(''); const [c, setC] = useState(''); const [f, setF] = useState('');
  const [mode, setMode] = useState<'add' | 'set'>('add');
  const [logDate, setLogDate] = useState('');
  const [open, setOpen] = useState(false);

  try {
    const P = MEAL_PLAN;
    const now = new Date();
    const todayStr = localDateStr(now);
    const sessionDays = Object.values(SESSIONS).map(s => s.day);
    const targetFor = (date: string): (DayTarget & { carb?: number; fat?: number }) | null => {
      if (!effTargets) return null;
      const train = isTrainingDay(new Date(date + 'T12:00:00'), sessionDays, logs || []);
      const dt = effTargets.dayTargets ? effTargets.dayTargets[train ? 'train' : 'rest'] : null;
      if (dt) return { cals: dt.cals, protein: dt.protein, carb: dt.carb, fat: dt.fat };
      return Number.isFinite(effTargets.weekly) ? { cals: effTargets.weekly, protein: effTargets.protein, carb: effTargets.carb, fat: effTargets.fat } : null;
    };
    const trainingToday = isTrainingDay(now, sessionDays, logs || []);
    const tToday = targetFor(todayStr);
    const rec = dayRecord((nutrition || []) as NutLike[], todayStr);
    const got = { kcal: rec ? (typeof rec.calories === 'number' ? rec.calories : kcalOf({ p: rec.protein || 0, c: rec.carbs || 0, f: rec.fat || 0 })) : 0, p: rec?.protein || 0, c: rec?.carbs || 0, f: rec?.fat || 0 };
    const week = weekView((nutrition || []) as NutLike[], todayStr, targetFor);
    const source = effTargets ? (effTargets.source === 'locked' ? 'your locked target' : effTargets.source === 'plan' ? 'your meal plan' : 'the live estimate') : null;

    const save = () => {
      const g = { p: parseFloat(p) || 0, c: parseFloat(c) || 0, f: parseFloat(f) || 0 };
      if (g.p + g.c + g.f <= 0) return;
      const day = logDate && logDate <= todayStr ? logDate : todayStr;
      setNutrition(prev => logToDay(prev as NutLike[], day, g, mode, Date.now(), makeId) as typeof prev);
      setP(''); setC(''); setF(''); setOpen(false); setMode('add'); setLogDate('');
    };
    // Correcting a day starts from that day's saved totals.
    const prefill = (date: string) => {
      const r0 = dayRecord((nutrition || []) as NutLike[], date);
      setP(r0 ? String(r0.protein || 0) : ''); setC(r0 ? String(r0.carbs || 0) : ''); setF(r0 ? String(r0.fat || 0) : '');
    };
    const pickDate = (d: string) => { const v = d && d <= todayStr ? d : todayStr; setLogDate(v); if (mode === 'set') prefill(v); };
    const bar = (label: string, have: number, want: number | undefined) => (
      <div className="fu-bar" key={label}>
        <span className="fu-bar-l">{label}</span>
        <span className="fu-track"><span className="fu-fill" style={{ width: want ? Math.min(100, have / want * 100) + '%' : '0%' }} /></span>
        <span className="fu-bar-v">{fmt(have)}{want ? ' / ' + fmt(want) : ''} g</span>
      </div>
    );

    // ---- maintenance sentence ----
    // nutriCoach returns a different shape for each outcome (ok, stale, noisy, partial...), so read it loosely.
    const nc: any = nutriCoach || {};
    let maint: string;
    if (nc.ok) maint = `You've averaged ${fmt(nc.avgIntake)} kcal a day while your weight moved ${nc.ratePerWk > 0 ? '+' : ''}${nc.ratePerWk.toFixed(2)} kg a week over ${nc.spanDays} days. That puts maintenance near ${fmt(nc.tdee)} kcal (${nc.conf} confidence).`;
    else if (nc.reason === 'stale') maint = `Estimate paused: nothing logged for ${nc.ageDays} days.`;
    else if (nc.reason === 'stale_weight') maint = `Estimate paused: your last weigh-in is ${nc.ageDays ?? 'over 10'} days old.`;
    else if (nc.reason === 'noisy') maint = `Weight is too noisy to trust yet (${nc.ratePerWk} kg a week on ${fmt(nc.avgIntake)} kcal). Keep logging.`;
    else if (nc.reason === 'implausible') maint = `The trend looks water-distorted. ${fmt(nc.avgIntake)} kcal a day is holding your weight roughly level, so treat that as maintenance for now.`;
    else if (nc.partial) maint = `Needs 7 days of food and 2 weigh-ins in 3 weeks. You have ${nc.foodDays} and ${nc.weighIns}.`;
    else maint = nc.reason || 'Log food and weight to build a maintenance estimate.';

    // ---- where you are (unchanged logic from the Meals screen) ----
    const key = mealDay === 'rest' ? 'rest' : (mealTime === 'pm' ? 'train_pm' : 'train_am');
    const meals = P.days[key];
    const tgt = P.targets[mealDay === 'rest' ? 'rest' : 'train'];
    const tot = meals.reduce((a, m) => ({ p: a.p + m.p, c: a.c + m.c, f: a.f + m.f }), { p: 0, c: 0, f: 0 });
    const kcal = Math.round(tot.p * 4 + tot.c * 4 + tot.f * 9);
    const r = (typeof bwRate !== 'undefined') ? bwRate : null;
    const latest = (bodyMetrics && bodyMetrics[0] && Number.isFinite(bodyMetrics[0].weight)) ? bodyMetrics[0].weight : null;
    const trend = r && Number.isFinite(r.ewma) ? r.ewma : latest;
    const loss = r && Number.isFinite(r.perWeek) ? -r.perWeek : null;
    const toGo = trend != null ? +(trend - P.goalKg).toFixed(1) : null;
    let vTxt: string, vCol: string;
    if (loss == null) { vTxt = 'Not enough weigh-ins yet to judge the rate. Aim for 3+ morning weigh-ins a week.'; vCol = 'var(--t2)'; }
    else if (loss > 0.9) { vTxt = 'Losing over 0.9 kg a week. Add 150 kcal of carbs.'; vCol = 'var(--warn)'; }
    else if (loss >= 0.7) { vTxt = 'Fast end of the range. Hold, and watch your lifts.'; vCol = 'var(--ok)'; }
    else if (loss >= 0.4) { vTxt = 'On target. Hold the plan.'; vCol = 'var(--ok)'; }
    else if (loss >= 0.3) { vTxt = 'Slightly under target. Hold one more week and check you are hitting the numbers.'; vCol = 'var(--warn)'; }
    else { vTxt = 'Under 0.3 kg a week. If this holds for 2 weeks, cut 150 kcal of rest-day carbs or add 2,000 steps a day.'; vCol = 'var(--warn)'; }
    const wksTarget = toGo != null && toGo > 0 ? Math.ceil(toGo / P.targetRate) : null;
    const wksNow = toGo != null && toGo > 0 && loss != null && loss > 0.05 ? Math.ceil(toGo / loss) : null;
    const stat = (label: string, val: string) => (
      <div className="fu-stat"><div className="td2-ml">{label}</div><div className="ui-fig ui-fig-s">{val}</div></div>
    );

    return (
      <div className="screen">
        <div className="topbar"><span className="logo">Fuel</span><span className="top-badge">Cut to {P.goalKg}kg</span></div>
        <div className="today-body td2">

          <Card>
            <div className="td2-cardhead"><Eyebrow>Today so far · {trainingToday ? 'training day' : 'rest day'}</Eyebrow><span className="td2-meta">{source ? 'target from ' + source : ''}</span></div>
            <div className="fu-head">
              <span className="ui-fig ui-fig-xl">{fmt(got.kcal)}<span className="ui-unit">{tToday ? '/ ' + fmt(tToday.cals) + ' kcal' : 'kcal'}</span></span>
              {tToday && <span className={'fu-left' + (got.kcal > tToday.cals ? ' over' : '')}>{got.kcal > tToday.cals ? fmt(got.kcal - tToday.cals) + ' over' : fmt(tToday.cals - got.kcal) + ' left'}</span>}
            </div>
            {bar('Protein', got.p, tToday?.protein)}
            {bar('Carbs', got.c, tToday?.carb)}
            {bar('Fat', got.f, tToday?.fat)}
            {!open ? (
              <div className="td2-actions">
                <Button kind="primary" icon="plus" onClick={() => { setMode('add'); setLogDate(todayStr); setOpen(true); }}>Log food</Button>
                <Button kind="ghost" onClick={() => { setMode('set'); setLogDate(todayStr); prefill(todayStr); setOpen(true); }}>Correct a day</Button>
              </div>
            ) : (
              <div className="fu-form">
                <label className="fu-in fu-date"><span>Day</span>
                  <input type="date" value={logDate || todayStr} max={todayStr} onChange={e => pickDate(e.target.value)} />
                </label>
                <div className="td2-meta">{mode === 'add' ? 'Adds to that day’s totals.' : 'Replaces that day’s totals.'} Calories are worked out from the grams.</div>
                <div className="fu-inputs">
                  {[['Protein', p, setP], ['Carbs', c, setC], ['Fat', f, setF]].map(([l, v, set]) => (
                    <label key={l as string} className="fu-in"><span>{l as string} g</span>
                      <input type="number" inputMode="decimal" value={v as string} onChange={e => (set as (s: string) => void)(e.target.value)} placeholder="0" />
                    </label>
                  ))}
                </div>
                <div className="td2-pair">
                  <Button kind="primary" onClick={save}>{mode === 'add' ? 'Add ' + kcalOf({ p: parseFloat(p) || 0, c: parseFloat(c) || 0, f: parseFloat(f) || 0 }) + ' kcal' : 'Save totals'}</Button>
                  <Button kind="ghost" onClick={() => { setOpen(false); setP(''); setC(''); setF(''); setLogDate(''); }}>Cancel</Button>
                </div>
              </div>
            )}
          </Card>

          <FuelTargets />

          <Card>
            <div className="td2-cardhead"><Eyebrow>Last 7 days · intake against target</Eyebrow><span className="td2-meta">line = target</span></div>
            <div className="fu-week">
              {week.rows.map(row => (
                <div className="fu-day" key={row.date}>
                  <div className="fu-col">
                    <span className={'fu-col-bar ' + row.status} style={{ height: ((row.kcal || 0) / week.scaleMax * 100) + '%' }} />
                    {row.target && <span className="fu-col-tgt" style={{ bottom: (row.target.cals / week.scaleMax * 100) + '%' }} />}
                  </div>
                  <span className={'fu-dn' + (row.isToday ? ' today' : '')}>{row.dn}</span>
                </div>
              ))}
            </div>
            <div className="fu-sum">
              {stat('Average, finished days', week.avgKcal != null ? fmt(week.avgKcal) + (week.avgTarget ? ' / ' + fmt(week.avgTarget) : '') + ' kcal' : 'no full days yet')}
              {stat('Protein on target', week.fullDays ? week.proteinHit + ' of ' + week.fullDays + ' days' : '—')}
            </div>
          </Card>

          <Card>
            <div className="td2-cardhead"><Eyebrow>Maintenance estimate</Eyebrow>{nc.ok && <span className="ui-fig ui-fig-m">{fmt(nc.tdee)} kcal</span>}</div>
            <div className="fu-txt">{maint}</div>
            {targetLock && targetLock.active && <div className="fu-txt">Locked at <b>{fmt(targetLock.active.cals)} kcal</b>{targetLock.ageDays != null ? ', set ' + targetLock.ageDays + ' days ago' : ''}.{targetLock.due ? ' Due a weekly check.' : ''}</div>}
            {targetLock && (targetLock.candidate || targetLock.active) && (
              <div className="fu-lock">
                {targetLock.candidate && <Button kind="ghost" onClick={() => acceptTarget(undefined)}>Lock {fmt(targetLock.active && targetLock.delta != null ? targetLock.active.cals + targetLock.delta : targetLock.candidate.cals)} kcal</Button>}
                <label className="fu-in narrow"><span>Or lock</span><input type="number" inputMode="numeric" value={lockCals} onChange={e => setLockCals(e.target.value)} placeholder="kcal" /></label>
                <Button kind="ghost" onClick={() => { const v = parseFloat(lockCals); if (Number.isFinite(v)) acceptTarget(v); }}>Lock</Button>
              </div>
            )}
            <div className="td2-meta">A locked target replaces your meal plan's numbers everywhere in the app until you lock a new one.</div>
          </Card>

          <div className="nd2"><FuelEnergy /></div>
          <div className="nd2"><FuelProtein /></div>
          <div className="nd2"><FuelLog /></div>

          <div className="ar-card">
            <div className="hm-head"><span className="hm-ttl">Where you are</span><span className="hm-wk">goal {P.goalKg}kg</span></div>
            <div className="fu-sum">
              {stat('Trend weight', trend != null ? trend.toFixed(1) + 'kg' : '-')}
              {stat('To go', toGo != null ? (toGo > 0 ? toGo.toFixed(1) + 'kg' : 'Done') : '-')}
              {stat('Rate', loss != null ? (loss >= 0 ? '-' : '+') + Math.abs(loss).toFixed(2) + '/wk' : '-')}
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.5, color: vCol, fontWeight: 600, marginTop: 10 }}>{vTxt}</div>
            {(wksTarget || wksNow) && <div className="ar-note">
              {wksTarget ? `About ${wksTarget} weeks to go at the planned 0.5 kg a week` : ''}{wksNow ? `${wksTarget ? '; ' : ''}about ${wksNow} at your current rate` : ''}. Add a week for the diet break.
            </div>}
            {trend != null && trend <= P.checkpointKg && toGo > 0 && <div className="ar-note" style={{ color: 'var(--acc)' }}>Checkpoint reached ({P.checkpointKg}kg). Reassess whether {P.goalKg}kg is still the right finish, or whether a slightly higher, leaner-looking weight is better.</div>}
          </div>

          <div className="ar-card">
            <div className="hm-head"><span className="hm-ttl">Meal plan</span><span className="hm-wk">≈ {fmt(kcal)} kcal</span></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
              <Segmented label="Day type" value={mealDay === 'rest' ? 'rest' : 'train'} onChange={v => setMealDay(v)}
                options={[{ value: 'train', label: 'Training day' }, { value: 'rest', label: 'Rest day' }]} />
              {mealDay !== 'rest' && <Segmented label="Session time" value={mealTime === 'pm' ? 'pm' : 'am'} onChange={v => setMealTime(v)}
                options={[{ value: 'am', label: '5am session' }, { value: 'pm', label: '8pm session' }]} />}
            </div>
            <div className="fu-tgts">
              {[['kcal', fmt(tgt.kcal)], ['protein', tgt.p + 'g'], ['carbs', tgt.c + 'g'], ['fat', tgt.f + 'g']].map(([l, v]) => (
                <div key={l} className="fu-tgt"><div className="ui-fig ui-fig-s ui-t-accent">{v}</div><div className="td2-ml">{l}</div></div>
              ))}
            </div>
            {meals.map((m, i) => (
              <div key={i} className="fu-meal">
                <div className="fu-meal-t">{m.t}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="fu-meal-n">{m.n}</div>
                  <div className="fu-meal-f">{m.food}</div>
                  <div className="fu-meal-m">P {m.p} · C {m.c} · F {m.f}</div>
                </div>
              </div>
            ))}
            <div className="fu-meal-tot"><span>Day total ≈ {fmt(kcal)} kcal</span><span>P {tot.p} · C {tot.c} · F {tot.f}</span></div>
            <div className="ar-note">Fibre {tgt.fibre}g. Weights are cooked unless stated. Swap like for like (chicken for turkey or lean beef, rice for potato) and keep the protein the same.</div>
          </div>

          <div className="ar-card">
            <div className="hm-head"><span className="hm-ttl">Adjustment rules</span><span className="hm-wk">7-day average</span></div>
            {P.rules.map(([sig, act], i) => (
              <div key={i} style={{ padding: '8px 0', borderTop: i ? '1px solid var(--bdr)' : 'none' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t)' }}>{sig}</div>
                <div style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.45 }}>{act}</div>
              </div>
            ))}
          </div>

          <div className="ar-card">
            <div className="hm-head"><span className="hm-ttl">Habits that support the cut</span></div>
            {P.habits.map((h, i) => (<div key={i} style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.5, padding: '6px 0', borderTop: i ? '1px solid var(--bdr)' : 'none' }}>{h}</div>))}
          </div>
        </div>
      </div>
    );
  } catch (e) {
    try { console.error('fuel view failed', e); } catch (_) { /* ignore */ }
    return <div className="screen"><div className="topbar"><span className="logo">Fuel</span></div><div className="empty-msg">Fuel could not load. Your data is safe; reload the app.</div></div>;
  }
}
