// All of App's state, effects and handlers, as one hook (Phase 3d).
// App calls it once per render, exactly where this code used to run, so hook order is unchanged.
// Its return type is the type of everything the screens read through useApp().
import { MEAL_PLAN } from '../data/mealPlan';
import { useEffect, useMemo, useRef, useState } from 'react';
import { DLW, EX_MUSCLE, MUSCLES, ORM_IDS, SESSIONS, buildIntensifier, effWR, getEffSets, getPhase, rirDefaultFor, setDeloadNow } from '../data/programme';
import { usePersistentState } from '../hooks';
import { computeAlcoholImpact, computeRecoveryPerformance, computeTimeOfDay, recentCtx } from '../lib/associations';
import { playChime, primeAudio } from '../lib/audio';
import { BLOOD_GROUPS, bloodAutoFlag, bloodNormKey } from '../lib/bloods';
import { fmtShort, localToday, parseNum } from '../lib/format';
import { DECAY_COLORS, bpCategory, glucoseCategory, pkFor } from '../lib/health';
import { computeDeloadReadiness, computeReadiness } from '../lib/readiness';
import { computeActualVolume, computeBurnCheck, computeDeloadRebound, computeDurations, computePainTrend, computeRirDrift, computeStalls, computeStrengthRetention, computeTrainingLoad, sessionPerformed } from '../lib/sessions';
import { IDB, LS } from '../lib/storage';
import { ensureIds, legacyId, live, mergeByKey, mergeLogs, newId, pruneTombstones, tombstoneWhere } from '../lib/sync';
import { calcPlates, calcWarmups, dailyMedianWeights, exMuscle, getPrevHist, getProgRec, getTarget, makeBwResolver, totalLoad, weekMuscleVolume, weeklyVolumeSeries } from '../lib/training';
import { mergeHistory, parseWhoopCycles, parseWhoopHistory, parseWhoopSleeps, parseWhoopWorkouts } from '../lib/whoop';
import type { ActiveTarget, BPReading, BloodForm, BloodPanel, BodyMetric, CardioEntry, CheckinPhoto, ContextEntry, GlucoseReading, Measurement, NutritionEntry, ProtocolEntry, SessionLog, SetEntry, SubstituteEntry, VitalsEntry, WhoopDay, WhoopWorkout } from '../types';
import { e1rmSet } from '../lib/strength';
import { adoptEquipment, equipmentForSync } from '../lib/equipment';
import { COACH_RULES, targetsText, trendsText } from '../lib/coach';
import { EX_DEF_BY_ID } from '../data/programme';
import { useAi } from './useAi';
import { useSync } from './useSync';
import { useNutrition } from './useNutrition';

export function useAppState() {

  // ── WHOOP INTEGRATION ─────────────────────────────────
  // Unguarded JSON.parse in a useState initialiser: a truncated/corrupt whoop_cache threw
  // during the FIRST render, so React could not mount and the whole app failed to open.
  const [whoopData, setWhoopData]       = useState(() => { try { const c=LS.get('whoop_cache'); return c?JSON.parse(c):null; } catch(e) { LS.del('whoop_cache'); return null; } });
  const [whoopAuthFail, setWhoopAuthFail] = useState(false);
  const [whoopStaleNote, setWhoopStaleNote] = useState(false);  // last refresh failed, showing cache
  const [whoopLoading, setWhoopLoading] = useState(false);
  const [whoopHistory, setWhoopHistory] = usePersistentState<WhoopDay[]>('whoop_history', []);
  const [whoopWorkouts, setWhoopWorkouts] = usePersistentState<WhoopWorkout[]>('whoop_workouts', []);
  const whoopConnected = !!LS.get('whoop_access_token');

  const getWhoopCls = score => score >= 67 ? 'gr' : score >= 34 ? 'yw' : 'rd';

  const fmtAgo = ts => {
    if (!ts) return '';
    const m = Math.floor((Date.now() - ts) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    return `${Math.floor(m/60)}h ago`;
  };

  const parseWhoop = data => {
    const r: any = { recovery:null, hrv:null, rhr:null, sleep:null, strain:null, spo2:null, skinTemp:null, respRate:null, sleepConsistency:null, sleepEfficiency:null, sleepHrs:null, deepHrs:null, remHrs:null, sleepDebt:null, dayCal:null };
    // Recovery score, HRV, RHR, SpO2 and skin temp live on the /recovery feed (WHOOP v2)
    const recRec = data?.recovery?.records?.[0] || data?.recovery?.data?.[0];
    if (recRec) {
      const s = recRec.score || recRec;
      r.recovery = Math.round(s.recovery_score ?? 0) || null;
      r.hrv      = Math.round(s.hrv_rmssd_milli ?? s.hrv ?? 0) || null;
      r.rhr      = Math.round(s.resting_heart_rate ?? 0) || null;
      r.spo2     = s.spo2_percentage != null ? Math.round(s.spo2_percentage*10)/10 : null;
      r.skinTemp = s.skin_temp_celsius != null ? Math.round(s.skin_temp_celsius*10)/10 : null;
    }
    // Sleep performance, stages, respiratory rate and sleep debt come from the sleep feed
    // Latest MAIN sleep only. The feed returns naps too (nap:true); taking records[0] meant an
    // afternoon nap replaced last night's hours, stages and debt, and fed readiness.
    const sleepRecs = data?.sleep?.records || data?.sleep?.data || [];
    const sleep = sleepRecs.find(x => x && !x.nap) || null;
    if (sleep) {
      const s = sleep.score || sleep;
      r.sleep = Math.round(s.sleep_performance_percentage ?? s.sleep_efficiency_percentage ?? 0) || null;
      r.respRate = s.respiratory_rate != null ? Math.round(s.respiratory_rate*10)/10 : null;
      r.sleepConsistency = s.sleep_consistency_percentage != null ? Math.round(s.sleep_consistency_percentage) : null;
      r.sleepEfficiency = s.sleep_efficiency_percentage != null ? Math.round(s.sleep_efficiency_percentage) : null;
      const ss = s.stage_summary || {};
      const light = ss.total_light_sleep_time_milli || 0, deep = ss.total_slow_wave_sleep_time_milli || 0, rem = ss.total_rem_sleep_time_milli || 0;
      const asleep = light + deep + rem;
      if (asleep > 0) { r.sleepHrs = Math.round(asleep/360000)/10; r.deepHrs = Math.round(deep/360000)/10; r.remHrs = Math.round(rem/360000)/10; }
      const sn = s.sleep_needed || {};
      const needed = (sn.baseline_milli||0) + (sn.need_from_sleep_debt_milli||0) + (sn.need_from_recent_strain_milli||0) + (sn.need_from_recent_nap_milli||0);
      if (needed > 0 && asleep > 0) r.sleepDebt = Math.max(0, Math.round((needed - asleep)/360000)/10);
    }
    // Strain and daily energy expenditure come from the cycle feed
    const cycle = data?.cycles?.records?.[0] || data?.cycles?.data?.[0];
    if (cycle) {
      const s = cycle.score || cycle;
      if (r.strain === null) r.strain = s.strain != null ? Math.round(s.strain*10)/10 : null;
      r.dayCal = s.kilojoule != null ? Math.round(s.kilojoule/4.184) : null;
      // Flag whether this cycle is still running. dayCal on an in-progress cycle is a
      // PARTIAL running total, not a daily burn, and must never be written into history.
      r.dayCalPartial = !(cycle.end || cycle.during?.upper);
    }
    return r;
  };

  // NOTE: WHOOP deliberately does NOT write into `recovery`. That state is the USER'S
  // SUBJECTIVE selection (Excellent/Normal/Beat Up) which computeReadiness reads as
  // subjBeat / subjExcellent. Letting WHOOP set it created a back door: once a fresh green
  // score wrote 'excellent', it kept adding a positive readiness factor for days after the
  // WHOOP data itself went stale and was correctly nulled by the freshness guard.
  // WHOOP recovery reaches readiness properly via whoopData.recovery (freshness-gated).

  const fetchWhoopData = async (token?, allowRefresh = true) => {
    const t = token || LS.get('whoop_access_token');
    if (!t) return;
    setWhoopLoading(true);
    try {
      // Back-fill from the last stored day (minus 3 days overlap), or 60 days on first run, so
      // days the app was not opened are still captured. The server pages through WHOOP's feeds.
      let since = '';
      try {
        const last = (whoopHistory || []).reduce((m, e) => (e && e.date && e.date > m ? e.date : m), '');
        const d = last ? new Date(last + 'T12:00:00') : new Date(Date.now() - 60*86400000);
        d.setDate(d.getDate() - 3);
        since = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      } catch(_) { since = ''; }
      const res = await fetch('/.netlify/functions/whoop-data' + (since ? '?since=' + since : ''), { headers: { Authorization: `Bearer ${t}` } });
      // One refresh attempt only. Previously a repeatedly-rejected token caused
      // fetch -> refresh -> fetch -> refresh ... indefinitely.
      if (res.status === 401) { if (!allowRefresh) { throw new Error('WHOOP token rejected after refresh'); } await refreshWhoopToken(); return; }
      // Without this, a 400/403/429/500 JSON body was parsed as valid WHOOP data, produced an
      // all-null record, was stamped cachedAt: now (so it looked FRESH), and overwrote the
      // last good cache.
      if (!res.ok) throw new Error('WHOOP request failed: ' + res.status);
      const raw = await res.json();
      const parsed = { ...parseWhoop(raw), cachedAt: Date.now() };
      setWhoopData(parsed);
      LS.set('whoop_cache', JSON.stringify(parsed)); setWhoopStaleNote(false);
      const newHist = parseWhoopHistory(raw.recovery);
      // localToday(), not UTC: during BST between 00:00-00:59 local, toISOString() still
      // returns YESTERDAY, so today's entry was filed under the wrong date.
      const todayEntry = parsed.recovery != null ? [{ date: localToday(), recovery: parsed.recovery, hrv: parsed.hrv, rhr: parsed.rhr, respRate: parsed.respRate, skinTemp: parsed.skinTemp, dayCal: parsed.dayCalPartial ? null : parsed.dayCal, sleepHrs: parsed.sleepHrs, sleepDebt: parsed.sleepDebt, strain: parsed.strain }] : [];
      // Completed cycles carry TRUE full-day burns and overwrite any partial value already
      // stored for that date (mergeHistory is field-level, and these come last so they win).
      const cycleHist = parseWhoopCycles(raw.cycles);
      const sleepHist = parseWhoopSleeps(raw.sleep);
      if (newHist.length || sleepHist.length || todayEntry.length || cycleHist.length) {
        setWhoopHistory(prev => mergeHistory(prev, [...newHist, ...sleepHist, ...todayEntry, ...cycleHist]));
      }
      const wos = parseWhoopWorkouts(raw.workouts);
      // Merge, don't replace: the endpoint returns a recent page, so a wholesale replace
      // silently deleted all older locally-stored workouts.
      if (wos.length) { setWhoopWorkouts(prev => { const m: Record<string, any>={}; [...(prev||[]), ...wos].forEach(w=>{ const k=(w.id!=null?String(w.id):(w.start||'')+'|'+(w.strain||'')); if(k) m[k]=w; }); return Object.values(m).sort((a,b)=>((a.start||'')<(b.start||'')?1:-1)).slice(0,200); }); }
    } catch(e) {
      const cached = LS.get('whoop_cache');
      if (cached) { try { setWhoopData(JSON.parse(cached)); setWhoopStaleNote(true); } catch(e) { LS.del('whoop_cache'); } }
    } finally { setWhoopLoading(false); }
  };

  // Returns true/false. Previously every failure was swallowed by `catch(e) {}`, so a dead
  // refresh token left the app LOOKING connected while WHOOP silently never worked again.
  const refreshWhoopToken = async () => {
    const rt = LS.get('whoop_refresh_token');
    if (!rt) { setWhoopAuthFail(true); return false; }
    try {
      const res = await fetch('/.netlify/functions/whoop-refresh', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ refresh_token: rt }),
      });
      if (!res.ok) throw new Error('WHOOP refresh failed: ' + res.status);
      const tokens = await res.json();
      if (!tokens.access_token) throw new Error('WHOOP refresh returned no access token');
      LS.set('whoop_access_token', tokens.access_token);
      if (tokens.refresh_token) LS.set('whoop_refresh_token', tokens.refresh_token);
      LS.set('whoop_expires_at', String(Date.now() + (tokens.expires_in||3600)*1000));
      setWhoopAuthFail(false);
      await fetchWhoopData(tokens.access_token, false);  // no second refresh
      return true;
    } catch(e) {
      console.warn('WHOOP refresh failed:', e && e.message);
      ['whoop_access_token','whoop_refresh_token','whoop_expires_at'].forEach(k => LS.del(k));
      setWhoopData(null);
      setWhoopAuthFail(true);   // surfaces "reconnect required" in the UI
      return false;
    }
  };

  const disconnectWhoop = () => {
    ['whoop_access_token','whoop_refresh_token','whoop_expires_at','whoop_cache'].forEach(k => LS.del(k));
    setWhoopData(null);
  };

  // Handle OAuth callback (tokens arrive in URL fragment)
  useEffect(() => {
    const hash = window.location.hash;
    if (hash && hash.includes('whoop_access_token')) {
      const p = new URLSearchParams(hash.substring(1));
      const at = p.get('whoop_access_token'), rt = p.get('whoop_refresh_token'), ei = p.get('whoop_expires_in');
      if (at) {
        LS.set('whoop_access_token', at);
        if (rt) LS.set('whoop_refresh_token', rt);
        LS.set('whoop_expires_at', String(Date.now() + parseInt((ei||3600) as any)*1000));
        window.history.replaceState(null, '', window.location.pathname);
        fetchWhoopData(at);
      }
    } else if (LS.get('whoop_access_token')) {
      const ea = LS.get('whoop_expires_at');
      if (ea && Date.now() > parseInt(ea) - 300000) { refreshWhoopToken(); }
      else { fetchWhoopData(); }
    }
    // Check for error
    const params = new URLSearchParams(window.location.search);
    if (params.get('whoop_error')) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  const [view, setView]         = useState('home');     // session time: 'am' (5am) | 'pm' (8pm)
  const [week, setWeek]         = useState(() => LS.getJSON<any>('dp_cfg', {}).week || 1);
  const [block, setBlock]       = useState(() => LS.getJSON<any>('dp_cfg', {}).block || 1);
  const [newBlockConfirm, setNewBlockConfirm] = useState(false);
  const [recovery, setRecovery] = useState(() => LS.getJSON<any>('dp_cfg', {}).rec || 'normal');
  const [sel, setSel]           = useState(null);
  const [logs, setLogs]         = useState<SessionLog[]>(() => LS.getJSON('dp_logs', []));
  const [wipData, setWipData]   = useState(() => LS.getJSON('dp_wip', null));
  const [expandLog, setExpandLog] = useState(null);
  const [progEx, setProgEx]     = useState(null);
  // Round 1: open the Strength chart on the most recently trained main lift (one with at least two
  // sessions, so there's a line to draw) instead of an empty picker. Your own choice then sticks.
  useEffect(() => {
    if (progEx) return;
    const seen: Record<string, number> = {};
    for (const l of logs) for (const ex of (l.exercises || [])) if (ORM_IDS.has(ex.id) && (ex.sets || []).some(s => (s.reps || 0) > 0)) seen[ex.id] = (seen[ex.id] || 0) + 1;
    for (const l of logs) for (const ex of (l.exercises || [])) if ((seen[ex.id] || 0) >= 2) { setProgEx(ex.id); return; }
  }, [logs]);
  const [progMetric, setProgMetric] = useState('e1rm');
  const [volMuscle, setVolMuscle] = useState('all');
  const [activeInts, setActiveInts] = useState(new Set());
  const [exIdx, setExIdx]       = useState(0);
  const [curSet, setCurSet]     = useState(0);
  const [setData, setSetData]   = useState<Record<string, SetEntry[]>>({});
  const [painData, setPainData] = useState<Record<string, any>>({});
  const [subMap, setSubMap] = useState<Record<string, SubstituteEntry>>({});
  const [showSwap, setShowSwap] = useState(false);
  const [reviseMode, setReviseMode] = useState(false);
  const [finishModal, setFinishModal] = useState(false);
  const [editingLog, setEditingLog] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  const [condensed, setCondensed] = useState(false);
  const [highVol, setHighVol] = useState(() => LS.getJSON<any>('dp_cfg', {}).highVol || false);
  const [goalPhase, setGoalPhase] = useState(() => LS.getJSON<any>('dp_cfg', {}).phase || 'bulk');
  const GOAL_LABEL = { bulk:'muscle gain in a slight surplus', maintain:'maintenance / recomposition at roughly maintenance calories', cut:'fat loss in a caloric deficit' };
  const phaseLine = `CURRENT GOAL: ${GOAL_LABEL[goalPhase]||GOAL_LABEL.bulk}.` + (goalPhase==='cut' ? ' Priority is RETAINING muscle. Progression is welcome when recovery is good and the reps are there \u2014 take it when it comes \u2014 but never force it: holding loads while bodyweight drops is also success, and stalls are expected, not failures to fix. Keep volume around maintenance, protect recovery, and flag if protein looks low or the deficit seems too steep to hold muscle.' : goalPhase==='maintain' ? ' Progression is welcome but not forced; maintaining strength or a slow recomp is the aim.' : ' A small surplus supports growth, so drive progression where recovery allows.');
  const [wt, setWt]             = useState<any>(60);
  const [rp, setRp]             = useState<any>(8);
  const [rir, setRir]           = useState<any>(1);
  const [editIdx, setEditIdx]   = useState(null);
  // Intensifier capture (final-set-only). Stored in SEPARATE fields on the set (partialReps /
  // myoReps), never folded into reps, so e1RM / volume / progression ignore them by construction.
  const [intPartials, setIntPartials] = useState('');
  const [intMyoStr, setIntMyoStr]     = useState('');
  const [intFail, setIntFail]         = useState(false);
  const clearIntInputs = () => { setIntPartials(''); setIntMyoStr(''); setIntFail(false); };
  useEffect(() => {
    const h = (e) => setStorageFail((e && e.detail && e.detail.key) || 'storage');
    window.addEventListener('dp-storage-fail', h);
    return () => window.removeEventListener('dp-storage-fail', h);
  }, []);
  const [skipConfirm, setSkipConfirm] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const startRef = useRef(null);
  const painRef = useRef({});
  const [timerOn, setTimerOn]   = useState(false);

  const [timerSecs, setTimerSecs] = useState(0);
  const [timerTotal, setTimerTotal] = useState(0);
  const [timerDone, setTimerDone] = useState(false);
  const [timerMsg, setTimerMsg] = useState('');
  const afterRef = useRef(null);
  const endRef = useRef(0);
  const [plateTgt, setPlateTgt] = useState<any>(100);
  const [warmWt, setWarmWt]     = useState<any>(100);
  const [ormWt, setOrmWt]       = useState<any>(100);
  const [ormRp, setOrmRp]       = useState<any>(5);
  const [bodyMetricsRaw, setBodyMetrics] = usePersistentState<BodyMetric[]>('body_metrics', []);
  const bodyMetrics = useMemo(()=>live(bodyMetricsRaw),[bodyMetricsRaw]);
  const [protocolLogRaw, setProtocolLog] = usePersistentState<ProtocolEntry[]>('protocol_log', []);
  const protocolLog = useMemo(()=>live(protocolLogRaw),[protocolLogRaw]);
  const [measurementsRaw, setMeasurements] = usePersistentState<Measurement[]>('body_measurements', []);
  const measurements = useMemo(()=>live(measurementsRaw),[measurementsRaw]);
  const [checkins, setCheckins] = useState<CheckinPhoto[]>(() => { try { return JSON.parse(LS.get('checkin_photos') || '[]'); } catch(e) { return []; } });
  // Photo image data lives in IndexedDB; this in-memory cache is hydrated from it on mount so every
  // reader (display, compare, AI, export) stays synchronous. imgOf falls back to any base64 still on
  // the record (un-migrated or IDB-unavailable), so a photo always resolves.
  const [photoImg, setPhotoImg] = useState<Record<string, string>>({});
  const imgOf = c => (c && (photoImg[c.id] != null ? photoImg[c.id] : c.img)) || null;
  // 'all' shows every pose grouped by check-in date; the pose names act as filters.
  const [ciPose, setCiPose] = useState('all');
  // Which pose a new upload is tagged as (the 'all' view is not a pose you can shoot).
  const [ciAddPose, setCiAddPose] = useState('front');
  const [ciCompareA, setCiCompareA] = useState(null);
  const [ciCompareB, setCiCompareB] = useState(null);
  const [ciAnalysis, setCiAnalysis] = useState(null);
  const [ciAnalysing, setCiAnalysing] = useState(false);
  const [mSite, setMSite] = useState('Waist');
  const [mVal, setMVal] = useState('');
  const [showAddMeas, setShowAddMeas] = useState(false);
  const [mViewSite, setMViewSite] = useState('Waist');
  const [expandedSite, setExpandedSite] = useState(null);
  const [showAllMeas, setShowAllMeas] = useState(false);
  const [showWtLog, setShowWtLog] = useState(false);
  const [showBpLog, setShowBpLog] = useState(false);
  const [showGlLog, setShowGlLog] = useState(false);
  const [expandedWeek, setExpandedWeek] = useState(null);
  const [cardioLogRaw, setCardioLog] = usePersistentState<CardioEntry[]>('cardio_log', []);
  const cardioLog = useMemo(()=>live(cardioLogRaw),[cardioLogRaw]);
  const [cType, setCType] = useState('Zone 2');
  const [cMin, setCMin] = useState('');
  const [cNote, setCNote] = useState('');
  const [showAddCardio, setShowAddCardio] = useState(false);
  const [bpLogRaw, setBpLog] = usePersistentState<BPReading[]>('bp_log', []);
  const bpLog = useMemo(()=>live(bpLogRaw),[bpLogRaw]);
  const [bpSys, setBpSys] = useState('');
  const [bpDia, setBpDia] = useState('');
  const [bpPulse, setBpPulse] = useState('');
  const [glucoseLogRaw, setGlucoseLog] = usePersistentState<GlucoseReading[]>('glucose_log', []);
  const glucoseLog = useMemo(()=>live(glucoseLogRaw),[glucoseLogRaw]);
  const [contextLogRaw, setContextLog] = usePersistentState<ContextEntry[]>('context_log', []);
  const contextLog = useMemo(()=>live(contextLogRaw),[contextLogRaw]);
  // Waking temp + morning-wood: one combined daily store (one entry/day, keyed by date).
  // These are the only genuinely new inputs the dashboard adds; everything else it reads
  // from stores that already exist and already sync.
  const [vitalsLogRaw, setVitalsLog] = usePersistentState<VitalsEntry[]>('vitals_log', []);
  const vitalsLog = useMemo(()=>live(vitalsLogRaw),[vitalsLogRaw]);
  const [tVal, setTVal] = useState('');
  const [tDate, setTDate] = useState(localToday());
  const [wDate, setWDate] = useState(localToday());
  const [showAddTemp, setShowAddTemp] = useState(false);
  // Body tab is 12 stacked sections; collapse all but Body Weight by default so Bloods and
  // Protocol Log aren't a 600-line scroll away. Open/closed state persists across sessions.
  const [secClosed, setSecClosed] = usePersistentState('body_sec_closed',
    ['measurements','photos','nutrition','cardio','bp','ctx','glucose','temp','wood','bloods','protocol']);
  const secOpen = (id) => !(secClosed||[]).includes(id);
  const toggleSec = (id) => setSecClosed(prev => {
    const arr = Array.isArray(prev) ? prev : [];
    return arr.includes(id) ? arr.filter(x=>x!==id) : [...arr, id];
  });
  // Progress tab groups. 17 analytics cards is too many to scan; grouping into three
  // collapsible bands keeps Week in review always visible and the rest one tap away.
  // v2 (Phase 5): new sections, so a new key gives everyone the new defaults once. Strength open, Explore closed.
  const [grpClosed, setGrpClosed] = usePersistentState<string[]>('prog_grp_closed_v2', ['training','recovery','coach']);
  const grpOpen = (id) => !(grpClosed||[]).includes(id);
  const toggleGrp = (id) => setGrpClosed(prev => {
    const arr = Array.isArray(prev) ? prev : [];
    return arr.includes(id) ? arr.filter(x=>x!==id) : [...arr, id];
  });
  const [showTempLog, setShowTempLog] = useState(false);
  const [showWoodLog, setShowWoodLog] = useState(false);
  const todayVitals = useMemo(()=>{ const t=localToday(); return vitalsLog.find(v=>v&&v.date===t)||null; },[vitalsLog]);
  const upsertVitalsDated = (d, patch) => {
    setVitalsLog(prev => {
      const ex=prev.find(v=>v&&v.date===d&&!v.deletedAt);
      const base = ex ? {...ex} : { id:newId(), date:d, temp:null, wood:null };
      const merged = {...base, ...patch, updatedAt:Date.now()};
      return [merged, ...prev.filter(v=>!(v&&v.date===d))].sort((a,b)=>(a.date<b.date?1:a.date>b.date?-1:0)).slice(0,400);
    });
  };
  const upsertVitals = (patch) => upsertVitalsDated(localToday(), patch);
  const saveTempBody = () => { const t=parseFloat(tVal); if(!isFinite(t)) return; upsertVitalsDated(tDate, {temp:t}); setTVal(''); };
  const setWood = (val) => upsertVitals({ wood: (todayVitals && todayVitals.wood===val) ? null : val });
  // Clear one field; tombstone the whole day only when nothing else remains on it.
  const clearVitalField = (d, field) => setVitalsLog(prev => prev.map(v => {
    if(!(v && v.date===d && !v.deletedAt)) return v;
    const other = field==='temp' ? v.wood : v.temp;
    if(other==null) return {...v, deletedAt:Date.now(), updatedAt:Date.now()};
    return {...v, [field]:null, updatedAt:Date.now()};
  }));
  const tempLogList = useMemo(()=> vitalsLog.filter(v=>v&&v.temp!=null), [vitalsLog]);
  // Retrospective decay of LOGGED injections only. Each logged mg dose declines by first-order
  // elimination at its ester's half-life; same-compound doses sum into one accumulation curve.
  // No scenario input — this is purely a picture of what has already been administered.
  const decayModel = useMemo(() => {
    const events = protocolLog.map(e => {
      const pk = pkFor(e.compound); const dose = parseFloat(e.dose as any);
      const t = e && e.date ? new Date(e.date).getTime() : NaN;
      const u = String(e && e.unit || '').toLowerCase();
      if (!pk || !Number.isFinite(dose) || dose <= 0 || !Number.isFinite(t)) return null;
      if (u && !u.includes('mg')) return null;              // only decay mg doses (skip iu/ml etc.)
      return { name: pk.name, hl: pk.hl, conf: pk.conf, src: pk.src, dose, t };
    }).filter(Boolean);
    if (!events.length) return null;
    const names = [...new Set(events.map(e => e.name))];
    const t0 = Math.min(...events.map(e => e.t));
    const tEnd = Date.now();
    const days = Math.max(1, Math.ceil((tEnd - t0) / 86400000));
    const step = days > 180 ? Math.ceil(days / 180) : 1;
    const series = names.map((name, idx) => {
      const evs = events.filter(e => e.name === name); const hl = evs[0].hl;
      const pts = [];
      for (let d = 0; d <= days; d += step) {
        const t = t0 + d * 86400000; let amt = 0;
        for (const e of evs) { if (t >= e.t) amt += e.dose * Math.pow(0.5, (t - e.t) / 86400000 / hl); }
        pts.push({ d, amt });
      }
      const cur = pts.length ? pts[pts.length - 1].amt : 0;
      const peak = pts.reduce((m, p) => Math.max(m, p.amt), 0);
      return { name, hl, conf: evs[0].conf, src: evs[0].src, n: evs.length, evs, pts, cur, peak, color: DECAY_COLORS[idx % DECAY_COLORS.length] };
    });
    const maxAmt = Math.max(1, ...series.flatMap(s => s.pts.map(p => p.amt)));
    return { series, t0, tEnd, days, step, maxAmt };
  }, [protocolLog]);
  const woodLogList = useMemo(()=> vitalsLog.filter(v=>v&&v.wood!=null), [vitalsLog]);
  const tempChartSeries = useMemo(()=> vitalsLog.filter(v=>v&&v.temp!=null).slice(0,21).reverse().map(v=>({x:fmtShort(v.date),y:v.temp,t:new Date(v.date).getTime()})), [vitalsLog]);
  // Waking temp has no universal target — what matters is drift from YOUR baseline. Band is
  // the median of the last 21 readings ±0.2. Needs >=7 readings before a baseline means anything.
  // WHOOP skin temp baseline. Wrist skin temp is absolute-inaccurate but drift-accurate,
  // so only the deviation from the user's own 7-day mean is meaningful.
  const skinTempStat = useMemo(()=>{
    const xs = (whoopHistory||[]).filter(h=>h && h.skinTemp!=null).slice(-7).map(h=>h.skinTemp);
    if (!xs.length) return null;
    const avg = +(xs.reduce((a,b)=>a+b,0)/xs.length).toFixed(2);
    const cur = whoopData && whoopData.skinTemp!=null ? whoopData.skinTemp : null;
    return { avg, n:xs.length, delta: cur!=null ? +(cur-avg).toFixed(1) : null };
  },[whoopHistory, whoopData]);

  const tempBand = useMemo(()=>{
    const xs = vitalsLog.filter(v=>v&&v.temp!=null).slice(0,21).map(v=>v.temp).sort((a,b)=>a-b);
    if (xs.length < 7) return null;
    const med = xs.length%2 ? xs[(xs.length-1)/2] : (xs[xs.length/2-1]+xs[xs.length/2])/2;
    return { lo:+(med-0.2).toFixed(2), hi:+(med+0.2).toFixed(2) };
  },[vitalsLog]);
  const [bloodsLogRaw, setBloodsLog] = usePersistentState<BloodPanel[]>('bloods_log', []);
  // P0.7: default is empty and there is NO resurrection effect. Blood panels are user data —
  // added in-app or restored via Tools → Import (see bloods-backup.json). Deleting one now sticks.
  const bloodsLog = useMemo(()=>live(bloodsLogRaw),[bloodsLogRaw]);
  // In-app panel entry. The draft is persisted so an app reload mid-entry does not lose it.
  // Shape: { editId, date, provider, note, rows:[{k,v,unit,ref,g,flag}], err }
  const [bldForm, setBldForm] = usePersistentState<BloodForm | null>('bloods_draft', null);
  // Newest known unit / range / group for every marker name, used to pre-fill new entries.
  const bloodMarkerIndex = useMemo(() => {
    const idx = {};
    try {
      const panels = (bloodsLog || []).filter(p => p && p.date).slice().sort((a, b) => a.date < b.date ? 1 : -1);
      for (const p of panels) for (const g of (p.groups || [])) for (const m of (g.m || [])) {
        if (!m || !m.k) continue;
        const nk = bloodNormKey(m.k);
        if (!idx[nk]) idx[nk] = { k: m.k, unit: m.unit || '', ref: m.ref || '', g: g.g || 'Other' };
      }
    } catch (e) { /* display helper only */ }
    return idx;
  }, [bloodsLog]);
  // BIOMARKER MONITOR. Panels are point-in-time snapshots; this turns them into a longitudinal
  // view so drift between draws is visible instead of buried in a PDF. Markers your protocol
  // moves most are surfaced first. Monitoring for review with your doctor — never a diagnosis.
  const PRIORITY_MARKERS = ['Haematocrit','Haemoglobin','MCV','Cystatin C','eGFR','ApoB / ApoA-I','LDL','Triglycerides','HDL','hs-CRP','PSA (total)','Testosterone','Free testosterone','SHBG','HbA1c','Ferritin'];
  const EXPECTED_MARKERS = ['Oestradiol (E2)','IGF-1','Prolactin','ALT','AST'];
  const biomarkers = useMemo(() => {
    const num = (s) => { const m = String(s==null?'':s).replace(/[<>~]/g,'').match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : null; };
    const byKey = new Map();
    for (const panel of (bloodsLog||[])) {
      const d = panel && panel.date ? panel.date : null; if (!d) continue;
      for (const grp of (panel.groups||[])) for (const mk of (grp.m||[])) {
        if (!mk || !mk.k) continue;
        if (!byKey.has(mk.k)) byKey.set(mk.k, []);
        byKey.get(mk.k).push({ date:d, v:num(mk.disp), disp:mk.disp, unit:mk.unit||'', ref:mk.ref||'', flag:mk.flag||'ok' });
      }
    }
    const rows = [];
    for (const [k, arr] of byKey) {
      arr.sort((a,b)=> a.date < b.date ? 1 : a.date > b.date ? -1 : 0);   // newest first
      const cur = arr[0], prev = arr[1] || null;
      let delta = null, dir = 'flat';
      if (prev && cur.v != null && prev.v != null) {
        delta = +(cur.v - prev.v).toFixed(2);
        if (Math.abs(delta) > 1e-9) dir = delta > 0 ? 'up' : 'down';
      }
      const pi = PRIORITY_MARKERS.indexOf(k);
      rows.push({ k, cur, prev, delta, dir, n:arr.length, hist:arr,
                  outOfRange: cur.flag==='high'||cur.flag==='low',
                  priority: pi === -1 ? 999 : pi });
    }
    rows.sort((a,b)=>{
      if (a.outOfRange !== b.outOfRange) return a.outOfRange ? -1 : 1;   // flagged first
      if (a.priority !== b.priority) return a.priority - b.priority;      // then stack movers
      return a.k.localeCompare(b.k);
    });
    const dates = [...new Set((bloodsLog||[]).map(p=>p&&p.date).filter(Boolean))].sort().reverse();
    const lastDraw = dates[0] || null;
    const daysSince = lastDraw ? Math.floor((Date.now() - new Date(lastDraw+'T12:00:00Z').getTime())/86400000) : null;
    const covered = new Set(rows.map(r=>r.k));
    const missing = EXPECTED_MARKERS.filter(m=>!covered.has(m));
    return { rows, flagged: rows.filter(r=>r.outOfRange), lastDraw, daysSince,
             dueIn: daysSince==null ? null : 42 - daysSince, missing, panels: dates.length };
  }, [bloodsLog]);
  // Cross-panel / cross-provider comparison. Providers name the same marker differently
  // ("Total Testosterone" vs "Testosterone", "Oestradiol" vs "Estradiol", "FT4" vs "Free T4"),
  // so a raw string match wouldn't align them. normKey strips case/punctuation and maps known
  // aliases to one canonical row. Columns are the panel DATES (newest first). Fully wrapped —
  // this is a display view over user data and must never crash the Body tab.
  const bloodCompare = useMemo(() => {
    try {
      const ALIAS = {
        totaltestosterone:'testosterone', freetestosterone:'freetestosterone',
        estradiol:'oestradiol', oestradiol:'oestradiol',
        ft4:'freet4', freet4:'freet4', ft3:'freet3', freet3:'freet3',
        egfr:'egfr', estimatedglomerularfiltrationrate:'egfr',
        totalcholesterolhdlratio:'tchdlratio', tchdlratio:'tchdlratio', cholesterolhdlratio:'tchdlratio',
        rbc:'redbloodcells', redbloodcells:'redbloodcells', wbc:'whitebloodcells', whitebloodcells:'whitebloodcells',
        mcv:'mcv', meancellvolume:'mcv', mch:'mch', meancellhaemoglobin:'mch', meancorpuscularhaemoglobin:'mch',
        mchc:'mchc', totalbilirubin:'bilirubin', bilirubin:'bilirubin',
        totalcholesterol:'totalcholesterol', ldlcholesterol:'ldl', ldl:'ldl', hdl:'hdl',
        haematocrit:'haematocrit', hct:'haematocrit', haemoglobin:'haemoglobin', hgb:'haemoglobin',
        prostatespecificantigenpsa:'psa', psa:'psa', thyroidfunctiontsh:'tsh', tsh:'tsh',
        sexhormonebindingglobulinshbg:'shbg', shbg:'shbg',
        folliclestimulatinghormone:'fsh', fsh:'fsh', luteinisinghormone:'lh', lh:'lh',
      };
      const norm = k => { const s = String(k||'').toLowerCase().replace(/[^a-z0-9]/g,''); return ALIAS[s] || s; };
      const panels = (bloodsLog||[]).filter(p=>p&&p.date).slice().sort((a,b)=> a.date<b.date?1:-1);
      const dates = panels.map(p=>p.date);
      const rows: Record<string, any> = {};
      for (const p of panels) for (const g of (p.groups||[])) for (const m of (g.m||[])) {
        if (!m || m.k==null) continue;
        const nk = norm(m.k); if (!nk) continue;
        if (!rows[nk]) rows[nk] = { label: m.k, cells: {} };
        if (!rows[nk].cells[p.date]) rows[nk].cells[p.date] = m; // newest panel supplies the row label
      }
      // Unit check: providers can report the same marker in different units (nmol/L vs ng/dL).
      // Spelling variants (IU/L vs U/L, umol vs µmol, x10^9 vs 10⁹) are normalised first so only
      // real mismatches are flagged, because comparing raw numbers across units is meaningless.
      const SUP = {'⁰':'0','¹':'1','²':'2','³':'3','⁴':'4','⁵':'5','⁶':'6','⁷':'7','⁸':'8','⁹':'9'};
      const normUnit = u => String(u || '').toLowerCase().replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, c => SUP[c]).replace(/µ|μ/g, 'u').replace(/\s|\*|\^|x(?=10)/g, '').replace(/miu/g, 'mu').replace(/iu\//g, 'u/');
      const arr = Object.values(rows).map(r => {
        const units = new Set((Object.values(r.cells) as any[]).map(c => normUnit(c && c.unit)).filter(Boolean));
        return { ...r, n: Object.keys(r.cells).length, unitMismatch: units.size > 1 };
      });
      const multi = arr.filter(r => r.n >= 2).sort((a,b) => (b.n - a.n) || a.label.localeCompare(b.label));
      return { dates, rows: multi, anyMismatch: multi.some(r => r.unitMismatch) };
    } catch(e) { try{console.error('bloodCompare failed',e);}catch(_){} return { dates:[], rows:[] }; }
  }, [bloodsLog]);
  const tempStat = useMemo(()=>{
    const all = vitalsLog.filter(v=>v&&v.temp!=null);
    const cur = todayVitals && todayVitals.temp!=null ? todayVitals.temp : null;
    // Baseline from PRECEDING days only — including today's own reading in its baseline pulls the
    // average toward it and understates the deviation you're trying to detect. Falls back to all
    // readings only when there is no prior history yet.
    const prior = all.filter(v => v.date && v.date.slice(0,10) !== localToday());
    const src = (prior.length ? prior : all).slice(0,7).map(v=>v.temp);
    if(!src.length) return null;
    const avg=+(src.reduce((a,b)=>a+b,0)/src.length).toFixed(2);
    const delta = cur!=null ? +(cur-avg).toFixed(1) : null;
    return { avg, n:src.length, delta };
  },[vitalsLog, todayVitals]);
  const [ctxUnits, setCtxUnits] = useState('');
  const [ctxTags, setCtxTags] = useState<string[]>([]);
  const [ctxNote, setCtxNote] = useState('');
  const [ctxDate, setCtxDate] = useState(localToday());
  const [showAddCtx, setShowAddCtx] = useState(false);
  const [showCtxLog, setShowCtxLog] = useState(false);
  const [glVal, setGlVal] = useState('');
  const [showAddGl, setShowAddGl] = useState(false);
  const [showAddBP, setShowAddBP] = useState(false);
  const [newWt, setNewWt]             = useState('');
  const [newWtNote, setNewWtNote]     = useState('');
  const [showAddBody, setShowAddBody] = useState(false);
  const [editBody, setEditBody] = useState(null);
  const [editBodyDraft, setEditBodyDraft] = useState(null);
  const [newBF, setNewBF] = useState('');
  const [newMuscle, setNewMuscle] = useState('');
  const [showAddProt, setShowAddProt] = useState(false);
  const [pCmp, setPCmp]               = useState('TRT');
  const [pDose, setPDose]             = useState('');
  const [pUnit, setPUnit]             = useState('mg');
  const [pNote, setPNote]             = useState('');
  const [wtDate, setWtDate] = useState(localToday());
  const [mDate, setMDate] = useState(localToday());
  const [cDate, setCDate] = useState(localToday());
  const [bpDate, setBpDate] = useState(localToday());
  const [glDate, setGlDate] = useState(localToday()); // separate from bpDate: they were coupled, so editing one silently changed the other
  const [pDate, setPDate] = useState(localToday());
  const [cfgUpdatedAt, setCfgUpdatedAt] = usePersistentState('cfg_updated_at', 0);
  const [deloadSkips, setDeloadSkips] = usePersistentState<Record<string, boolean>>('deload_skips', {});
  const BUILD_ID = (typeof window !== 'undefined' && window.DP_BUILD) || 'unknown';   // single source of truth is the early BUILD stamp (top of file); bump it per deploy until build-time injection lands (P3)
  const [schemaV, setSchemaV] = usePersistentState('schema_v', 0);
  // ONE-TIME migration: stamp immutable ids onto pre-existing records and persist them.
  // Deriving legacy ids on every merge is fragile; doing it once and saving means every
  // later merge compares real, stable ids.
  useEffect(() => {
    if (schemaV >= 1) return;
    setLogs(prev => ensureIds(prev, 'wk'));
    setBodyMetrics(prev => ensureIds(prev, 'bm'));
    setMeasurements(prev => ensureIds(prev, 'ms'));
    setNutrition(prev => ensureIds(prev, 'nu'));
    setCardioLog(prev => ensureIds(prev, 'cd'));
    setBpLog(prev => ensureIds(prev, 'bp'));
    setGlucoseLog(prev => ensureIds(prev, 'gl'));
    setProtocolLog(prev => ensureIds(prev, 'pr'));
    setContextLog(prev => ensureIds(prev, 'cx'));
    setSchemaV(1);
  }, [schemaV]);

  // NOTE: this effect PERSISTS config but must NOT stamp cfgUpdatedAt. A useEffect fires on
  // MOUNT as well as on change, so merely opening the app was marking the local config as
  // "just edited" — which then beat a genuinely newer cloud config on the next pull.
  // cfgUpdatedAt is stamped only by the explicit user-facing setters below.
  useEffect(() => { LS.set('dp_cfg', JSON.stringify({week, rec:recovery, block, highVol, phase: goalPhase})); }, [week, recovery, block, highVol, goalPhase]);
  // User-facing config mutators: these (and only these) represent a genuine config edit.
  const touchCfg = () => setCfgUpdatedAt(Date.now());
  const userSetWeek     = v => { setWeek(v);      touchCfg(); };
  const userSetRecovery = v => { setRecovery(v);  touchCfg(); };
  const userSetBlock    = v => { setBlock(v);     touchCfg(); };
  const userSetHighVol  = v => { setHighVol(v);   touchCfg(); };
  const userSetPhase    = v => { setGoalPhase(v); touchCfg(); };
  useEffect(() => { LS.set('dp_logs', JSON.stringify(logs)); }, [logs]);
  // Hydrate the photo cache from IndexedDB once, and migrate any base64 still on records into IDB.
  // A base64 is only trusted as "migrated" AFTER its IDB write resolves, so nothing is ever lost.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cache = {};
      for (const c of checkins) {
        try {
          let d = await IDB.get(c.id);
          if (d == null && c.img) { await IDB.put(c.id, c.img); d = c.img; } // migrate, confirmed
          if (d != null) cache[c.id] = d;
        } catch(_) { /* IDB unavailable — base64 fallback via imgOf still works */ }
      }
      if (!cancelled && Object.keys(cache).length) setPhotoImg(cache);
    })();
    return () => { cancelled = true; };
  }, []);
  // Persist check-in METADATA. For photos confirmed in the cache (=in IDB), strip the base64 from
  // the localStorage copy to free the ~5MB quota; keep base64 for any not-yet-migrated (safety).
  useEffect(()=>{
    const meta = checkins.map(c => (photoImg[c.id] != null ? { ...c, img: null } : c));
    const ok = LS.set('checkin_photos', JSON.stringify(meta));
    if(!ok && checkins.length) alert('Storage full — your check-in photo was NOT saved. Delete an older photo and try again.');
  },[checkins, photoImg]);

  useEffect(() => {
    if (!timerOn) return;
    const tick = () => {
      const remaining = Math.max(0, Math.round((endRef.current - Date.now()) / 1000));
      setTimerSecs(remaining);
      if (remaining <= 0) { if(restStartRef.current){restRef.current += (Date.now()-restStartRef.current)/1000; restStartRef.current=null;} setTimerOn(false); setTimerDone(true); }
    };
    tick();
    const iv = setInterval(tick, 250);
    const onVis = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', onVis); };
  }, [timerOn]);

  const [restFlash, setRestFlash] = useState(false);
  useEffect(() => {
    if (!timerDone) return;
    setTimerDone(false);
    playChime();
    // Visual alert as well as audible. On iOS the mute switch silences Web Audio and
    // navigator.vibrate does nothing, so sound alone cannot be relied on mid-session.
    setRestFlash(true);
    setTimeout(() => setRestFlash(false), 1800);
    const cb = afterRef.current; afterRef.current = null;
    if (cb) cb();
  }, [timerDone]);

  // Track REAL rest time so duration can separate active work from resting/standing around.
  // Wall-clock alone counted a phone break as lifting; restRef accumulates only timer time.
  const restRef = useRef(0); const restStartRef = useRef(null);
  const startTimer = (secs, msg, cb) => { primeAudio(); afterRef.current=cb; endRef.current=Date.now()+secs*1000; restStartRef.current=Date.now(); setTimerMsg(msg||''); setTimerTotal(secs); setTimerSecs(secs); setTimerDone(false); setTimerOn(true); };
  const skipTimer = () => { if(restStartRef.current){restRef.current += (Date.now()-restStartRef.current)/1000; restStartRef.current=null;} setTimerOn(false); setTimerDone(false); const cb=afterRef.current; afterRef.current=null; if(cb)cb(); };

  const getLastWt = exId => { for(const l of logs){const e=l.exercises?.find(x=>x.id===exId);if(e?.sets?.length)return e.sets[e.sets.length-1].weight||0;} return 0; };
  const saveWip = (sid, data, ei, cs) => { const d={sessionId:sid,week,startTime:startRef.current,exIdx:ei,curSet:cs,setData:data,painData:painRef.current,subMap}; const ok=LS.set('dp_wip',JSON.stringify(d)); setWipData(d); if(!ok){ try{ window.dispatchEvent(new CustomEvent('dp-storage-fail',{detail:{key:'dp_wip'}})); }catch(_){} } };
  const clearWip = () => { LS.del('dp_wip'); setWipData(null); };

  const startWorkout = sid => {
    const ex0 = SESSIONS[sid].exercises[0];
    setSel(sid); setExIdx(0); setCurSet(0); setSetData({});
    const _t0 = getTarget(ex0, logs, week, effPhase);
    setWt(_t0.weight||60); setRp(_t0.reps||ex0.rMin); setRir(rirDefaultFor(ex0, effWR(week).rirN));
    setEditIdx(null); startRef.current=Date.now(); restRef.current=0; restStartRef.current=null;
    setPainData({}); painRef.current={}; setSubMap({}); setReviseMode(false); setFinishModal(false);
    clearWip(); setView('workout');
  };

  const resumeWorkout = () => {
    if (!wipData) return;
    setSel(wipData.sessionId); setExIdx(wipData.exIdx||0); setCurSet(wipData.curSet||0);
    setSetData(wipData.setData||{});
    const sess=SESSIONS[wipData.sessionId]; const ex=sess.exercises[wipData.exIdx||0];
    const _rsub=(wipData.subMap||{})[ex.id]; const _reff=_rsub?_rsub.id:ex.id;
    const last=(wipData.setData?.[_reff]||[]);
    setWt(last.length?last[last.length-1].weight:getLastWt(_reff)||60);
    const _rwk=wipData.week||week;
    setRp(ex.rMin); setRir(rirDefaultFor(ex, effWR(_rwk, DLW.has(_rwk) && !deloadSkips[block+'-'+_rwk]).rirN));
    startRef.current=wipData.startTime||Date.now();
    setPainData(wipData.painData||{}); painRef.current=wipData.painData||{}; setSubMap(wipData.subMap||{}); setReviseMode(false); setFinishModal(false);
    setWeek(wipData.week||week); setView('workout'); setWipData(null);
  };

  const startNewBlock = () => { setBlock(b=>b+1); setWeek(1); touchCfg(); setNewBlockConfirm(false); setView('home'); };

  const saveAndFinish = newData => {
    const sess=SESSIONS[sel];
    const dur=Math.round((Date.now()-(startRef.current||Date.now()))/60000);
    const _restMin = Math.round(restRef.current/60);
    const log={date:new Date().toISOString(),sessionId:sel,sessionName:sess.name,week,block,duration:dur,restMin:_restMin,activeMin:Math.max(0,dur-_restMin),deload:deloadActive||false,hv:hvActive||false,
      exercises:sess.exercises.map(ex=>{const e=subMap[ex.id]?{...ex,...subMap[ex.id]}:ex; return {id:e.id,name:e.name,...(subMap[ex.id]?{origId:ex.id}:{}),sets:(newData||setData)[e.id]||[],pain:painRef.current[e.id]||0};}).filter(ex=>ex.sets.length>0)};
    setLogs(prev => [{...log, id:newId(), updatedAt: Date.now()},...prev].slice(0,600));   // 600 ≈ 3yr at 4x/wk: a 200 cap silently erased early-block baselines used by stalls/retention
    clearWip(); setReview(null); setView('complete');
  };

  const logSet = () => {
    const sess=SESSIONS[sel]; const baseEx2=sess.exercises[exIdx]; const ex=subMap[baseEx2.id]?{...baseEx2,...subMap[baseEx2.id]}:baseEx2;
    const effSets=getEffSets(ex,week,hvActive);
    // Intensifier is captured only on the FINAL set, only for an active-intensifier lift with a
    // typed kind, only in intensifier weeks. Never gated on readiness. Swapped lifts have no
    // int.kind so they are naturally excluded.
    const _slot = editIdx !== null ? editIdx : (setData[ex.id]||[]).length;
    const _intKind = (ex.int && ex.int.kind) ? ex.int.kind : null;
    const _intOK = showInt && !subMap[baseEx2.id] && activeInts.has(baseEx2.id) && _intKind && _slot === effSets-1 && !DLW.has(week);
    const intensifier = _intOK ? buildIntensifier(_intKind, { partials:intPartials, myoStr:intMyoStr, fail:intFail }) : null;
    const newSet={weight:parseFloat(wt)||0, reps:parseInt(rp)||0, rir, ...(intensifier?{intensifier}:{})};
    if (editIdx !== null) {
      const arr=[...(setData[ex.id]||[])]; arr[editIdx]=newSet;
      const nd={...setData,[ex.id]:arr}; setSetData(nd); setEditIdx(null); clearIntInputs();
      setWt(arr[arr.length-1].weight); setRp(ex.rMin); setRir(rirDefaultFor(ex, effWR(week).rirN));
      saveWip(sel,nd,exIdx,curSet); return;
    }
    const prev=setData[ex.id]||[];
    const newSets=[...prev,newSet];
    const nd={...setData,[ex.id]:newSets}; setSetData(nd); clearIntInputs();
    const nextExIdx=exIdx+1;
    if (newSets.length >= effSets) {
      const cb = () => {
        if (reviseMode || nextExIdx >= sess.exercises.length) { tryFinish(nd); }
        else {
          const nx=sess.exercises[nextExIdx];
          setExIdx(nextExIdx); setCurSet(0); setEditIdx(null);
          const _tn = getTarget(nx, logs, week, effPhase);
          setWt(_tn.weight||60); setRp(_tn.reps||nx.rMin); setRir(rirDefaultFor(nx, effWR(week).rirN));
          saveWip(sel,nd,nextExIdx,0);
        }
      };
      startTimer(ex.rest, 'Next exercise when ready', cb);
    } else {
      setCurSet(newSets.length);
      saveWip(sel,nd,exIdx,newSets.length);
      startTimer(ex.rest, 'Rest, then next set', null);
    }
  };

  const goToExercise = (idx) => {
    const sess=SESSIONS[sel]; if(idx<0||idx>=sess.exercises.length) return;
    const baseEx=sess.exercises[idx]; const eid=subMap[baseEx.id]?subMap[baseEx.id].id:baseEx.id;
    const logged=setData[eid]||[];
    setExIdx(idx); setCurSet(logged.length); setEditIdx(null); setReviseMode(true); setFinishModal(false); clearIntInputs();
    const t=getTarget(baseEx,logs,week,effPhase,eid);
    setWt(logged.length?logged[logged.length-1].weight:(t.weight||60));
    setRp(t.reps||baseEx.rMin); setRir(rirDefaultFor(baseEx, effWR(week).rirN));
    saveWip(sel,setData,idx,logged.length);
  };

  const tryFinish = (data) => {
    const sess=SESSIONS[sel]; const d=data||setData;
    const undone=sess.exercises.filter(ex=>{ if(ex.opt) return false; const eid=subMap[ex.id]?subMap[ex.id].id:ex.id; return !(d[eid]&&d[eid].length>0); });
    if(undone.length>0){ setFinishModal(true); } else { saveAndFinish(d); }
  };

  const doSkipEx = () => {
    setSkipConfirm(false); clearIntInputs();
    const sess=SESSIONS[sel]; const nx=exIdx+1;
    if (nx >= sess.exercises.length) { tryFinish(setData); }
    else {
      const nextEx=sess.exercises[nx];
      setExIdx(nx); setCurSet(0); setEditIdx(null);
      const _ts = getTarget(nextEx, logs, week, effPhase);
      setWt(_ts.weight||60); setRp(_ts.reps||nextEx.rMin); setRir(rirDefaultFor(nextEx, effWR(week).rirN));
      saveWip(sel,setData,nx,0);
    }
  };

  // ---- Photo check-in: compress to thumbnail on upload (on-device only) ----
  const compressImage = (file, maxDim=600, quality=0.6) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxDim) { height = Math.round(height * maxDim / width); width = maxDim; }
        else if (height > maxDim) { width = Math.round(width * maxDim / height); height = maxDim; }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const addCheckin = async (file) => {
    if (!file) return;
    try {
      const dataUrl = await compressImage(file);
      const wk = logs[0]?.week || week;
      const ph = getPhase(wk);
      const bw = bodyMetrics[0]?.weight || null;
      const waist = measurements.find(m => m.site === 'Waist')?.value || null;
      const entry = { id: Date.now(), date: new Date().toISOString(), pose: ciAddPose, week: wk, phase: ph.name, weight: bw, waist, img: dataUrl };
      try { await IDB.put(entry.id, dataUrl); setPhotoImg(m => ({ ...m, [entry.id]: dataUrl })); } catch(_) { /* keep base64 on the entry as fallback */ }
      setCheckins(prev => [entry, ...prev].slice(0, 24));
    } catch(e) { alert('Could not process image: ' + e.message); }
  };

  const delCheckin = (id) => { try { IDB.del(id); } catch(_){} setPhotoImg(m => { const n = { ...m }; delete n[id]; return n; }); setCheckins(prev => prev.filter(c => c.id !== id)); };

  const analyseProgress = async () => {
    if (!ciCompareA || !ciCompareB) { alert('Pick two check-ins to compare (baseline and current).'); return; }
    const a = checkins.find(c => c.id === ciCompareA);
    const b = checkins.find(c => c.id === ciCompareB);
    // Belt and braces: the grid already blocks mismatched selections, but a stale selection
    // could survive a filter change. Comparing a front against a side would yield a
    // confident and meaningless read, so refuse it here too.
    if (a && b && a.pose !== b.pose) {
      alert('Compare the same pose \u2014 you have picked a ' + a.pose + ' and a ' + b.pose + '.');
      return;
    }
    if (!a || !b) return;
    // order chronologically: earlier = baseline
    const [base, cur] = new Date(a.date) < new Date(b.date) ? [a, b] : [b, a];
    setCiAnalysing(true); setCiAnalysis(null);
    const wkGap = (cur.week || 0) - (base.week || 0);
    // Resolve waist/bodyweight LIVE from logged history nearest each photo's date,
    // rather than the value snapshotted onto the photo at capture (which may be null
    // if the measurement was logged after the photo was taken).
    const nearest = (arr, dateStr, key) => {
      if (!arr || !arr.length) return null;
      const t = new Date(dateStr).getTime();
      let best = null, bestGap = Infinity;
      for (const m of arr) {
        const g = Math.abs(new Date(m.date).getTime() - t);
        if (g < bestGap) { bestGap = g; best = m; }
      }
      return best ? (best[key] != null ? best[key] : null) : null;
    };
    const waistArr = measurements.filter(m => m.site === 'Waist');
    const baseWaist = base.waist || nearest(waistArr, base.date, 'value');
    const curWaist = cur.waist || nearest(waistArr, cur.date, 'value');
    const baseBw = base.weight || nearest(bodyMetrics, base.date, 'weight');
    const curBw = cur.weight || nearest(bodyMetrics, cur.date, 'weight');
    const bwLine = (baseBw && curBw) ? `Bodyweight: ${baseBw}kg to ${curBw}kg.` : 'Bodyweight not logged for both.';
    const waistLine = (baseWaist && curWaist) ? `Waist: ${baseWaist}cm to ${curWaist}cm.` : 'Waist not logged for both.';
    const prompt = `You are an elite bodybuilding coach comparing two physique check-in photos of a 48-year-old male on an optimised hormonal protocol with enhanced recovery, mid-hypertrophy-block, priorities chest > back > delts. The first image is BASELINE (week ${base.week}, ${base.phase}), the second is CURRENT (week ${cur.week}, ${cur.phase}), roughly ${wkGap} weeks apart. Both are the ${base.pose} pose. Hard data: ${bwLine} ${waistLine}\n\nGive an honest, specific comparison in 2-3 short paragraphs. Be direct and critical, not flattering. Cover: (1) visible structural changes you can actually see between the two images (fullness, conditioning, specific regions), (2) whether the priorities (chest, back, delts) appear to be progressing relative to the rest, (3) one or two concrete actions.\n\nCRITICAL HONESTY RULES: Do NOT estimate body-fat percentage from photos - it is unreliable. Do NOT claim precise muscle gain numbers. Explicitly flag that lighting, pump, water (especially on this protocol) and pose consistency can swamp real weekly change, and anchor your read to the bodyweight/waist trend above rather than the pixels where they disagree. If the two photos are too inconsistent in pose/lighting to judge, say so plainly.`;
    try {
      const res = await fetch('/.netlify/functions/ai-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 700, messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imgOf(base).split(',')[1] } },
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imgOf(cur).split(',')[1] } },
          { type: 'text', text: prompt }
        ] }] })
      });
      const data = await res.json();
      setCiAnalysis(data.content?.find(b => b.type === 'text')?.text || 'Could not analyse. The AI proxy returned no text — check the Netlify function and ANTHROPIC_API_KEY.');
    } catch(e) { setCiAnalysis('Error: ' + e.message); }
    finally { setCiAnalysing(false); }
  };

  const addBP = () => {
    const sys=parseNum(bpSys), dia=parseNum(bpDia);
    if (sys==null || dia==null || sys<=0 || dia<=0) { alert('Enter both systolic and diastolic.'); return; }
    if (sys<60 || sys>260 || dia<40 || dia>160) { alert('BP looks off — check the numbers (systolic 60–260, diastolic 40–160).'); return; }
    if (sys<=dia) { alert('Systolic should be higher than diastolic — did they get swapped?'); return; }
    if (bpDate > localToday()) { alert('That date is in the future — pick today or earlier.'); return; }
    const entry = { date: `${bpDate}T12:00:00.000Z`, sys: Math.round(sys), dia: Math.round(dia), pulse: parseNum(bpPulse)!=null ? Math.round(parseNum(bpPulse)) : null };
    setBpLog(prev => [{...entry, id:newId(), updatedAt: Date.now()}, ...prev].sort((a,b)=>(a.date<b.date?1:a.date>b.date?-1:0)).slice(0, 400));
    setBpSys(''); setBpDia(''); setBpPulse(''); setBpDate(localToday()); setShowAddBP(false);
  };

  const addContext = () => {
    const u = parseNum(ctxUnits);
    if ((u == null || u <= 0) && !ctxTags.length && !ctxNote.trim()) return;
    const entry = { date: `${ctxDate}T12:00:00.000Z`, units: u != null && u > 0 ? u : 0, tags: [...ctxTags], note: ctxNote.trim() };
    setContextLog(prev => {
      const now = Date.now();
      const existing = prev.find(e => !e.deletedAt && (e.date||'').slice(0,10) === ctxDate);
      let arr;
      if (existing) {
        let first = true;
        arr = prev.map(e => {
          if ((e.date||'').slice(0,10) !== ctxDate || e.deletedAt) return e;
          if (e.id === existing.id && first) { first = false; return { ...e, ...entry, id: e.id, deletedAt: undefined, updatedAt: now }; }
          return { ...e, deletedAt: now, updatedAt: now };
        });
      } else {
        arr = [{ ...entry, id: newId(), updatedAt: now }, ...prev];
      }
      arr.sort((a,b)=>(a.date<b.date?1:a.date>b.date?-1:0));
      return arr.slice(0, 400);
    });
    setCtxUnits(''); setCtxTags([]); setCtxNote(''); setCtxDate(localToday()); setShowAddCtx(false);
  };

  const addGlucose = () => {
    const g=parseNum(glVal);
    if (g==null || g<=0) { alert('Enter a glucose value.'); return; }
    if (g<2 || g>30) { alert('Glucose looks off — enter mmol/L between 2 and 30.'); return; }
    if (glDate > localToday()) { alert('That date is in the future — pick today or earlier.'); return; }
    const entry = { date: `${glDate}T12:00:00.000Z`, value: g };
    setGlucoseLog(prev => [{...entry, id:newId(), updatedAt: Date.now()}, ...prev].sort((a,b)=>(a.date<b.date?1:a.date>b.date?-1:0)).slice(0, 400));
    setGlVal(''); setGlDate(localToday()); setShowAddGl(false);
  };

  const updSet = (exj, setk, field, val) => setEditDraft(d => ({...d, exercises: d.exercises.map((ex,j)=> j!==exj ? ex : {...ex, sets: ex.sets.map((s,k)=> k!==setk ? s : {...s, [field]: val})})}));
  const delSet = (exj, setk) => setEditDraft(d => ({...d, exercises: d.exercises.map((ex,j)=> j!==exj ? ex : {...ex, sets: ex.sets.filter((_,k)=>k!==setk)})}));
  const addSet = (exj) => setEditDraft(d => ({...d, exercises: d.exercises.map((ex,j)=> j!==exj ? ex : {...ex, sets:[...ex.sets, {weight:ex.sets.length?ex.sets[ex.sets.length-1].weight:'', reps:'', rir:''}]})}));
  const delExercise = (exj) => setEditDraft(d => ({...d, exercises: d.exercises.filter((_,j)=>j!==exj)}));
  const addExercise = (exId) => setEditDraft(d => { const sess=SESSIONS[d.sessionId]; const rEx=sess&&sess.exercises.find(e=>e.id===exId); if(!rEx) return d; return {...d, exercises:[...d.exercises, {id:rEx.id, name:rEx.name, sets:[{weight:'',reps:'',rir:''}], pain:0}]}; });
  const saveEdit = () => {
    if (!editDraft) return;
    const cleaned = {...editDraft, exercises: editDraft.exercises.map(ex => ({...ex, sets: ex.sets.map(s=>({...s, weight:parseFloat(s.weight)||0, reps:parseInt(s.reps)||0, rir:(s.rir===''||s.rir==null)?null:parseInt(s.rir)})).filter(s=>s.weight>0||s.reps>0)})).filter(ex=>ex.sets.length>0)};
    // Match by immutable log id, so two sessions of the same type on the same day can't both be
    // overwritten. Fall back to date+sessionId only for any legacy log that predates ids.
    // Shallow-merge so fields not in the editor draft (e.g. later WHOOP enrichment) survive.
    setLogs(prev => prev.map(l => (
      ((cleaned.id != null && l.id === cleaned.id) ||
       (cleaned.id == null && l.date === cleaned.date && l.sessionId === cleaned.sessionId))
        ? { ...l, ...cleaned, updatedAt: Date.now() } : l)));
    setEditingLog(null); setEditDraft(null);
  };

  // Nutrition (state/useNutrition.tsx). Placed after everything it reads while rendering and before the first code that reads it.
  const { mealDay, setMealDay, mealTime, setMealTime, activeTarget, setActiveTarget, showCalLog, setShowCalLog, nutriDayType, setNutriDayType, nutritionRaw, setNutrition, nutrition, nP, setNP, nC, setNC, nF, setNF, showAddNutri, setShowAddNutri, nDate, setNDate, addNutrition, nutriCoach, targetLock, lockCals, setLockCals, acceptTarget, effTargets, mealSlot, setMealSlot, mealPlan, hydration, protSeries, calStats } = useNutrition({ bodyMetrics, goalPhase, logs });

  const BODY_TYPES = {
    weight:    { setter:setBodyMetrics, slice:200, dateOnly:false, title:'Edit weigh-in', fields:[['weight','Weight (kg)','num'],['notes','Notes','text']] },
    meas:      { setter:setMeasurements, slice:400, dateOnly:false, title:'Edit measurement', ro:[['site','Site']], fields:[['value','Value (cm)','num']] },
    nutrition: { setter:setNutrition, slice:400, dateOnly:true, title:'Edit nutrition', fields:[['protein','Protein (g)','num'],['carbs','Carbs (g)','num'],['fat','Fat (g)','num']], recompute:(d)=>({...d, calories:Math.round((parseFloat(d.protein)||0)*4+(parseFloat(d.carbs)||0)*4+(parseFloat(d.fat)||0)*9)}) },
    cardio:    { setter:setCardioLog, slice:400, dateOnly:false, title:'Edit cardio', fields:[['modality','Type','text'],['minutes','Minutes','num'],['note','Note','text']] },
    bp:        { setter:setBpLog, slice:400, dateOnly:false, title:'Edit blood pressure', fields:[['sys','Systolic','num'],['dia','Diastolic','num'],['pulse','Pulse','num']] },
    glucose:   { setter:setGlucoseLog, slice:400, dateOnly:false, title:'Edit glucose', fields:[['value','Glucose (mmol/L)','num']] },
    protocol:  { setter:setProtocolLog, slice:500, dateOnly:false, title:'Edit protocol', fields:[['compound','Compound','text'],['dose','Dose','num'],['unit','Unit','text'],['notes','Notes','text']] },
  };
  // Identify by stable id, not array index: a cloud pull / new entry / delete could shift
  // the array while the modal was open, so the saved edit could overwrite a DIFFERENT record.
  const openBodyEdit = (type, index, entry) => {
    const kind = ({weight:'bm', meas:'ms', nutrition:'nu', cardio:'cd', bp:'bp', glucose:'gl', protocol:'pr'})[type] || type;
    const id = entry && entry.id ? entry.id : legacyId(entry || {}, kind);
    setEditBody({ type, id }); setEditBodyDraft({ ...entry, id });
  };
  // Deletion must write a TOMBSTONE, not just remove the row. A plain filter() was
  // invisible to the cloud merge, so the next pull found the record still present in the
  // cloud snapshot with no local counterpart and RESURRECTED it.
  const tombstone = (setter, kind) => (predicate) => setter(prev => tombstoneWhere(prev, kind, predicate));   // see lib/sync.ts
  // ---- Blood panel entry ----
  const bldEmptyRow = () => ({ k: '', v: '', unit: '', ref: '', g: 'Other', flag: 'auto' });
  const startBloodPanel = () => {
    // Pre-fill marker names, units and ranges from the latest panel so entry is just values.
    const latest = (bloodsLog || []).filter(p => p && p.date).slice().sort((a, b) => a.date < b.date ? 1 : -1)[0];
    const rows = latest
      ? (latest.groups || []).flatMap(g => (g.m || []).map(m => ({ k: m.k, v: '', unit: m.unit || '', ref: m.ref || '', g: g.g || 'Other', flag: 'auto' })))
      : [bldEmptyRow(), bldEmptyRow(), bldEmptyRow()];
    setBldForm({ editId: null, date: localToday(), provider: '', note: '', rows, err: '' });
  };
  const editBloodPanel = (panel) => {
    if (!panel) return;
    const lbl = String(panel.label || '');
    const provider = lbl.includes('\u00b7') ? lbl.split('\u00b7').pop().trim() : '';
    const rows = (panel.groups || []).flatMap(g => (g.m || []).map(m => ({
      k: m.k || '', v: m.disp != null ? String(m.disp) : '', unit: m.unit || '', ref: m.ref || '', g: g.g || 'Other',
      // Keep the stored flag only if it differs from what the range would say (a deliberate override).
      flag: (m.flag && m.flag !== bloodAutoFlag(m.disp, m.ref)) ? m.flag : 'auto',
    })));
    setBldForm({ editId: panel.id, date: panel.date, provider, note: panel.note || '', gaps: panel.gaps || null, rows, err: '' });
  };
  const updBldRow = (i, patch) => setBldForm(f => {
    if (!f) return f;
    const rows = f.rows.map((r, j) => {
      if (j !== i) return r;
      const nr = { ...r, ...patch };
      // Typing a known marker name fills in its unit, range and group if they are still blank.
      if (patch.k != null) {
        const known = bloodMarkerIndex[bloodNormKey(patch.k)];
        if (known) { if (!nr.unit) nr.unit = known.unit; if (!nr.ref) nr.ref = known.ref; if (!r.k || nr.g === 'Other') nr.g = known.g; }
      }
      return nr;
    });
    return { ...f, rows, err: '' };
  });
  const addBldRow = () => setBldForm(f => f ? { ...f, rows: [...f.rows, bldEmptyRow()] } : f);
  const delBldRow = (i) => setBldForm(f => f ? { ...f, rows: f.rows.filter((_, j) => j !== i) } : f);
  const cancelBloodPanel = () => {
    const entered = bldForm && bldForm.rows.some(r => String(r.v).trim());
    if (entered && !window.confirm('Discard this panel? The values you entered will be lost.')) return;
    setBldForm(null);
  };
  const saveBloodPanel = () => {
    const f = bldForm; if (!f) return;
    const fail = (err) => setBldForm(x => x ? { ...x, err } : x);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date || '') || isNaN(new Date(f.date + 'T12:00:00') as any)) return fail('Enter a valid draw date.');
    if (f.date > localToday()) return fail('The draw date cannot be in the future.');
    const filled = f.rows.filter(r => String(r.k).trim() && String(r.v).trim());
    if (!filled.length) return fail('Enter at least one marker with a value.');
    const keys = filled.map(r => bloodNormKey(r.k));
    const dupe = keys.find((k, i) => keys.indexOf(k) !== i);
    if (dupe) return fail('A marker appears twice: ' + filled[keys.indexOf(dupe)].k + '. Remove one.');
    const order = (g) => { const i = BLOOD_GROUPS.indexOf(g); return i < 0 ? BLOOD_GROUPS.length : i; };
    const byGroup = {};
    for (const r of filled) {
      const g = r.g || 'Other';
      (byGroup[g] = byGroup[g] || []).push({
        k: String(r.k).trim(), disp: String(r.v).trim(), unit: String(r.unit || '').trim(), ref: String(r.ref || '').trim(),
        flag: r.flag && r.flag !== 'auto' ? r.flag : bloodAutoFlag(r.v, r.ref),
      });
    }
    const groups = Object.keys(byGroup).sort((a, b) => order(a) - order(b)).map(g => ({ g, m: byGroup[g] }));
    const dateLbl = new Date(f.date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    const provider = String(f.provider || '').trim() || 'Manual';
    const now = Date.now();
    const base: any = { date: f.date, label: dateLbl + ' \u00b7 ' + provider, groups, updatedAt: now };
    if (String(f.note || '').trim()) base.note = String(f.note).trim();
    if (f.gaps && f.gaps.length) base.gaps = f.gaps;
    if (f.editId) {
      setBloodsLog(prev => (prev || []).map(p => p && p.id === f.editId ? { ...p, ...base, note: base.note, id: f.editId } : p));
    } else {
      const clash = (bloodsLog || []).find(p => p.date === f.date && String(p.label || '').endsWith(provider));
      if (clash && !window.confirm('A ' + provider + ' panel for this date already exists. Save another one anyway?')) return;
      const id = 'bld_' + f.date.replace(/-/g, '') + '_' + Math.random().toString(36).slice(2, 7);
      setBloodsLog(prev => [{ id, ...base }, ...(prev || [])].sort((a, b) => (a.date || '') < (b.date || '') ? 1 : -1));
    }
    setBldForm(null);
  };
  const deleteBloodPanel = (panel) => {
    if (!panel || !window.confirm('Delete the ' + (panel.label || panel.date) + ' panel? This also removes it from cloud sync.')) return;
    tombstone(setBloodsLog, 'bld')(x => x === panel);
  };

  const saveBodyEdit = () => {
    if(!editBody) return;
    const cfg = BODY_TYPES[editBody.type];
    let d = {...editBodyDraft};
    cfg.fields.forEach(([k,,kind])=>{ if(kind==='num') d[k] = (d[k]===''||d[k]==null)?null:parseFloat(d[k]); });
    if(cfg.recompute) d = cfg.recompute(d);
    // stamp updatedAt so an edit reliably beats an older copy of the same record on merge
    cfg.setter(prev => { const arr = prev.map(e => ((e.id||'') === editBody.id) ? {...e, ...d, id: editBody.id, updatedAt: Date.now()} : e); arr.sort((a,b)=> (a.date<b.date?1:a.date>b.date?-1:0)); return arr.slice(0, cfg.slice); });
    setEditBody(null); setEditBodyDraft(null);
  };

  const addBodyMetric = () => {
    const w=parseNum(newWt);
    if (w==null || w<=0) { alert('Enter a weight.'); return; }
    if (w<30 || w>300) { alert('Weight looks off — enter a value in kg between 30 and 300.'); return; }
    if (wtDate > localToday()) { alert('That date is in the future — pick today or earlier.'); return; }
    // Duplicate same-day guard: raw readings are still allowed (you might weigh morning and
    // post-training), but a second entry for a day that already has one is usually a mistake.
    // OK replaces the existing reading(s) for that day; Cancel keeps both.
    const dayKey = wtDate;
    const existing = bodyMetrics.filter(m => m && typeof m.date==='string' && m.date.slice(0,10)===dayKey && m.weight!=null);
    let replace = false;
    if (existing.length) {
      replace = window.confirm(`A weight for ${dayKey} already exists (${existing[0].weight}kg). OK replaces it with ${w}kg — Cancel keeps both.`);
    }
    const e={date:`${wtDate}T12:00:00.000Z`,weight:w,bodyFat:null,muscle:null,notes:newWtNote};
    setBodyMetrics(prev=>{
      const base = replace ? prev.filter(m => !(m && typeof m.date==='string' && m.date.slice(0,10)===dayKey)) : prev;
      return [{...e, id:newId(), updatedAt: Date.now()},...base].sort((a,b)=>(a.date<b.date?1:a.date>b.date?-1:0)).slice(0,200);
    });
    setNewWt('');setNewWtNote('');setWtDate(localToday());setShowAddBody(false);
  };

  const addCardio = () => {
    if (!cMin) return;
    const entry = { date: `${cDate}T12:00:00.000Z`, modality: cType, minutes: parseFloat(cMin), note: cNote };
    setCardioLog(prev => [{...entry, id:newId(), updatedAt: Date.now()}, ...prev].sort((a,b)=>(a.date<b.date?1:a.date>b.date?-1:0)).slice(0, 400));
    setCMin(''); setCNote(''); setCDate(localToday()); setShowAddCardio(false);
  };

  const addMeasurement = () => {
    const v=parseNum(mVal);
    if (v==null || v<=0) return;   // reject blank/NaN/Infinity/non-positive measurement
    const entry = { date: `${mDate}T12:00:00.000Z`, site: mSite, value: v };
    setMeasurements(prev => [{...entry, id:newId(), updatedAt: Date.now()}, ...prev].sort((a,b)=>(a.date<b.date?1:a.date>b.date?-1:0)).slice(0, 500));
    setMVal(''); setMDate(localToday()); setShowAddMeas(false);
  };

  const addProtocol = () => {
    if (!pDose) return;
    const e={date:`${pDate}T12:00:00.000Z`,compound:pCmp,dose:parseFloat(pDose),unit:pUnit,notes:pNote};
    setProtocolLog(prev=>[{...e, id:newId(), updatedAt: Date.now()},...prev].sort((a,b)=>(a.date<b.date?1:a.date>b.date?-1:0)).slice(0,500));
    setPDose('');setPNote('');setPDate(localToday());setShowAddProt(false);
  };

  // Pull cloud data once on load if a sync code is stored
  useEffect(() => { const c = LS.get('sync_code'); if (c) pullFromCloud(c); }, []);

  // Debounced auto-push whenever training data changes
  // Sync (state/useSync.tsx). Placed after everything it reads while rendering and before the first code that reads it.
  const { storageFail, setStorageFail, syncCode, setSyncCode, syncCodeInput, setSyncCodeInput, cloudStatus, setCloudStatus, cloudErr, setCloudErr, syncTimer, skipPush, syncMounted, exportData, exportSummary, applyBackup, importData, clearAllData, pullFromCloud, syncNow, connectSync, disconnectSync, genSyncCode, storageBreakdown } = useSync({ activeTarget, block, bloodsLog, bloodsLogRaw, bodyMetrics, bodyMetricsRaw, bpLog, bpLogRaw, cardioLog, cardioLogRaw, cfgUpdatedAt, checkins, contextLog, contextLogRaw, deloadSkips, glucoseLog, glucoseLogRaw, goalPhase, highVol, imgOf, logs, measurements, measurementsRaw, nutrition, nutritionRaw, protocolLog, protocolLogRaw, recovery, setActiveTarget, setBlock, setBloodsLog, setBodyMetrics, setBpLog, setCardioLog, setCfgUpdatedAt, setCheckins, setClearConfirm, setContextLog, setDeloadSkips, setGlucoseLog, setGoalPhase, setHighVol, setLogs, setMeasurements, setNutrition, setProtocolLog, setRecovery, setVitalsLog, setWeek, setWhoopData, setWhoopHistory, setWhoopWorkouts, setWipData, touchCfg, view, vitalsLog, vitalsLogRaw, week, whoopHistory, whoopWorkouts, get bodyDash() { return bodyDash; }, get burnCheck() { return burnCheck; }, get bwRate() { return bwRate; }, get deloadRebound() { return deloadRebound; }, get effTargets() { return effTargets; }, get latestBP() { return latestBP; }, get nutriCoach() { return nutriCoach; }, get plateaus() { return plateaus; }, get rirDrift() { return rirDrift; }, get strengthRet() { return strengthRet; } });

  useEffect(() => {
    if (!syncCode) return;
    clearTimeout(syncTimer.current);
    if (!syncMounted.current) { syncMounted.current = true; return; }
    if (skipPush.current) { skipPush.current = false; return; }
    const snapshot = JSON.stringify({ logs, config: { week, recovery, block, highVol, phase: goalPhase, updatedAt: (cfgUpdatedAt || 0), equipment: equipmentForSync() }, activeTarget, bodyMetrics: pruneTombstones(bodyMetricsRaw), protocolLog: pruneTombstones(protocolLogRaw), measurements: pruneTombstones(measurementsRaw), nutrition: pruneTombstones(nutritionRaw), cardioLog: pruneTombstones(cardioLogRaw), bpLog: pruneTombstones(bpLogRaw), glucoseLog: pruneTombstones(glucoseLogRaw), contextLog: pruneTombstones(contextLogRaw), vitalsLog: pruneTombstones(vitalsLogRaw), bloodsLog: pruneTombstones(bloodsLogRaw), whoopHistory, deloadSkips, updatedAt: Date.now() });
    syncTimer.current = setTimeout(async () => {
      setCloudStatus('syncing');
      try {
        const r = await fetch('/.netlify/functions/sync-data', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-sync-code': syncCode }, body: snapshot });
        // fetch() only rejects on network failure; a 4xx/5xx resolves normally, so an
        // unchecked call could report 'synced' when the server actually rejected the data.
        if (!r.ok) { let m=''; try { const j=await r.json(); m=j&&j.error?j.error:''; } catch(_){} setCloudErr(r.status+(m?': '+m:'')); setCloudStatus('error'); return; }
        setCloudErr('');
        setCloudStatus('synced');
      } catch (e) { setCloudStatus('error'); }
    }, 3000);
  }, [logs, bodyMetrics, protocolLog, measurements, nutrition, cardioLog, bpLog, glucoseLog, contextLog, vitalsLog, bloodsLog, whoopHistory, week, recovery, block, highVol, goalPhase, syncCode, deloadSkips, activeTarget]);

  const applySwap = o => {
    const base = SESSIONS[sel]?.exercises[exIdx];
    if (!base) return;
    const subId = 'sub_' + base.id + '_' + o.name.toLowerCase().replace(/[^a-z0-9]+/g, '');
    // The alternative's own prescription (rep range, RIR floor) overrides the base's. setPlan is
    // cleared so the substitute runs straight sets in its own range, not the base's top-set/back-off
    // structure (capsFor guards a null setPlan). Stored in subMap so it persists and applies at every
    // merge site ({...baseEx, ...subMap[id]}): the live target, the logger, and completeSession.
    const rx = { rMin: o.rMin ?? base.rMin, rMax: o.rMax ?? base.rMax, setPlan: null, ...(o.rirMin != null ? { rirMin: o.rirMin } : {}) };
    setSubMap(prev => ({ ...prev, [base.id]: { id: subId, name: o.name, ...rx } }));
    setSetData(prev => { if (prev[base.id]) { const n = { ...prev }; n[subId] = prev[base.id]; delete n[base.id]; return n; } return prev; });
    if (painRef.current[base.id]) { painRef.current[subId] = painRef.current[base.id]; delete painRef.current[base.id]; }
    // Keep React state in step with the ref, or the pain chip visually disappears after a
    // swap while the ref still holds it (displayed state and saved state diverge).
    setPainData(prev => { if (prev && prev[base.id] != null) { const n = { ...prev }; n[subId] = prev[base.id]; delete n[base.id]; return n; } return prev; });
    // The wt/rp inputs were populated from the BASE exercise's target before the swap. Without
    // resetting them, the user would swap RO-T8 press -> machine press and still be shown (and
    // log) the 90kg RO-T8 load. Recompute the target against the SUBSTITUTE's own history.
    const substituted = { ...base, id: subId, name: o.name, ...rx };
    const existing = setData[base.id] || setData[subId] || [];
    const st = getTarget(substituted, logs, week, effPhase, subId);
    if (!existing.length) {
      setWt(st.weight || 0);
      setRp(st.reps || substituted.rMin);
      setRir(rirDefaultFor(substituted, effWR(week).rirN));
    }
    setShowSwap(false);
  };

  const phase=getPhase(week);
  const scheduledDeload=DLW.has(week);
  const deloadActive=scheduledDeload && !deloadSkips[block+'-'+week];
  setDeloadNow(deloadActive);
  // wr MUST be resolved after _deloadNow is written: effWR falls back to the module flag,
  // and reading it before assignment would return the deload prescription on first render.
  const wr=effWR(week, deloadActive);
  const showInt=wr.i, isDeload=deloadActive;
  const bannerName=(scheduledDeload && !deloadActive) ? 'Training Through' : phase.name;
  const bannerColor=(scheduledDeload && !deloadActive) ? 'normal' : phase.color;
  const today=new Date().toDateString();
  const doneToday=new Set(logs.filter(l=>new Date(l.date).toDateString()===today).map(l=>l.sessionId));
  const weekDone=new Set(logs.filter(l=>l.week===week && (l.block||1)===block).map(l=>l.sessionId));
  const allDone=weekDone.size>=4;
  const deloadInfo=computeDeloadReadiness(whoopHistory,week);
  const ctxReasons=useMemo(()=>recentCtx(contextLog),[contextLog]);
  const readiness=computeReadiness(recovery, whoopData, deloadInfo, logs, week, whoopHistory, bpLog[0]||null, deloadActive, ctxReasons);
  // POLICY: readiness is advisory only. It must never change sets, reps, RIR, load or phase —
  // it only informs the banner. High-volume is the athlete's explicit toggle (still paused on a
  // cut by design and on deloads inside getEffSets); phase is whatever the athlete selected.
  // Cut progression is handled on performance inside getProgRec, not by a readiness flip.
  const hvActive = highVol && goalPhase !== 'cut';
  const effPhase = goalPhase;
  const volParts = useMemo(() => {
    const dir={}, carry={};
    for (const k of Object.keys(SESSIONS)) for (const e of SESSIONS[k].exercises) {
      const m=EX_MUSCLE[e.id]; if(!m) continue;
      const s=getEffSets(e, week, hvActive);
      dir[m.p]=(dir[m.p]||0)+s;
      if(m.s){ (Array.isArray(m.s)?m.s:[m.s]).forEach(sm=>carry[sm]=(carry[sm]||0)+s*0.5); }
    }
    return {dir, carry};
  }, [week, hvActive, deloadActive]);
  const plannedVol = useMemo(() => {
    const v={...volParts.dir};
    for(const m in volParts.carry) v[m]=(v[m]||0)+volParts.carry[m];
    return v;
  }, [volParts]);
  const CHEAP_MUS = new Set(['sideDelt','rearDelt','biceps','triceps','calves','abs','obliques']);
  const bpGate = (() => { const b=bpLog && bpLog[0]; if(!b) return false; const fresh=(Date.now()-new Date(b.date).getTime())/86400000 <= 1.0; return fresh && bpCategory(b.sys, b.dia).cls === 'red'; })();
  const autoReg = useMemo(() => {
    const muscleEx = {};
    for (const id in EX_MUSCLE) { const p = EX_MUSCLE[id].p; (muscleEx[p] = muscleEx[p] || []).push(id); }
    const top = ss => (ss && ss.length) ? Math.max(...ss.map(s => e1rmSet(s.weight||0, s))) : 0;
    const out = {};
    for (const mus in MUSCLES) {
      let score = 0, dataN = 0;
      for (const id of (muscleEx[mus] || [])) {
        const h = getPrevHist(id, logs, 3);
        if (h.length < 2) continue;
        const cur = top(h[0].sets);
        // 3-session trend: compare most recent vs the average of the prior 1-2 sessions,
        // so a single anomalous session can't flip progressing/stalled. Falls back to 2 when only 2 exist.
        const priors = h.slice(1).map(s => top(s.sets)).filter(v => v > 0);
        if (!priors.length) continue;
        const base = priors.reduce((a, b) => a + b, 0) / priors.length;
        if (!base) continue;
        dataN++;
        const d = (cur - base) / base;
        score += d > 0.01 ? 1 : d < -0.01 ? -1 : 0;
      }
      const cheap = CHEAP_MUS.has(mus);
      // below-target check: direct sets under the muscle's landmark midpoint
      const md = MUSCLES[mus];
      const dirSets = (volParts && volParts.dir && volParts.dir[mus]) || 0;
      const belowTarget = md ? dirSets < (md.min + (md.max - md.min) * 0.4) : false;
      let label, cls;
      if (dataN === 0) { label = 'Log 2+ sessions'; cls = 'nd'; }
      else if (bpGate) { label = 'BP high - hold'; cls = 'back'; }
      else if (score < 0) { label = 'Back off / cut'; cls = 'back'; }
      else if (readiness.cls === 'red') { label = 'Hold today (red)'; cls = 'hold'; }
      else if (score > 0) { label = 'Progressing - hold'; cls = 'hold'; }
      // score === 0 (stalled) below: dose may be insufficient
      else if (readiness.cls !== 'green') { label = 'Hold - recover first'; cls = 'hold'; }
      else if (cheap && belowTarget) { label = 'Stalled - add 1 set'; cls = 'add'; }
      else if (!cheap && belowTarget) { label = 'Stalled - add load/1 set'; cls = 'load'; }
      else { label = 'Hold - at target'; cls = 'hold'; }
      out[mus] = { label, cls };
    }
    return out;
  }, [logs, volParts, bpGate, readiness]);
  // WEIGHT TREND — week-average comparison.
  //
  // Method choice matters more than the maths here. Daily weight carries roughly +/-1kg of
  // water noise, while the signal being detected is ~0.5%/wk (about 0.45kg). The signal is
  // therefore SMALLER than single-day noise, so any method resting on individual readings
  // (endpoint-to-endpoint especially) reports mostly noise.
  //
  // Averaging a week of weigh-ins cuts that noise by roughly sqrt(n). Comparing two adjacent
  // 7-day blocks is also structurally immune to the turning-point failure that broke the old
  // 21-day Theil-Sen fit: a rise-then-fall inside one window cancels to ~0 in a regression,
  // but cannot cancel between two separate blocks. This is the standard evidence-based
  // coaching approach, and it agrees closely with EWMA on real data.
  const bwRate = (() => {
    if (!bodyMetrics || bodyMetrics.length < 2) return null;
    const dayMs = 86400000, nowTs = Date.now();
    const daily = dailyMedianWeights(bodyMetrics);
    const aged = daily
      .map(m => ({ age: (nowTs - new Date(m.date).getTime()) / dayMs, w: m.weight }))
      .filter(m => m.age >= 0 && m.age <= 28);
    if (!aged.length) return null;
    const block = (lo, hi) => {
      const xs = aged.filter(m => m.age >= lo && m.age < hi).map(m => m.w);
      return xs.length ? { avg: +(xs.reduce((a,b)=>a+b,0)/xs.length).toFixed(2), n: xs.length } : null;
    };
    const w0 = block(0,7), w1 = block(7,14), w2 = block(14,21), w3 = block(21,28);
    if (!w0 || !w1) return null;
    // A block needs >=3 weigh-ins before its average is meaningful; below that a single
    // water-heavy day dominates and the comparison is no better than an endpoint read.
    if (w0.n < 3 || w1.n < 3) return null;
    const weekOverWeek = +(w0.avg - w1.avg).toFixed(2);

    // HEADLINE = regression across ALL available weekly averages, not just the last two.
    // Week-over-week alone breaks when a water event lands inside one of the two blocks: a
    // spike week followed by a normal week manufactures a huge apparent "loss" that is only
    // water leaving. Fitting a line through three or four weekly averages lets one anomalous
    // week be outvoted instead of driving the entire number.
    const blocks = [w0, w1, w2, w3];
    const fit = [];
    for (let i = 0; i < blocks.length; i++) if (blocks[i] && blocks[i].n >= 3) fit.push({ x: -i, y: blocks[i].avg });
    let perWeek = weekOverWeek;
    if (fit.length >= 3) {
      const n = fit.length;
      const mx = fit.reduce((a,p)=>a+p.x,0)/n, my = fit.reduce((a,p)=>a+p.y,0)/n;
      let num = 0, den = 0;
      for (const p of fit) { num += (p.x-mx)*(p.y-my); den += (p.x-mx)*(p.x-mx); }
      if (den > 0) perWeek = +(num/den).toFixed(2);
    }
    // Surface when the last two weeks disagree sharply with the multi-week fit — that gap is
    // the signature of a water swing, and the user should see it rather than trust either alone.
    const waterFlag = fit.length >= 3 && Math.abs(weekOverWeek - perWeek) > 0.6;
    const newestW = bodyMetrics[0].weight;

    // EWMA (Hacker's Diet / TrendWeight): a smooth daily-updating line as a cross-check.
    // Two independent robust methods agreeing is a far stronger signal than either alone.
    let ewma = null, ewmaRate = null;
    const chron = daily
      .map(m => ({ t: new Date(m.date).getTime(), w: m.weight }))
      .sort((a,b) => a.t - b.t);
    if (chron.length >= 4) {
      let e = chron[0].w; const line = [];
      for (const p of chron) { e = e + 0.25 * (p.w - e); line.push({ t: p.t, e }); }
      ewma = +line[line.length-1].e.toFixed(2);
      const cutoff = nowTs - 7*dayMs;
      const past = line.filter(p => p.t <= cutoff);
      if (past.length) ewmaRate = +(ewma - past[past.length-1].e).toFixed(2);
    }
    // Flag when the two methods disagree materially — usually a water event sitting inside
    // one block, which no algorithm can fully correct for. Better to surface it than hide it.
    const disagree = ewmaRate != null && Math.abs(ewmaRate - perWeek) > 0.5;

    return {
      perWeek, pctWeek: perWeek/newestW*100,
      weekOverWeek, weeksUsed: fit.length, waterFlag,
      thisWeek: w0, lastWeek: w1,
      prior: [w1, w2, w3].map(b => b ? b.avg : null),
      ewma, ewmaRate, disagree
    };
  })();
  const sess=sel?SESSIONS[sel]:null;
  const baseEx=sess?sess.exercises[exIdx]:null;
  const curEx=baseEx?(subMap[baseEx.id]?{...baseEx,...subMap[baseEx.id]}:baseEx):null;
  const effSets=curEx?getEffSets(curEx,week,hvActive):0;
  const _curHistId = (curEx && baseEx && subMap[baseEx.id]) ? subMap[baseEx.id].id : (curEx?curEx.id:null);
  const loggedSetsArr=curEx?(setData[_curHistId]||setData[curEx.id]||[]):[];
  const prevHist=curEx?getPrevHist(_curHistId,logs,3):[];
  const progRec=curEx?getProgRec(_curHistId,curEx,logs,effPhase):null;
  const curTarget=curEx?getTarget(curEx,logs,week,effPhase,_curHistId):null;
  // Resolve which phase of the set plan the CURRENT set belongs to, so the live screen shows
  // "Set 2 of 4 - Back-off, 8-10 reps, ~180kg" instead of a generic 6-10 envelope and one load.
  const curSetPhase = (() => {
    if (!curEx || !curEx.setPlan) return null;
    const idx = (loggedSetsArr ? loggedSetsArr.length : 0);   // 0-based index of the set about to be done
    let n = 0;
    for (const sp of curEx.setPlan) {
      if (idx < n + sp.sets) return { ...sp, from: n + 1, to: n + sp.sets };
      n += sp.sets;
    }
    const last = curEx.setPlan[curEx.setPlan.length - 1];
    return { ...last, from: n - last.sets + 1, to: n };
  })();
  const curSetWeight = (() => {
    if (!curSetPhase || !curTarget || !curTarget.weight) return null;
    return Math.round(curTarget.weight * curSetPhase.pct / 2.5) * 2.5;
  })();
  // Intensifier capture eligibility for the live logger. Week-gated (showInt) + user-selected
  // (activeInts, keyed by base id) + typed kind + FINAL slot. Never touches readiness.
  const intKind = (curEx && curEx.int && curEx.int.kind) ? curEx.int.kind : null;
  const intTargetSlot = editIdx !== null ? editIdx : loggedSetsArr.length;
  // A swap stores only {id,name}, so curEx keeps the BASE exercise's int object. Exclude
  // substituted lifts — the base's partials/myo method may be wrong for a different movement.
  const intEligible = !!(showInt && baseEx && !subMap[baseEx.id] && activeInts.has(baseEx.id) && intKind && intTargetSlot === effSets-1 && !DLW.has(week));
  const R=88, CIRC=2*Math.PI*R;
  const dashOff=CIRC*(1-(timerTotal>0?timerSecs/timerTotal:0));
  const totalSets=(Object.values(setData) as any[]).reduce((a,s)=>a+s.length,0);
  const dur=startRef.current?Math.round((Date.now()-startRef.current)/60000):0;
  // bwAt must be declared BEFORE ormHL: ormHL's e1 passes bwAt into totalLoad during render, and a
  // const referenced before its declaration throws a TDZ ReferenceError. ormHL only reduces once a
  // set is logged, which is why the crash surfaced after logging set 1, not on first paint.
  const bwAt=useMemo(()=>makeBwResolver(bodyMetrics),[bodyMetrics]);
  // Sets for a swapped exercise are stored under the substitute id, so the base id finds
  // nothing and the e1RM highlight silently vanishes for substituted compounds.
  const ormHL=sess?sess.exercises.filter(ex=>ex.orm).map(ex=>{
    const mapped=subMap[ex.id]; const eid=mapped?mapped.id:ex.id;
    const sets=setData[eid]||[]; if(!sets.length)return null;
    // BW-loaded lifts (weighted pull-up) must score on TOTAL load — added weight + bodyweight —
    // to match stalls / retention / recovery-perf, which all use totalLoad. eid is the effective
    // movement: a swap to a non-bodyweight lift is not in BW_LOADED, so it scores on raw load.
    const _today = new Date().toISOString();
    const e1 = (s) => e1rmSet(totalLoad(eid, s.weight, bwAt, _today), s);
    const best=sets.reduce((a,s)=> e1(s) > e1(a) ? s : a, sets[0]);
    return {name:(mapped&&mapped.name)||ex.name, orm:e1(best)};
  }).filter(Boolean):[];
  const progHist=progEx?getPrevHist(progEx,logs,20):[];
  const _metricVal=(sets, dateStr)=>{ if(!sets||!sets.length) return 0; if(progMetric==='weight') return Math.max(...sets.map(s=>s.weight||0)); if(progMetric==='volume') return sets.reduce((a,s)=>a+(s.weight||0)*(s.reps||0),0); return Math.max(...sets.map(s=>e1rmSet(totalLoad(progEx, s.weight, bwAt, dateStr), s))); };
  const progChartData=progHist.slice().reverse().map(h=>({x:fmtShort(h.date),y:Math.round(_metricVal(h.sets, h.date)),t:new Date(h.date).getTime()}));
  const prWeight=progChartData.length?Math.max(...progChartData.map(d=>d.y)):0;
  const lastWeight=progChartData.length?progChartData[progChartData.length-1].y:0;
  // 6.7 (additive, read-only): lifetime best e1RM per MOVEMENT, aggregated across every slot the
  // movement appears in (grouped by name). This is the cross-slot PR view the audit wanted, built
  // WITHOUT touching getProgRec/getPrevHist — the progression engine stays slot-keyed exactly as
  // before, so nothing here can affect prescribed loads. Deload sessions excluded from PRs.
  const movementPRs = useMemo(() => {
    try {
      const byName: Record<string, any> = {};
      for (const l of (logs||[])) {
        // isDeloadLog is local to computeDeloadRebound and not in scope here. Calling it threw
        // inside this try/catch, so the Lifetime movement PRs card silently never rendered.
        if (l.deload === true || (l.deload == null && DLW.has(l.week))) continue;
        for (const ex of (l.exercises||[])) {
          if (!ex || !Array.isArray(ex.sets) || !ex.sets.length) continue;
          const pid = ex.origId || ex.id;
          let best = 0;
          for (const s of ex.sets) { if (!s || !(s.reps > 0)) continue; const e = e1rmSet(totalLoad(pid, s.weight, bwAt, l.date), s); if (e > best) best = e; }
          if (best <= 0) continue;
          const key = ex.name || pid;
          const rec = byName[key] || { name: key, bestE1RM: 0, sessions: 0, lastDate: null };
          rec.sessions++;
          if (!rec.lastDate || l.date > rec.lastDate) rec.lastDate = l.date;
          if (best > rec.bestE1RM) rec.bestE1RM = best;
          byName[key] = rec;
        }
      }
      return Object.values(byName).map(r => ({ ...r, bestE1RM: Math.round(r.bestE1RM) })).sort((a,b) => (b.sessions - a.sessions) || (b.bestE1RM - a.bestE1RM));
    } catch (e) { try { console.error('movementPRs failed', e); } catch(_) {} return []; }
  }, [logs, bwAt]);
  const _metricLbl=progMetric==='e1rm'?'Estimated 1RM per session (kg)':progMetric==='weight'?'Top-set weight per session (kg)':'Session volume (weight × reps)';
  const _prLbl=progMetric==='e1rm'?'Best e1RM':progMetric==='weight'?'PR Weight':'Best Volume';
  const _unit=progMetric==='volume'?'':'kg';
  const curVol=weekMuscleVolume(logs,week,block);
  const volSeries=weeklyVolumeSeries(logs,volMuscle,block);
  const strengthRet=useMemo(()=>computeStrengthRetention(logs, bwAt),[logs, bwAt]);
  const deloadRebound=useMemo(()=>computeDeloadRebound(logs, bwAt),[logs, bwAt]);
  const rirDrift=useMemo(()=>computeRirDrift(logs,block),[logs,block]);
  const actualVol=useMemo(()=>computeActualVolume(logs,block),[logs,block]);
  // Resolves the nearest logged bodyweight to a session date, so weighted pull-ups are
  // scored on total load rather than added load alone.
  // Chart annotations assembled from data the app already records: alcohol days, illness /
  // travel / bad nights, and deload weeks. Deloads render as a shaded span, one-off events
  // as a dashed marker. Capped so a busy period cannot bury the chart it is annotating.
  const chartEvents = useMemo(() => {
    const evs = [];
    for (const c of (contextLog||[])) {
      if (!c || !c.date) continue;
      const t = new Date(c.date).getTime();
      if (isNaN(t)) continue;
      if (c.units > 0) evs.push({ t, label:'\u{1F377}', color:'#a479e2' });
      const tags = Array.isArray(c.tags) ? c.tags : [];
      if (tags.includes('illness'))   evs.push({ t, label:'ill',   color:'#ff6b6b' });
      if (tags.includes('travel'))    evs.push({ t, label:'trip',  color:'#b8c2cf' });
      if (tags.includes('poorsleep')) evs.push({ t, label:'sleep', color:'#ffb020' });
    }
    // Deload weeks, taken from logged sessions so a trained-through week is not shaded.
    const dl = (logs||[]).filter(l => l && l.deload === true).map(l => new Date(l.date).getTime())
      .filter(t => !isNaN(t)).sort((a,b) => a-b);
    const dayMs = 86400000;
    let i = 0;
    while (i < dl.length) {
      let j = i;
      while (j+1 < dl.length && dl[j+1] - dl[j] <= 4*dayMs) j++;
      evs.push({ t: dl[i] - dayMs, tEnd: dl[j] + dayMs, color:'#ffb020' });
      i = j + 1;
    }
    return evs.slice(0, 40);
  }, [contextLog, logs]);

  const stalls=useMemo(()=>computeStalls(logs, 3, bwAt, effPhase),[logs,bwAt, effPhase]);
  // Single source of truth for stalls. The Program card previously used its own detector
  // (detectPlateaus) with different rules — deloads included, ORM-only, 4-session minimum —
  // which could contradict the Progress card about the same lift. Both now read computeStalls.
  const plateaus = useMemo(() => {
    if (!stalls) return [];
    return stalls.stalled
      .filter(s => s.sessionsSincePeak >= 3)
      .map(s => ({ name:s.name, sessions:s.sessionsSincePeak, lastE1rm:s.lastE1rm, peakE1rm:s.peakE1rm }))
      .sort((a,b) => b.sessions - a.sessions);
  }, [stalls]);
  const durations=useMemo(()=>computeDurations(logs),[logs]);
  const painTrend=useMemo(()=>computePainTrend(logs),[logs]);
  const trainLoad=useMemo(()=>computeTrainingLoad(logs),[logs]);
  const timeOfDay=useMemo(()=>computeTimeOfDay(logs,bwAt),[logs,bwAt]);
  const alcoholImpact=useMemo(()=>computeAlcoholImpact(logs,contextLog,bwAt),[logs,contextLog,bwAt]);
  const recPerf=useMemo(()=>computeRecoveryPerformance(logs,whoopHistory,bwAt),[logs,whoopHistory,bwAt]);
  const burnCheck=useMemo(()=>computeBurnCheck(whoopHistory, nutriCoach.ok?nutriCoach.tdee:null),[whoopHistory,nutriCoach]);
  const latestBySite={}; measurements.forEach(m=>{ if(!(m.site in latestBySite)) latestBySite[m.site]=m; });
  const bodyDash = useMemo(() => {
    // 7-day weight average (bodyMetrics sorted desc)
    const now = Date.now();
    // Reject future-dated entries, and do NOT fall back to an arbitrarily old reading:
    // a 3-month-old weight was previously surfaced under the name "7-day average".
    const last7 = bodyMetrics.filter(m => { const age=(now - new Date(m.date).getTime())/86400000; return age>=0 && age<=7 && m.weight!=null; });
    const avg7 = last7.length ? last7.reduce((a,m)=>a+m.weight,0)/last7.length : null;
    const curW = bodyMetrics[0]?.weight ?? null;
    // lean mass: prefer logged muscle, else weight*(1-bf/100)
    const leanOf = (m) => (m.muscle!=null && (!m.weight || m.muscle >= m.weight*0.4)) ? m.muscle : (m.bodyFat!=null && m.weight!=null ? +(m.weight*(1-m.bodyFat/100)).toFixed(1) : null);
    const leanSeries = bodyMetrics.filter(m=>leanOf(m)!=null).slice(0,20).reverse().map(m=>({x:fmtShort(m.date),y:leanOf(m),t:new Date(m.date).getTime()}));
    const curLean = bodyMetrics.length ? leanOf(bodyMetrics[0]) : null;
    const leanChange = leanSeries.length>=2 ? +(leanSeries[leanSeries.length-1].y - leanSeries[0].y).toFixed(1) : null;
    const _wtWin = bodyMetrics.slice(0,14).reverse();
    const wtSpark = _wtWin.map(m=>m.weight);
    const wtSparkFrom = _wtWin.length ? _wtWin[0].date : null;
    const wtSparkTo = _wtWin.length ? _wtWin[_wtWin.length-1].date : null;
    // per-site: latest value, change vs oldest-in-window, sparkline
    const perSite = {};
    Object.keys(latestBySite).forEach(site => {
      const rows = measurements.filter(m=>m.site===site).slice(0,12); // newest-first
      const latest = rows[0]?.value ?? null;
      const oldest = rows[rows.length-1]?.value ?? null;
      const change = (latest!=null && oldest!=null && rows.length>=2) ? +(latest-oldest).toFixed(1) : null;
      perSite[site] = { latest, change, spark: rows.slice().reverse().map(r=>r.value), n: rows.length };
    });
    return { avg7, curW, curLean, leanChange, leanSeries, wtSpark, wtSparkFrom, wtSparkTo, perSite };
  }, [bodyMetrics, measurements]);
  const KEY_SITES = ['Waist','Chest','Left Thigh','Right Thigh'];
  const measSeries=useMemo(()=>measurements.filter(m=>m.site===mViewSite).slice(0,20).reverse().map(m=>({x:fmtShort(m.date),y:m.value,t:new Date(m.date).getTime()})),[measurements,mViewSite]);
  const recFuelRows = useMemo(() => {
    const nutByDate={}; nutrition.forEach(n=>{ const d=(n.date||'').slice(0,10); if(d) nutByDate[d]=n; });
    return whoopHistory.slice(-14).map(h=>{
      const d=(h.date||'').slice(0,10); const n=nutByDate[d];
      return { date:d, recovery:h.recovery??null, kcal:n?n.calories:null, carbs:n?n.carbs:null, sleepH:h.sleepHrs??null };
    });
  }, [nutrition, whoopHistory]);
  const recFuelReady=recFuelRows.filter(r=>r.recovery!=null&&r.kcal!=null).length>=3;
  // True 7-CALENDAR-DAY window: dedupe by date, reject future dates. Previously this was
  // 'the last 7 records', which could silently span 3 weeks and was still labelled a 7-day avg.
  const avg7=(k)=>{
    const now=Date.now(); const by: Record<string, any>={};
    (nutrition||[]).forEach(n=>{ const d=(n.date||'').slice(0,10); if(!d) return; const a=(now-new Date(d+'T12:00:00').getTime())/86400000; if(a>=0&&a<=7&&!(d in by)) by[d]=n; });
    const rows=Object.values(by); if(!rows.length) return null;
    return Math.round(rows.reduce((a,n)=>a+(n[k]||0),0)/rows.length);
  };
  // calIn/calOut/calNet removed: they compared today's logged intake against the WHOOP
  // in-progress cycle burn (a morning snapshot, systematically ~700 kcal low). Every
  // consumer now uses the empirical maintenance from nutriCoach instead.
  // 7-day rolling energy balance: avg intake vs avg WHOOP burn (far less noisy than a single day)
  // eb7 (WHOOP dayCal energy balance) removed: whoopHistory.dayCal stores whatever the
  // in-progress burn was at last sync (usually a morning snapshot ~1,500), not final daily
  // expenditure, so the "avg out" it produced was systematically wrong. The energy-balance
  // card now uses the empirical maintenance from nutriCoach — the single source of truth.
  const cardioWeekStart=(()=>{ const d=new Date(); const day=(d.getDay()+6)%7; d.setHours(0,0,0,0); d.setDate(d.getDate()-day); return d.getTime(); })();
  const cardioThisWeek=cardioLog.filter(c=>new Date(c.date).getTime()>=cardioWeekStart);
  const cardioMinsManual=cardioThisWeek.reduce((a,c)=>a+(c.minutes||0),0);
  const cardioSessionsManual=cardioThisWeek.length;
  // WHOOP workouts already carry zone durations. Count zone 2+3 minutes as zone-2 cardio, but
  // skip anything that overlaps a logged lifting session — otherwise a weights session with a
  // high-HR stretch would be double-counted as cardio it never was.
  const whoopCardio = useMemo(()=>{
    const wos = (whoopWorkouts||[]).filter(w => {
      const t = new Date(w.start).getTime();
      if (isNaN(t) || t < cardioWeekStart) return false;
      if (w.z2Min == null || w.z2Min < 10) return false;      // <10 min isn't a session
      const clash = (logs||[]).some(l => {
        const le = new Date(l.date).getTime();
        const ls = le - (l.duration||60)*60000;
        const ws = t, we = new Date(w.end||w.start).getTime();
        return Math.min(le,we) - Math.max(ls,ws) > 5*60000;
      });
      return !clash;
    });
    return { sessions: wos.length, mins: wos.reduce((a,w)=>a+(w.z2Min||0),0), list: wos };
  },[whoopWorkouts, logs, cardioWeekStart]);
  const cardioMins = cardioMinsManual + whoopCardio.mins;
  const cardioSessions = cardioSessionsManual + whoopCardio.sessions;
  // 8-week cardio trend. On an enhanced protocol with haematocrit and BP to watch, aerobic work
  // is the counterweight to the lifting — but the app only ever showed "this week", so drift was
  // invisible. True Z2 and Z3 are kept SEPARATE here (the headline z2Min conflates them, which
  // overstates real zone-2 time). Guideline reference: 150 min/wk moderate aerobic activity.
  const cardioTrend = useMemo(() => {
    const wkStart = (d) => { const x=new Date(d); const day=(x.getDay()+6)%7; x.setHours(0,0,0,0); x.setDate(x.getDate()-day); return x.getTime(); };
    const weeks = [];
    for (let i = 7; i >= 0; i--) { const t = cardioWeekStart - i*7*86400000; weeks.push({ t, manual:0, z2:0, z3:0, sessions:0 }); }
    const idx = (t) => weeks.findIndex(w => w.t === wkStart(t));
    for (const c of (cardioLog||[])) {
      const i = idx(new Date(c.date).getTime()); if (i < 0) continue;
      weeks[i].manual += (c.minutes||0); weeks[i].sessions += 1;
    }
    for (const w of (whoopWorkouts||[])) {
      const t = new Date(w.start).getTime(); const i = idx(t); if (i < 0) continue;
      const clash = (logs||[]).some(l => { const le=new Date(l.date).getTime(); const ls=le-(l.duration||60)*60000;
        const ws=t, we=new Date(w.end||w.start).getTime(); return Math.min(le,we)-Math.max(ls,ws) > 5*60000; });
      if (clash) continue;
      const zm = w.zoneMin || null;
      if (zm) { weeks[i].z2 += (zm.z2||0); weeks[i].z3 += (zm.z3||0); if ((zm.z2||0)+(zm.z3||0) >= 10) weeks[i].sessions += 1; }
      else if (w.z2Min != null && w.z2Min >= 10) { weeks[i].z2 += w.z2Min; weeks[i].sessions += 1; }
    }
    const rows = weeks.map(w => ({ ...w, total: w.manual + w.z2 + w.z3 }));
    const done = rows.slice(0, 7);                                   // exclude the in-progress week
    const avg = done.length ? Math.round(done.reduce((a,r)=>a+r.total,0)/done.length) : 0;
    return { rows, avg, target: 150, cur: rows[rows.length-1] };
  }, [cardioLog, whoopWorkouts, logs, cardioWeekStart]);
  // Active vs wall-clock duration across recent sessions (rest is now measured, not assumed).
  const durSplit = useMemo(() => {
    const withRest = (logs||[]).filter(l => l.restMin != null && l.duration).slice(0, 10);
    if (!withRest.length) return null;
    const wall = Math.round(withRest.reduce((a,l)=>a+l.duration,0)/withRest.length);
    const rest = Math.round(withRest.reduce((a,l)=>a+l.restMin,0)/withRest.length);
    return { n: withRest.length, wall, rest, active: Math.max(0, wall-rest) };
  }, [logs]);
  const latestBP=bpLog[0]||null;
  const bpSeries=useMemo(()=>bpLog.slice(0,21).reverse().map(b=>({x:fmtShort(b.date),y:b.sys,t:new Date(b.date).getTime()})),[bpLog]);
  const latestGl=glucoseLog[0]||null;
  const glSeries=useMemo(()=>glucoseLog.slice(0,21).reverse().map(g=>({x:fmtShort(g.date),y:g.value,t:new Date(g.date).getTime()})),[glucoseLog]);
  // --- Health-log headline stats (latest, 7-reading avg, in-range %) ---
  const bpStats = useMemo(() => {
    const l7 = bpLog.slice(0,7); if (!l7.length) return null;
    const avgSys = Math.round(l7.reduce((a,b)=>a+b.sys,0)/l7.length);
    const avgDia = Math.round(l7.reduce((a,b)=>a+b.dia,0)/l7.length);
    const inRange = Math.round(100*l7.filter(b=>bpCategory(b.sys,b.dia).cls==='green').length/l7.length);
    return { avgSys, avgDia, inRange, n:l7.length };
  }, [bpLog]);
  const glStats = useMemo(() => {
    const l7 = glucoseLog.slice(0,7); if (!l7.length) return null;
    const avg = +(l7.reduce((a,g)=>a+g.value,0)/l7.length).toFixed(1);
    const inRange = Math.round(100*l7.filter(g=>glucoseCategory(g.value).cls==='green').length/l7.length);
    return { avg, inRange, n:l7.length };
  }, [glucoseLog]);

  // Week in review: assembles the analytics that already exist into one decision-shaped summary.
  // Deliberately no composite score — each line carries its own verdict so the inputs stay visible.
  const weekReview = useMemo(() => {
    const dayMs=86400000, now=Date.now();
    const wk = (logs||[]).filter(l => { const t=new Date(l.date).getTime(); return !isNaN(t) && (now-t)/dayMs <= 7; });
    const items = [];

    // Sessions — count DISTINCT planned sessions actually PERFORMED, not raw log rows and not
    // empty logs. Two logs of the same session (a repeat, or an import duplicate) previously both
    // counted toward the 4/week target, and a log finished with nothing entered counted as a full
    // session. Now only sessions carrying real work, deduped by sessionId, count.
    const target = 4;
    const wkPerf = wk.filter(sessionPerformed);
    const distinct = new Set(wkPerf.map(l => l.sessionId).filter(Boolean)).size;
    const repeats = wkPerf.length - distinct;
    items.push({ k:'Sessions', v:`${distinct} / ${target}`,
      verdict: distinct>=target ? 'good' : distinct>=target-1 ? 'ok' : 'miss',
      note: distinct>=target ? (repeats>0 ? `full week (+${repeats} repeat${repeats>1?'s':''})` : 'full week') : `${target-distinct} short` });

    // Volume: muscles under floor, from what was actually LOGGED
    if (actualVol && actualVol.completedWeeks > 0) {
      const under = Object.entries(MUSCLES)
        .filter(([k,m]) => !m.optional && (actualVol.avg[k]||0) < m.min)
        .map(([k,m]) => m.name);
      items.push({ k:'Volume', v: under.length ? `${under.length} under floor` : 'all in range',
        verdict: under.length===0 ? 'good' : under.length<=2 ? 'ok' : 'miss',
        note: under.length ? under.slice(0,3).join(', ') : 'every muscle at or above minimum' });
    }

    // Nutrition adherence
    if (calStats) {
      const d = calStats.calDelta, ad = Math.abs(d);
      items.push({ k:'Calories', v:`${calStats.avgCal} avg`,
        verdict: ad<=100 ? 'good' : ad<=250 ? 'ok' : 'miss',
        note: `${d>0?'+':''}${d} vs ${calStats.calTgt} target` });
      items.push({ k:'Protein', v:`${calStats.avgP}g avg`,
        verdict: calStats.pDelta>=-10 ? 'good' : calStats.pDelta>=-25 ? 'ok' : 'miss',
        note: `${calStats.pDelta>0?'+':''}${calStats.pDelta} vs ${calStats.pTgt}g` });
    }

    // Weight direction AND rate, judged against the goal phase, in % bodyweight/week so the
    // bands are body-size-independent. Crucially there is now a CEILING as well as a floor:
    // the old logic called any cut rate past -0.15 kg/wk "good", so it could show a green verdict
    // next to a "dropping fast — ease off" note. Too fast is a miss, not a win.
    if (bwRate) {
      const r = bwRate.perWeek;                    // kg/wk, for display
      const p = (bwRate.pctWeek != null) ? bwRate.pctWeek : 0;  // % bodyweight / wk, drives verdict
      let verdict, trendNote;
      if (goalPhase==='cut') {
        // retention-friendly loss is ~0.3-1.0% BW/wk; faster risks muscle, slower stalls fat loss
        if (p < -1.0)       { verdict='miss'; trendNote='dropping fast — ease off to protect muscle'; }
        else if (p <= -0.3) { verdict='good'; trendNote='losing at a retention-friendly rate'; }
        else if (p <  0.15) { verdict='ok';   trendNote='barely moving — tighten intake'; }
        else                { verdict='miss'; trendNote='gaining on a cut'; }
      } else if (goalPhase==='bulk') {
        // lean gain is ~0.1-0.5% BW/wk; faster is mostly fat
        if (p >  0.5)       { verdict='miss'; trendNote='gaining fast — trim the surplus'; }
        else if (p >= 0.1)  { verdict='good'; trendNote='lean-gaining rate'; }
        else if (p > -0.1)  { verdict='ok';   trendNote='flat — add a little intake'; }
        else                { verdict='miss'; trendNote='losing on a bulk'; }
      } else {
        if (Math.abs(p) < 0.2)       { verdict='good'; trendNote='holding maintenance'; }
        else if (Math.abs(p) < 0.4)  { verdict='ok';   trendNote='drifting — nudge intake'; }
        else                         { verdict='miss'; trendNote=(p>0?'gaining':'losing')+' faster than maintenance'; }
      }
      items.push({ k:'Weight', v:`${r>0?'+':''}${r.toFixed(2)} kg/wk (${p>0?'+':''}${p.toFixed(2)}%)`,
        verdict,
        note: bwRate.disagree ? trendNote + ' (methods differ)' : trendNote });
    }

    // Blood pressure
    if (bpStats) {
      items.push({ k:'Blood pressure', v:`${bpStats.avgSys}/${bpStats.avgDia}`,
        verdict: (bpStats.avgSys<130 && bpStats.avgDia<80) ? 'good'
               : (bpStats.avgSys<140 && bpStats.avgDia<90) ? 'ok' : 'miss',
        note:`7-day avg over ${bpStats.n} reading${bpStats.n===1?'':'s'}` });
    }

    // Stalls
    if (stalls && stalls.total>0) {
      items.push({ k:'Stalled lifts', v:`${stalls.stalled.length} of ${stalls.total}`,
        verdict: stalls.stalled.length===0 ? 'good' : stalls.stalled.length<=2 ? 'ok' : 'miss',
        note: stalls.stalled.length ? stalls.stalled.slice(0,2).map(s=>s.name).join(', ') : 'none need attention' });
    }

    if (!items.length) return null;
    const misses = items.filter(i=>i.verdict==='miss');
    return { items, sessions:wk.length, misses: misses.map(i=>i.k) };
  }, [logs, actualVol, calStats, bwRate, bpStats, stalls, goalPhase]);

  const plateRes=calcPlates(plateTgt);
  const warmups=calcWarmups(warmWt);

  // AI coach (state/useAi.tsx). Called last: nothing above reads these names while rendering.
  const { briefing, setBriefing, briefingLoading, setBriefingLoading, review, setReview, reviewLoading, setReviewLoading, periodReview, setPeriodReview, periodLoading, setPeriodLoading, periodScope, setPeriodScope, getBriefing, getReview, getPeriodReview } = useAi({ activeTarget, avg7, block, bodyMetrics, cardioLog, cardioMins, cardioSessions, deloadInfo, effPhase, goalPhase, latestBP, latestGl, logs, nutriCoach, phaseLine, plateaus, readiness, stalls, week, whoopData });

  return { touchCfg, applyBackup,
    BODY_TYPES, BUILD_ID, CIRC, KEY_SITES, R, _metricLbl, _prLbl, _unit, acceptTarget, activeInts, activeTarget,
    actualVol, addBP, addBldRow, addBodyMetric, addCardio, addCheckin, addContext, addExercise, addGlucose,
    addMeasurement, addNutrition, addProtocol, addSet, alcoholImpact, allDone, analyseProgress, applySwap, autoReg,
    bannerColor, bannerName, baseEx, biomarkers, bldForm, block, bloodCompare, bloodMarkerIndex, bloodsLog,
    bodyDash, bodyMetrics, bpDate, bpDia, bpLog, bpPulse, bpSeries, bpStats, bpSys, briefing, briefingLoading,
    burnCheck, bwAt, bwRate, cDate, cMin, cNote, cType, calStats, cancelBloodPanel, cardioLog, cardioMins,
    cardioSessions, cardioTrend, chartEvents, checkins, ciAddPose, ciAnalysing, ciAnalysis, ciCompareA, ciCompareB,
    ciPose, clearAllData, clearConfirm, clearIntInputs, clearVitalField, clearWip, cloudErr, cloudStatus,
    condensed, connectSync, contextLog, ctxDate, ctxNote, ctxReasons, ctxTags, ctxUnits, curEx, curSetPhase,
    curSetWeight, curTarget, curVol, dashOff, decayModel, delBldRow, delCheckin, delExercise, delSet,
    deleteBloodPanel, deloadActive, deloadInfo, deloadRebound, disconnectSync, disconnectWhoop, doSkipEx,
    doneToday, dur, durSplit, durations, editBloodPanel, editBody, editBodyDraft, editDraft, editIdx, editingLog,
    effPhase, effSets, effTargets, exIdx, expandLog, expandedSite, exportData, exportSummary, fetchWhoopData,
    finishModal, fmtAgo, genSyncCode, getBriefing, getPeriodReview, getReview, getWhoopCls, glDate, glSeries,
    glStats, glVal, glucoseLog, goToExercise, goalPhase, grpOpen, highVol, hvActive, hydration, imgOf, importData,
    intEligible, intFail, intKind, intMyoStr, intPartials, isDeload, lastWeight, latestBP, latestBySite, latestGl,
    lockCals, logSet, loggedSetsArr, logs, mDate, mSite, mVal, mViewSite, mealDay, mealPlan, mealSlot, mealTime,
    measSeries, measurements, movementPRs, nC, nDate, nF, nP, newBlockConfirm, newWt, newWtNote, nutriCoach,
    nutriDayType, nutrition, openBodyEdit, ormHL, ormRp, ormWt, pCmp, pDate, pDose, pNote, pUnit, painData,
    painRef, painTrend, periodLoading, periodReview, periodScope, plannedVol, plateRes, plateTgt, plateaus,
    prWeight, prevHist, progChartData, progEx, progHist, progMetric, progRec, protSeries, protocolLog,
    pullFromCloud, readiness, recFuelReady, recFuelRows, recPerf, recovery, restFlash, resumeWorkout, review,
    reviewLoading, rir, rirDrift, rp, saveAndFinish, saveBloodPanel, saveBodyEdit, saveEdit, saveTempBody,
    scheduledDeload, secOpen, sel, sess, setActiveInts, setBldForm, setBodyMetrics, setBpDate, setBpDia, setBpLog,
    setBpPulse, setBpSys, setCDate, setCMin, setCNote, setCType, setCardioLog, setCiAddPose, setCiCompareA,
    setCiCompareB, setCiPose, setClearConfirm, setCondensed, setContextLog, setCtxDate, setCtxNote, setCtxTags,
    setCtxUnits, setData, setDeloadSkips, setEditBody, setEditBodyDraft, setEditDraft, setEditIdx, setEditingLog,
    setExpandLog, setExpandedSite, setFinishModal, setGlDate, setGlVal, setGlucoseLog, setIntFail, setIntMyoStr,
    setIntPartials, setLockCals, setMDate, setMSite, setMVal, setMViewSite, setMealDay, setMealSlot, setMealTime,
    setMeasurements, setNC, setNDate, setNF, setNP, setNewBlockConfirm, setNewWt, setNewWtNote, setNutriDayType,
    setNutrition, setOrmRp, setOrmWt, setPCmp, setPDate, setPDose, setPNote, setPUnit, setPainData, setPlateTgt,
    setProgEx, setProgMetric, setProtocolLog, setRir, setRp, setSel, setShowAddBP, setShowAddBody,
    setShowAddCardio, setShowAddCtx, setShowAddGl, setShowAddMeas, setShowAddNutri, setShowAddProt, setShowAddTemp,
    setShowBpLog, setShowCalLog, setShowCtxLog, setShowGlLog, setShowSwap, setShowTempLog, setShowWoodLog,
    setShowWtLog, setSkipConfirm, setStorageFail, setSyncCodeInput, setTDate, setTVal, setView, setVolMuscle,
    setWDate, setWarmWt, setWood, setWt, setWtDate, showAddBP, showAddBody, showAddCardio, showAddCtx, showAddGl,
    showAddMeas, showAddNutri, showAddProt, showAddTemp, showBpLog, showCalLog, showCtxLog, showGlLog, showInt,
    showSwap, showTempLog, showWoodLog, showWtLog, skinTempStat, skipConfirm, skipTimer, stalls, startBloodPanel,
    startNewBlock, startWorkout, storageBreakdown, storageFail, strengthRet, subMap, syncCode, syncCodeInput,
    syncNow, tDate, tVal, targetLock, tempBand, tempChartSeries, tempLogList, tempStat, timeOfDay, timerMsg,
    timerOn, timerSecs, todayVitals, toggleGrp, toggleSec, tombstone, totalSets, trainLoad, tryFinish, updBldRow,
    updSet, upsertVitalsDated, userSetHighVol, userSetPhase, userSetRecovery, userSetWeek, view, vitalsLog,
    volMuscle, volParts, volSeries, wDate, warmWt, warmups, week, weekReview, whoopAuthFail, whoopCardio,
    whoopConnected, whoopData, whoopHistory, whoopLoading, whoopStaleNote, whoopWorkouts, wipData, woodLogList, wr,
    wt, wtDate
  };
}

export type AppState = ReturnType<typeof useAppState>;
