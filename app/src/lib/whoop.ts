// Split out of App.jsx in Phase 2. Behaviour unchanged.
import type { SessionLog, WhoopDay, WhoopWorkout } from '../types';

// Parse ALL cycle records, keeping only COMPLETED cycles (those with an end timestamp).
// The in-progress cycle's kilojoule field is a running total — reading it mid-morning and
// storing it as the day's expenditure is what produced the systematically-low ~1,500 kcal
// "avg out". A completed cycle carries the true full-day burn.
export function parseWhoopCycles(raw: any): WhoopDay[] {
  const records = raw?.records || raw?.data || [];
  const localDay = ts => { const d = new Date(ts); return isNaN(d.getTime()) ? null : `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  return records.map(c => {
    const s = c.score || c;
    const end = c.end || c.during?.upper || null;
    if (!end) return null;                    // in-progress cycle — never trust its total
    const date = localDay(c.start || c.during?.lower || end);
    if (!date) return null;
    const kcal = s.kilojoule != null ? Math.round(s.kilojoule / 4.184) : null;
    if (kcal == null || kcal <= 0) return null;
    return { date, dayCal: kcal, dayCalFinal: true, strain: s.strain != null ? Math.round(s.strain*10)/10 : null };
  }).filter(Boolean);
}


export function parseWhoopHistory(rec: any): WhoopDay[] {
  const records = rec?.records || rec?.data || [];
  return records.map(r => {
    const s = r.score || r;
    // Local date, not a UTC slice, so it lines up with sleep history and localToday().
    const ts = new Date(r.created_at || r.updated_at || '');
    if (isNaN(ts.getTime())) return null;
    const date = `${ts.getFullYear()}-${String(ts.getMonth()+1).padStart(2,'0')}-${String(ts.getDate()).padStart(2,'0')}`;
    return {
      date,
      recovery: Math.round(s.recovery_score ?? 0) || null,
      hrv: Math.round(s.hrv_rmssd_milli ?? s.hrv ?? 0) || null,
      rhr: Math.round(s.resting_heart_rate ?? 0) || null,
      // Kept per day so they can be trended (skin temp is an early illness signal).
      spo2: s.spo2_percentage != null ? Math.round(s.spo2_percentage*10)/10 : null,
      skinTemp: s.skin_temp_celsius != null ? Math.round(s.skin_temp_celsius*10)/10 : null,
    };
  }).filter(x => x && x.recovery != null);
}

// One entry per night from the sleep feed: main sleeps only, scored only, dated by the local
// day you woke up (matches the recovery date). Previously only the latest night was kept, and
// only on days the app was opened.
export function parseWhoopSleeps(raw: any): WhoopDay[] {
  const records = raw?.records || raw?.data || [];
  const out = [];
  for (const r of records) {
    if (!r || r.nap) continue;
    if (r.score_state && r.score_state !== 'SCORED') continue;
    const s = r.score; if (!s) continue;
    const end = new Date(r.end || r.start || ''); if (isNaN(end.getTime())) continue;
    const date = `${end.getFullYear()}-${String(end.getMonth()+1).padStart(2,'0')}-${String(end.getDate()).padStart(2,'0')}`;
    const ss = s.stage_summary || {};
    const light = ss.total_light_sleep_time_milli || 0, deep = ss.total_slow_wave_sleep_time_milli || 0, rem = ss.total_rem_sleep_time_milli || 0;
    const asleep = light + deep + rem;
    const sn = s.sleep_needed || {};
    const needed = (sn.baseline_milli||0) + (sn.need_from_sleep_debt_milli||0) + (sn.need_from_recent_strain_milli||0) + (sn.need_from_recent_nap_milli||0);
    out.push({
      date,
      sleepHrs: asleep > 0 ? Math.round(asleep/360000)/10 : null,
      deepHrs: asleep > 0 ? Math.round(deep/360000)/10 : null,
      remHrs: asleep > 0 ? Math.round(rem/360000)/10 : null,
      sleepPerf: s.sleep_performance_percentage != null ? Math.round(s.sleep_performance_percentage) : null,
      sleepEff: s.sleep_efficiency_percentage != null ? Math.round(s.sleep_efficiency_percentage) : null,
      sleepConsistency: s.sleep_consistency_percentage != null ? Math.round(s.sleep_consistency_percentage) : null,
      respRate: s.respiratory_rate != null ? Math.round(s.respiratory_rate*10)/10 : null,
      sleepDebt: needed > 0 && asleep > 0 ? Math.max(0, Math.round((needed - asleep)/360000)/10) : null,
    });
  }
  return out;
}

export function mergeHistory(a: WhoopDay[] | null | undefined, b: WhoopDay[] | null | undefined): WhoopDay[] {
  const map: Record<string, any> = {};
  // Field-level merge: a later entry must not wipe fields it simply doesn't carry
  // (e.g. parseWhoopHistory has no dayCal; a wholesale replace would erase it).
  [...(a || []), ...(b || [])].forEach(e => {
    if (!e || !e.date) return;
    const prev = map[e.date] || {};
    const merged = { ...prev };
    Object.keys(e).forEach(k => { if (e[k] != null) merged[k] = e[k]; });
    map[e.date] = merged;
  });
  return Object.values(map).sort((x, y) => x.date < y.date ? -1 : 1).slice(-60);
}


export function parseWhoopWorkouts(raw: any): WhoopWorkout[] {
  const records = raw?.records || raw?.data || [];
  return records.map(w => {
    const s = w.score || w;
    return {
      start: w.start || w.during?.lower || null,
      end: w.end || w.during?.upper || w.start || null,
      strain: s.strain != null ? Math.round(s.strain * 10) / 10 : null,
      avgHr: s.average_heart_rate != null ? Math.round(s.average_heart_rate) : null,
      maxHr: s.max_heart_rate != null ? Math.round(s.max_heart_rate) : null,
      kcal: s.kilojoule != null ? Math.round(s.kilojoule / 4.184) : null,
      // Zone durations (millis in HR zones 0-5). Zone 2+ is the cardio-relevant band:
      // WHOOP zone_two upward corresponds to the sustained aerobic work that counts as
      // zone-2 training, so this can populate the Cardio card without manual logging.
      z2Min: (() => {
        const z = s.zone_durations || s.zone_duration || null;
        if (!z) return null;
        const ms = (z.zone_two_milli||0) + (z.zone_three_milli||0);
        return ms > 0 ? Math.round(ms/60000) : 0;
      })(),
      zoneMin: (() => {
        const z = s.zone_durations || s.zone_duration || null;
        if (!z) return null;
        return { z1:Math.round((z.zone_one_milli||0)/60000), z2:Math.round((z.zone_two_milli||0)/60000),
                 z3:Math.round((z.zone_three_milli||0)/60000), z4:Math.round((z.zone_four_milli||0)/60000),
                 z5:Math.round((z.zone_five_milli||0)/60000) };
      })(),
      sport: w.sport_name || null,
      distanceKm: s.distance_meter != null ? Math.round(s.distance_meter/100)/10 : null,
      altitudeGainM: s.altitude_gain_meter != null ? Math.round(s.altitude_gain_meter) : null,
    };
  }).filter(w => w.start && w.strain != null);
}

export function matchWorkout(log: SessionLog, workouts: WhoopWorkout[] | null | undefined): WhoopWorkout | null {
  if (!workouts || !workouts.length || !log.date) return null;
  const end = new Date(log.date).getTime();
  const start = end - (log.duration || 60) * 60000;
  let best = null, bestOv = 0;
  for (const w of workouts) {
    const ws = new Date(w.start).getTime(), we = new Date(w.end || w.start).getTime();
    const ov = Math.min(end, we) - Math.max(start, ws);
    if (ov > bestOv) { bestOv = ov; best = w; }
  }
  return bestOv > 5 * 60000 ? best : null;
}
