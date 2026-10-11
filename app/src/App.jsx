import React, { useState, useEffect, useRef, useMemo } from 'react';
import { RecoveryFuelStrip, SVGBars, SVGChart, SVGScatter, Sparkline } from './components/charts.jsx';
import { MEAL_PLAN } from './data/mealPlan.js';
import { ALL_EX, ALT_BY_MUSCLE, CORE_EX, DEF_INTS, DLW, EX_MUSCLE, MUSCLES, SESSIONS, buildIntensifier, effWR, getEffSets, getPhase, intBadge, rirDefaultFor, setDeloadNow } from './data/programme.js';
import { CTX_TAGS, computeAlcoholImpact, computeRecoveryPerformance, computeTimeOfDay, recentCtx } from './lib/associations.js';
import { playChime, primeAudio } from './lib/audio.js';
import { BLOOD_GROUPS, bloodAutoFlag, bloodNormKey } from './lib/bloods.js';
import { fmt, fmtDate, fmtShort, freshInfo, localToday, parseNum } from './lib/format.js';
import { DECAY_COLORS, MEAS_SITES, PK_ESTERS, bpCategory, glucoseCategory, pkFor } from './lib/health.js';
import { computeDeloadReadiness, computeReadiness } from './lib/readiness.js';
import { computeActualVolume, computeBurnCheck, computeDeloadRebound, computeDurations, computePainTrend, computeRirDrift, computeStalls, computeStrengthRetention, computeTrainingLoad, sessionPerformed } from './lib/sessions.js';
import { IDB, LS, usePersistentState } from './lib/storage.js';
import { ensureIds, legacyId, live, mergeByKey, mergeLogs, newId, pruneTombstones } from './lib/sync.js';
import { calcPlates, calcWarmups, dailyMedianWeights, epley, exMuscle, getPrevHist, getProgRec, getTarget, makeBwResolver, sessionVol, totalLoad, volLoad, weekMuscleVolume, weeklyVolumeSeries } from './lib/training.js';
import { matchWorkout, mergeHistory, parseWhoopCycles, parseWhoopHistory, parseWhoopSleeps, parseWhoopWorkouts } from './lib/whoop.js';
import { RootBoundary } from './components/RootBoundary.jsx';

function App() {

  // ── WHOOP INTEGRATION ─────────────────────────────────
  // Unguarded JSON.parse in a useState initialiser: a truncated/corrupt whoop_cache threw
  // during the FIRST render, so React could not mount and the whole app failed to open.
  const [whoopData, setWhoopData]       = useState(() => { try { const c=LS.get('whoop_cache'); return c?JSON.parse(c):null; } catch(e) { LS.del('whoop_cache'); return null; } });
  const [whoopAuthFail, setWhoopAuthFail] = useState(false);
  const [whoopStaleNote, setWhoopStaleNote] = useState(false);  // last refresh failed, showing cache
  const [whoopLoading, setWhoopLoading] = useState(false);
  const [whoopHistory, setWhoopHistory] = usePersistentState('whoop_history', []);
  const [whoopWorkouts, setWhoopWorkouts] = usePersistentState('whoop_workouts', []);
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
    const r = { recovery:null, hrv:null, rhr:null, sleep:null, strain:null, spo2:null, skinTemp:null, respRate:null, sleepConsistency:null, sleepEfficiency:null, sleepHrs:null, deepHrs:null, remHrs:null, sleepDebt:null, dayCal:null };
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

  const fetchWhoopData = async (token, allowRefresh = true) => {
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
      if (wos.length) { setWhoopWorkouts(prev => { const m={}; [...(prev||[]), ...wos].forEach(w=>{ const k=(w.id!=null?String(w.id):(w.start||'')+'|'+(w.strain||'')); if(k) m[k]=w; }); return Object.values(m).sort((a,b)=>((a.start||'')<(b.start||'')?1:-1)).slice(0,200); }); }
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
        LS.set('whoop_expires_at', String(Date.now() + parseInt(ei||3600)*1000));
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

  const [view, setView]         = useState('home');
  const [mealDay, setMealDay]   = usePersistentState('meal_day', 'train');   // 'train' | 'rest' (remembered)
  const [mealTime, setMealTime] = usePersistentState('meal_time', 'am');     // session time: 'am' (5am) | 'pm' (8pm)
  const [week, setWeek]         = useState(() => LS.getJSON('dp_cfg', {}).week || 1);
  const [block, setBlock]       = useState(() => LS.getJSON('dp_cfg', {}).block || 1);
  const [newBlockConfirm, setNewBlockConfirm] = useState(false);
  const [recovery, setRecovery] = useState(() => LS.getJSON('dp_cfg', {}).rec || 'normal');
  const [sel, setSel]           = useState(null);
  const [logs, setLogs]         = useState(() => LS.getJSON('dp_logs', []));
  const [wipData, setWipData]   = useState(() => LS.getJSON('dp_wip', null));
  const [expandLog, setExpandLog] = useState(null);
  const [progEx, setProgEx]     = useState(null);
  const [progMetric, setProgMetric] = useState('e1rm');
  const [volMuscle, setVolMuscle] = useState('all');
  const [activeInts, setActiveInts] = useState(new Set());
  const [exIdx, setExIdx]       = useState(0);
  const [curSet, setCurSet]     = useState(0);
  const [setData, setSetData]   = useState({});
  const [painData, setPainData] = useState({});
  const [subMap, setSubMap] = useState({});
  const [showSwap, setShowSwap] = useState(false);
  const [reviseMode, setReviseMode] = useState(false);
  const [finishModal, setFinishModal] = useState(false);
  const [editingLog, setEditingLog] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  const [condensed, setCondensed] = useState(false);
  const [highVol, setHighVol] = useState(() => LS.getJSON('dp_cfg', {}).highVol || false);
  const [goalPhase, setGoalPhase] = useState(() => LS.getJSON('dp_cfg', {}).phase || 'bulk');
  const GOAL_LABEL = { bulk:'muscle gain in a slight surplus', maintain:'maintenance / recomposition at roughly maintenance calories', cut:'fat loss in a caloric deficit' };
  const phaseLine = `CURRENT GOAL: ${GOAL_LABEL[goalPhase]||GOAL_LABEL.bulk}.` + (goalPhase==='cut' ? ' Priority is RETAINING muscle. Progression is welcome when recovery is good and the reps are there \u2014 take it when it comes \u2014 but never force it: holding loads while bodyweight drops is also success, and stalls are expected, not failures to fix. Keep volume around maintenance, protect recovery, and flag if protein looks low or the deficit seems too steep to hold muscle.' : goalPhase==='maintain' ? ' Progression is welcome but not forced; maintaining strength or a slow recomp is the aim.' : ' A small surplus supports growth, so drive progression where recovery allows.');
  const [wt, setWt]             = useState(60);
  const [rp, setRp]             = useState(8);
  const [rir, setRir]           = useState(1);
  const [editIdx, setEditIdx]   = useState(null);
  // Intensifier capture (final-set-only). Stored in SEPARATE fields on the set (partialReps /
  // myoReps), never folded into reps, so e1RM / volume / progression ignore them by construction.
  const [intPartials, setIntPartials] = useState('');
  const [intMyoStr, setIntMyoStr]     = useState('');
  const [intFail, setIntFail]         = useState(false);
  const clearIntInputs = () => { setIntPartials(''); setIntMyoStr(''); setIntFail(false); };
  // Persistence-failure surface. usePersistentState and saveWip both dispatch 'dp-storage-fail'
  // on a failed write (quota / private mode); without a listener the failure was invisible and
  // the UI implied data was saved when it was not.
  const [storageFail, setStorageFail] = useState(null);
  useEffect(() => {
    const h = (e) => setStorageFail((e && e.detail && e.detail.key) || 'storage');
    window.addEventListener('dp-storage-fail', h);
    return () => window.removeEventListener('dp-storage-fail', h);
  }, []);
  // Locked weekly calorie target. Declared here (early) rather than beside targetLock/effTargets
  // because the cloud-sync effect and Clear/export/import all reference it, and the sync effect's
  // dependency array — which is evaluated during render — sits above those definitions.
  const [activeTarget, setActiveTarget] = usePersistentState('active_target', null);
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
  const [plateTgt, setPlateTgt] = useState(100);
  const [warmWt, setWarmWt]     = useState(100);
  const [ormWt, setOrmWt]       = useState(100);
  const [ormRp, setOrmRp]       = useState(5);
  const [briefing, setBriefing]       = useState(null);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [review, setReview]           = useState(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [bodyMetricsRaw, setBodyMetrics] = usePersistentState('body_metrics', []);
  const bodyMetrics = useMemo(()=>live(bodyMetricsRaw),[bodyMetricsRaw]);
  const [protocolLogRaw, setProtocolLog] = usePersistentState('protocol_log', []);
  const protocolLog = useMemo(()=>live(protocolLogRaw),[protocolLogRaw]);
  const [measurementsRaw, setMeasurements] = usePersistentState('body_measurements', []);
  const measurements = useMemo(()=>live(measurementsRaw),[measurementsRaw]);
  const [checkins, setCheckins] = useState(() => { try { return JSON.parse(LS.get('checkin_photos') || '[]'); } catch(e) { return []; } });
  // Photo image data lives in IndexedDB; this in-memory cache is hydrated from it on mount so every
  // reader (display, compare, AI, export) stays synchronous. imgOf falls back to any base64 still on
  // the record (un-migrated or IDB-unavailable), so a photo always resolves.
  const [photoImg, setPhotoImg] = useState({});
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
  const [showCalLog, setShowCalLog] = useState(false);
  const [expandedWeek, setExpandedWeek] = useState(null);
  const [nutriDayType, setNutriDayType] = useState(() => { const d=new Date().getDay(); return [2,4,6,0].includes(d)?'train':'rest'; }); // Tue/Thu/Sat/Sun train
  const [nutritionRaw, setNutrition] = usePersistentState('nutrition_log', []);
  const nutrition = useMemo(()=>live(nutritionRaw),[nutritionRaw]);
  const [nP, setNP] = useState('');
  const [nC, setNC] = useState('');
  const [nF, setNF] = useState('');
  const [showAddNutri, setShowAddNutri] = useState(false);
  const [cardioLogRaw, setCardioLog] = usePersistentState('cardio_log', []);
  const cardioLog = useMemo(()=>live(cardioLogRaw),[cardioLogRaw]);
  const [cType, setCType] = useState('Zone 2');
  const [cMin, setCMin] = useState('');
  const [cNote, setCNote] = useState('');
  const [showAddCardio, setShowAddCardio] = useState(false);
  const [bpLogRaw, setBpLog] = usePersistentState('bp_log', []);
  const bpLog = useMemo(()=>live(bpLogRaw),[bpLogRaw]);
  const [bpSys, setBpSys] = useState('');
  const [bpDia, setBpDia] = useState('');
  const [bpPulse, setBpPulse] = useState('');
  const [glucoseLogRaw, setGlucoseLog] = usePersistentState('glucose_log', []);
  const glucoseLog = useMemo(()=>live(glucoseLogRaw),[glucoseLogRaw]);
  const [contextLogRaw, setContextLog] = usePersistentState('context_log', []);
  const contextLog = useMemo(()=>live(contextLogRaw),[contextLogRaw]);
  // Waking temp + morning-wood: one combined daily store (one entry/day, keyed by date).
  // These are the only genuinely new inputs the dashboard adds; everything else it reads
  // from stores that already exist and already sync.
  const [vitalsLogRaw, setVitalsLog] = usePersistentState('vitals_log', []);
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
  const [grpClosed, setGrpClosed] = usePersistentState('prog_grp_closed', ['recovery','detail']);
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
      const pk = pkFor(e.compound); const dose = parseFloat(e.dose);
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
  const [bloodsLogRaw, setBloodsLog] = usePersistentState('bloods_log', []);
  // P0.7: default is empty and there is NO resurrection effect. Blood panels are user data —
  // added in-app or restored via Tools → Import (see bloods-backup.json). Deleting one now sticks.
  const bloodsLog = useMemo(()=>live(bloodsLogRaw),[bloodsLogRaw]);
  // In-app panel entry. The draft is persisted so an app reload mid-entry does not lose it.
  // Shape: { editId, date, provider, note, rows:[{k,v,unit,ref,g,flag}], err }
  const [bldForm, setBldForm] = usePersistentState('bloods_draft', null);
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
      const rows = {};
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
        const units = new Set(Object.values(r.cells).map(c => normUnit(c && c.unit)).filter(Boolean));
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
  const [ctxTags, setCtxTags] = useState([]);
  const [ctxNote, setCtxNote] = useState('');
  const [ctxDate, setCtxDate] = useState(localToday());
  const [showAddCtx, setShowAddCtx] = useState(false);
  const [showCtxLog, setShowCtxLog] = useState(false);
  const [glVal, setGlVal] = useState('');
  const [showAddGl, setShowAddGl] = useState(false);
  const [showAddBP, setShowAddBP] = useState(false);
  const [periodReview, setPeriodReview] = useState(null);
  const [periodLoading, setPeriodLoading] = useState(false);
  const [periodScope, setPeriodScope] = useState(null);
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
  const [nDate, setNDate] = useState(localToday());
  const [cDate, setCDate] = useState(localToday());
  const [bpDate, setBpDate] = useState(localToday());
  const [glDate, setGlDate] = useState(localToday()); // separate from bpDate: they were coupled, so editing one silently changed the other
  const [pDate, setPDate] = useState(localToday());
  const [syncCode, setSyncCode]       = useState(() => LS.get('sync_code') || '');
  const [syncCodeInput, setSyncCodeInput] = useState('');
  const [cloudStatus, setCloudStatus] = useState('idle');
  const [cloudErr, setCloudErr] = useState('');
  const [cfgUpdatedAt, setCfgUpdatedAt] = usePersistentState('cfg_updated_at', 0);
  const [deloadSkips, setDeloadSkips] = usePersistentState('deload_skips', {});
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
  const syncTimer = useRef(null);
  const skipPush  = useRef(false);
  const syncMounted = useRef(false);

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

  const exportData = () => {
    const data={version:'2.4',exported:new Date().toISOString(),logs,config:{week,recovery,block,highVol,phase:goalPhase},activeTarget,bodyMetrics,measurements,checkins:checkins.map(c=>({...c,img:imgOf(c)})),nutrition,cardioLog,bpLog,glucoseLog,protocolLog,contextLog,vitalsLog,bloodsLog,whoopHistory,whoopWorkouts,deloadSkips};
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download=`diamond-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  // Compact, human/AI-readable digest — the thing to paste into a coach chat or model.
  // Markdown-ish plain text, not the full JSON dump. Pulls from the live analytics memos.
  const exportSummary = () => {
    const L = [];
    const p = (...a) => L.push(a.join(''));
    p('DIAMOND PROTOCOL — SUMMARY EXPORT');
    p('Generated: ' + new Date().toLocaleString('en-GB'));
    p('Block ' + block + ', Week ' + week + '/12 · Goal: ' + goalPhase + (highVol ? ' · high-volume' : ''));
    p('');
    p('== BODY ==');
    if (bodyMetrics[0]) p('Latest weight: ' + bodyMetrics[0].weight + 'kg (' + fmtShort(bodyMetrics[0].date) + ')' + (bodyDash.avg7 != null ? ' · 7d avg ' + bodyDash.avg7.toFixed(1) + 'kg' : ''));
    if (bwRate) p('Weight trend (21d regression): ' + (bwRate.perWeek > 0 ? '+' : '') + bwRate.perWeek.toFixed(2) + ' kg/wk (' + (bwRate.pctWeek > 0 ? '+' : '') + bwRate.pctWeek.toFixed(2) + '%/wk)');
    if (latestBP) p('Latest BP: ' + latestBP.sys + '/' + latestBP.dia + ' (' + bpCategory(latestBP.sys, latestBP.dia).label + ')');
    p('');
    p('== NUTRITION ==');
    if (nutriCoach.ok) {
      p('Est. maintenance: ~' + nutriCoach.tdee + ' kcal/day (' + nutriCoach.conf + ' confidence, from intake vs weight over ' + nutriCoach.spanDays + 'd)');
      p('Logging: ~' + nutriCoach.avgIntake + ' kcal/day · trend ' + (nutriCoach.ratePerWk > 0 ? '+' : '') + nutriCoach.ratePerWk.toFixed(2) + ' kg/wk');
      p('Target (' + goalPhase + '): ' + ((activeTarget&&Number.isFinite(activeTarget.cals))?activeTarget.cals+' kcal (locked)':nutriCoach.targetCals+' kcal') + ' · P' + nutriCoach.proteinG + ' C' + nutriCoach.carbG + ' F' + nutriCoach.fatG);
    } else p('Smart targets: not ready (' + (nutriCoach.reason || 'insufficient data') + ')');
    if (burnCheck) p('WHOOP burn cross-check: ' + burnCheck.avg + ' vs empirical ' + burnCheck.tdee + ' (' + (burnCheck.agree ? 'agree' : 'gap ' + burnCheck.gap) + ', ' + burnCheck.days + 'd)');
    p('');
    p('== TRAINING ANALYTICS ==');
    if (strengthRet) { p('Strength retention (21d vs prior): ' + (strengthRet.avgPct > 0 ? '+' : '') + strengthRet.avgPct + '% avg e1RM'); strengthRet.lifts.forEach(l => p('  ' + l.name + ': ' + (l.pct > 0 ? '+' : '') + l.pct + '% (' + l.prior + '→' + l.recent + 'kg)')); }
    if (deloadRebound) p('Deload rebound: ' + (deloadRebound.avg > 0 ? '+' : '') + deloadRebound.avg + '% avg (week after vs before)');
    if (rirDrift) p('RIR drift (recent): ' + (rirDrift.avg > 0 ? '+' : '') + rirDrift.avg + ' vs prescribed');
    if (plateaus.length) p('Stalled lifts: ' + plateaus.map(x => x.name + ' (' + x.sessions + ' sessions)').join(', '));
    p('');
    p('== RECENT SESSIONS (last 12) ==');
    logs.slice(0, 12).forEach(l => {
      const tag = l.deload === true ? ' [deload]' : (l.deload === false && DLW.has(l.week)) ? ' [trained through]' : '';
      p('W' + l.week + ' ' + (l.sessionName || l.sessionId) + tag + ' — ' + fmtShort(l.date));
      (l.exercises || []).forEach(ex => p('  ' + ex.name + ': ' + ex.sets.map(s => s.weight + 'x' + s.reps + (s.rir != null ? '@' + s.rir : '')).join(', ')));
    });
    p('');
    p('== WEIGHT LOG CSV (last 30) ==');
    p('date,weight_kg,bodyfat_pct,lean_kg,notes');
    bodyMetrics.slice(0, 30).forEach(m => p([m.date.slice(0,10), m.weight, m.bodyFat ?? '', m.muscle ?? '', (m.notes||'').replace(/,/g,';')].join(',')));
    p('');
    p('== NUTRITION CSV (last 30) ==');
    p('date,kcal,protein_g,carbs_g,fat_g');
    nutrition.slice(0, 30).forEach(n => p([n.date.slice(0,10), n.calories, n.protein, n.carbs, n.fat].join(',')));
    const blob = new Blob([L.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `diamond-summary-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const importData = () => {
    const input=document.createElement('input'); input.type='file'; input.accept='.json';
    input.onchange = e => {
      const file=e.target.files[0]; if(!file)return;
      const reader=new FileReader();
      reader.onload = ev => {
        try {
          const data=JSON.parse(ev.target.result);
          // Validate this is actually a Diamond backup BEFORE touching state — import replaces
          // the live arrays, so a random or malformed file would silently wipe good data.
          const isObj = x => x && typeof x === 'object' && !Array.isArray(x);
          const KNOWN = ['logs','bodyMetrics','measurements','checkins','nutrition','cardioLog','bpLog','glucoseLog','protocolLog','contextLog','vitalsLog','bloodsLog'];
          if (!isObj(data) || (!data.version && !KNOWN.some(k => Array.isArray(data[k])))) {
            alert('That does not look like a Diamond Protocol backup — nothing was changed.');
            return;
          }
          // Per-record validation: drop malformed / future-dated / duplicate-id records rather
          // than importing garbage; anything rejected is counted and reported. Also fixes the
          // old bug where oldest-first arrays imported "fine" but corrupted every latest-value
          // (clean() re-sorts newest-first). Absent arrays are left untouched (partial restore).
          const validDate = d => typeof d === 'string' && !isNaN(new Date(d).getTime());
          const notFuture = d => new Date(d).getTime() <= Date.now() + 86400000;
          const num = x => (typeof x === 'number' && isFinite(x)) ? x : null;
          const rejected = {};
          const clean = (name, arr, ok) => {
            const seen = new Set(); const kept = []; let dropped = 0;
            for (const r of (Array.isArray(arr) ? arr : [])) {
              if (!isObj(r) || (ok && !ok(r))) { dropped++; continue; }
              if (r.id != null) { if (seen.has(r.id)) { dropped++; continue; } seen.add(r.id); }
              kept.push(r);
            }
            if (dropped) rejected[name] = dropped;
            return kept.sort((a,b)=> ((a.date||'')<(b.date||'')?1:(a.date||'')>(b.date||'')?-1:0));
          };
          const dOk = (extra) => (r) => validDate(r.date) && notFuture(r.date) && (!extra || extra(r));
          let importedLogs = 0;
          // Strict validation on the high-value dated arrays that drive analytics/readiness:
          if (Array.isArray(data.logs)) { const L = clean('sessions', data.logs, dOk(r=>Array.isArray(r.exercises))); importedLogs = L.length; setLogs(L.slice(0,600)); }
          if (Array.isArray(data.bodyMetrics)) setBodyMetrics(clean('weight', data.bodyMetrics, dOk(r=>{const w=num(r.weight);return w!=null&&w>0&&w<=400;})));
          if (Array.isArray(data.bpLog)) setBpLog(clean('BP', data.bpLog, dOk(r=>{const s=num(r.sys),d=num(r.dia);return s!=null&&d!=null&&s>=40&&s<=300&&d>=20&&d<=200;})));
          if (Array.isArray(data.glucoseLog)) setGlucoseLog(clean('glucose', data.glucoseLog, dOk(r=>{const v=num(r.value);return v!=null&&v>0&&v<=60;})));
          // Lenient (object + dedupe + re-sort) on varied-shape arrays, to avoid wrongly dropping legit records:
          if (Array.isArray(data.measurements)) setMeasurements(clean('measurements', data.measurements));
          if (Array.isArray(data.checkins)) setCheckins(clean('check-ins', data.checkins));
          if (Array.isArray(data.nutrition)) setNutrition(clean('nutrition', data.nutrition));
          if (Array.isArray(data.cardioLog)) setCardioLog(clean('cardio', data.cardioLog));
          if (Array.isArray(data.protocolLog)) setProtocolLog(clean('protocol', data.protocolLog));
          if (Array.isArray(data.contextLog)) setContextLog(clean('context', data.contextLog));
          if (Array.isArray(data.vitalsLog)) setVitalsLog(clean('vitals', data.vitalsLog));
          // Bloods MERGE by panel id rather than replace. A file holding one new panel used to wipe
          // every other panel. Imported panels are stamped newer so a corrected re-import wins.
          let bloodsMerged = null;
          if (Array.isArray(data.bloodsLog)) {
            const stamp = Date.now();
            const inc = (ensureIds(clean('bloods', data.bloodsLog), 'bld') || []).map(p => ({ ...p, updatedAt: stamp }));
            setBloodsLog(prev => mergeByKey(ensureIds(prev || [], 'bld'), inc, e => e.id));
            bloodsMerged = inc.length;
          }
          // WHOOP history/workouts and deload-skip choices — omitted from older backups, so guarded
          // by presence. Arrays go through the same lenient sanitiser; deloadSkips is a plain object.
          if (Array.isArray(data.whoopHistory)) setWhoopHistory(clean('whoop history', data.whoopHistory));
          if (Array.isArray(data.whoopWorkouts)) setWhoopWorkouts(clean('whoop workouts', data.whoopWorkouts));
          if (data.deloadSkips && typeof data.deloadSkips==='object' && !Array.isArray(data.deloadSkips)) setDeloadSkips(data.deloadSkips);
          if (data.config) { if(data.config.week!=null)setWeek(data.config.week); if(data.config.recovery!=null)setRecovery(data.config.recovery); if(data.config.block!=null)setBlock(data.config.block); if(data.config.highVol!=null)setHighVol(data.config.highVol); if(data.config.phase!=null)setGoalPhase(data.config.phase); touchCfg(); }  // explicit user restore = a config edit
          if (data.activeTarget && Number.isFinite(data.activeTarget.cals)) setActiveTarget(data.activeTarget);   // restore the locked calorie target
          const rej = Object.entries(rejected).map(([k,v])=>`${v} ${k}`).join(', ');
          const onlyBloods = bloodsMerged != null && Object.keys(data).filter(k => KNOWN.includes(k)).every(k => k === 'bloodsLog');
          const bldMsg = bloodsMerged != null ? `${bloodsMerged} blood panel${bloodsMerged===1?'':'s'} imported. Existing panels were kept.` : '';
          alert((onlyBloods ? bldMsg : `Restored ${importedLogs} sessions plus body, nutrition, BP, cardio and protocol history.` + (bldMsg ? '\n\n' + bldMsg : '')) + (rej ? `\n\nSkipped invalid or duplicate records: ${rej}.` : ''));
        } catch(err) { alert('Could not read file. Make sure it is a valid Diamond Protocol backup.'); }
      };
      reader.readAsText(file);
    };
    document.body.appendChild(input); input.click(); document.body.removeChild(input);
  };

  const clearAllData = async () => {
    setClearConfirm(false);
    // 1. Delete the CLOUD snapshot first, while the code is still available. Without this,
    //    clearing only wiped the device — the full snapshot (training, body, nutrition, BP,
    //    glucose, bloods) stayed in Blobs and the next device to sync restored all of it.
    //    sync-data.js has a DELETE handler; it just was never called from here.
    const code = syncCode || LS.get('sync_code');
    let cloudMsg = 'No cloud sync was connected.';
    if (code) {
      try {
        const r = await fetch('/.netlify/functions/sync-data', { method: 'DELETE', headers: { 'x-sync-code': code } });
        cloudMsg = r.ok ? 'Cloud snapshot deleted.'
          : 'Cloud delete failed (HTTP ' + r.status + ') — the snapshot may remain; retry, or delete from another signed-in device.';
      } catch (e) {
        cloudMsg = 'Cloud delete could not be reached (' + (e.message || 'network') + ') — the snapshot may remain.';
      }
    }
    // 2. Reset in-memory state.
    setLogs([]); setWeek(1); setBlock(1); setRecovery('normal'); setHighVol(false); setGoalPhase('bulk');
    setWipData(null);
    setBodyMetrics([]); setMeasurements([]); setNutrition([]); setCardioLog([]); setBpLog([]); setGlucoseLog([]); setProtocolLog([]); setContextLog([]); setVitalsLog([]); setBloodsLog([]);
    setCheckins([]); setWhoopHistory([]); setWhoopWorkouts([]); setWhoopData(null);
    // sync_code cleared so the mount effect cannot pull and resurrect what was just deleted.
    setSyncCode(''); setCloudStatus('idle'); setActiveTarget(null);
    // 3. Enumerate and remove EVERY local key rather than a fixed list — this origin is the app
    //    alone, so a full wipe is correct and catches legacy keys the old list missed (an old
    //    Anthropic key, the build stamp, deload skips, meal/UI state).
    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k) keys.push(k); }
      keys.forEach(k => LS.del(k));
    } catch(_) {}
    // 4. Report honestly, including what the app cannot do itself.
    try { alert('Local data cleared. ' + cloudMsg + '\n\nTwo things this cannot do for you:\n• WHOOP access is not revoked automatically — revoke it in your WHOOP account → Connected Apps.\n• Your Anthropic key lives only in Netlify and is unaffected (as intended).'); } catch(_) {}
  };


  const getBriefing = async sessionId => {
    const sess = SESSIONS[sessionId]; const wr = effWR(week); const ph = getPhase(week);
    setBriefingLoading(true); setBriefing(null);
    const progLines = sess.exercises.map(ex=>{
      const rec=getProgRec(ex.id,ex,logs,effPhase);
      const prev=getPrevHist(ex.id,logs,1)[0];
      const ps=prev?prev.sets.map(s=>`${s.weight}kg x${s.reps}`).join(', '):'first time';
      return `- ${ex.name}: ${rec.msg} (last: ${ps})`;
    }).join('\n');
    const recent=logs.slice(0,4).map(l=>
      `${new Date(l.date).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})} - ${l.sessionName}: ${l.exercises.map(e=>e.name+' '+e.sets.map(s=>s.weight+'x'+s.reps).join('/')).join(', ')}`
    ).join('\n')||'No sessions logged yet';
    const whStr=whoopData?.recovery!=null
      ?`Recovery ${whoopData.recovery}% | HRV ${whoopData.hrv}ms | RHR ${whoopData.rhr}bpm | Sleep ${whoopData.sleepHrs!=null?whoopData.sleepHrs+'h':whoopData.sleep+'%'}${whoopData.respRate!=null?' | Resp '+whoopData.respRate+'br/m':''}${whoopData.sleepDebt!=null?' | Sleep debt '+whoopData.sleepDebt+'h':''}${whoopData.dayCal!=null?' | '+whoopData.dayCal+' cal out':''}`
      :'No Whoop data available';
    const bodyStr=bodyMetrics.length?`Latest weight: ${bodyMetrics[0].weight}kg (${fmtShort(bodyMetrics[0].date)})`:'No body metrics logged';
    const briefProt=avg7('protein'); const briefCal=avg7('calories');
    const fuelStr=briefProt!=null?`~${briefProt}g protein, ~${briefCal} kcal/day (7-day avg)${(nutriCoach.ok&&nutriCoach.avgIntake!=null)?`; vs est. maintenance ~${nutriCoach.tdee} kcal (empirical) = ${nutriCoach.avgIntake-nutriCoach.tdee>=0?'+':''}${nutriCoach.avgIntake-nutriCoach.tdee}/day net`:''}`:'not logged';
    const bpStr=latestBP?`${latestBP.sys}/${latestBP.dia} (${bpCategory(latestBP.sys,latestBP.dia).label}, ${fmtShort(latestBP.date)})`:'not logged';
    const glStr=latestGl?`${latestGl.value} mmol/L (${glucoseCategory(latestGl.value).label}, ${fmtShort(latestGl.date)})`:'not logged';
    const painFlags=[]; logs.slice(0,3).forEach(l=>(l.exercises||[]).forEach(ex=>{ if(ex.pain) painFlags.push(`${ex.name} (${ex.pain===2?'sharp':'mild'}, ${fmtShort(l.date)})`); }));
    const painStr=painFlags.length?painFlags.join('; '):'none reported recently';
    const prompt=`You are a personal strength coach for a 48-year-old male on an optimised hormonal protocol with enhanced recovery capacity. He follows the Diamond Protocol 12-week hypertrophy programme. ${phaseLine}\n\nTODAY: ${sess.name} - ${sess.focus}\nPhase: ${ph.name} (Week ${week}/12) | Target: ${wr.rir} | Intensifiers: ${wr.i?'ACTIVE - max '+sess.maxInt+' this session':'Off - straight sets only'}\nWHOOP: ${whStr}\nBody: ${bodyStr}\nFuel: ${fuelStr}\nBlood pressure: ${bpStr}\nFasting glucose: ${glStr}\nRecent joint/tendon pain: ${painStr}\nToday's readiness call: ${readiness.title} - ${readiness.action}\n\nEXERCISE PROGRESSION:\n${progLines}\n\nRECENT SESSIONS:\n${recent}\n\nWrite a concise pre-session briefing in 3-4 short paragraphs. Be specific with weights and reps. Cover: (1) readiness based on recovery data - and if low recovery lines up with low fuel/protein or poor sleep, say so plainly. If BP is Stage 1+, hold intensifiers/grinders today. If fasting glucose is in the watch/high band, note it briefly as a stack signal to monitor (do not alarm or diagnose). Anchor nutrition comments to the 7-day trend not single days, (2) exact targets for main lifts using double progression rules, (3) ${wr.i?'which '+sess.maxInt+' intensifiers to use today and why':'key execution focus for straight sets today'}, (4) one sharp technical or mindset cue. If sharp joint or tendon pain is flagged on any lift, recommend a machine or cable alternative for it today. Keep your guidance consistent with today's readiness call above and explain its reasoning in your own words. Direct, no fluff.`;
    try {
      const res=await fetch('/.netlify/functions/ai-proxy',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({model:'claude-sonnet-4-6',max_tokens:700,messages:[{role:'user',content:prompt}]})
      });
      const data=await res.json();
      const text=data.content?.[0]?.text||'Could not generate briefing. The AI proxy did not return text — check the Netlify function and ANTHROPIC_API_KEY.';
      setBriefing({text,session:sess.name});
    } catch(e){ setBriefing({text:'Error: '+e.message,session:sess.name}); }
    finally{ setBriefingLoading(false); }
  };

  const getReview = async () => {
    const last = logs[0];
    if (!last) return;
    setReviewLoading(true); setReview(null);
    const lines = last.exercises.map(ex => {
      const hist = getPrevHist(ex.id, logs, 2);
      const prev = hist[1];
      const cur = ex.sets.map(s => `${s.weight}x${s.reps}@${s.rir}RIR`).join(', ');
      const prevStr = prev ? prev.sets.map(s => `${s.weight}x${s.reps}`).join(', ') : 'no previous data';
      const painTag = ex.pain ? ` [${ex.pain===2?'SHARP PAIN':'niggle'} flagged]` : '';
      return `- ${ex.name}: today ${cur} | last time ${prevStr}${painTag}`;
    }).join('\n');
    const wr2 = effWR(last.week, last.deload != null ? last.deload : DLW.has(last.week)); const ph = getPhase(last.week);
    const whStr = whoopData?.recovery != null ? `Recovery ${whoopData.recovery}%, HRV ${whoopData.hrv}ms` : 'no Whoop data';
    const prompt = `You are a personal strength coach reviewing a just-completed session for a 48-year-old male on an optimised hormonal protocol with enhanced recovery capacity, following the Diamond Protocol 12-week hypertrophy programme. ${phaseLine}\n\nSESSION JUST COMPLETED: ${last.sessionName} - Week ${last.week} (${ph.name}, target ${wr2.rir})\nDuration: ${last.duration} min | Recovery context: ${whStr}\n\nEXERCISE RESULTS (today vs last time):\n${lines}\n\nWrite a concise post-session review in 2-3 short paragraphs. Cover: (1) what clearly progressed today (specific lifts that added weight or reps), (2) anything that stalled or regressed and the likely reason, (3) 2-3 specific, actionable adjustments for next time this session comes around - exact weights or rep targets where possible. If any lift has sharp pain flagged, recommend swapping it for a joint-friendly alternative next time. Be direct and encouraging but honest. Talk like a coach who tracks every set.`;
    try {
      const res = await fetch('/.netlify/functions/ai-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 650, messages: [{ role: 'user', content: prompt }] })
      });
      const data = await res.json();
      const text = data.content?.[0]?.text || 'Could not generate review. The AI proxy returned no text — check the Netlify function and ANTHROPIC_API_KEY.';
      setReview(text);
    } catch (e) { setReview('Error: ' + e.message); }
    finally { setReviewLoading(false); }
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
      img.src = e.target.result;
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

  const getPeriodReview = async (scope) => {
    setPeriodScope(scope); setPeriodReview(null); setPeriodLoading(true);
    const ph = getPhase(week);
    const fmtVol = v => Object.keys(v).length ? Object.entries(v).map(([m,s]) => `${MUSCLES[m]?.name||m} ${Math.round(s*10)/10}`).join(', ') : 'none';
    const bw = bodyMetrics.length >= 2 ? `${bodyMetrics[bodyMetrics.length-1].weight}kg to ${bodyMetrics[0].weight}kg` : (bodyMetrics.length===1?`${bodyMetrics[0].weight}kg`:'not logged');
    const recTrend = (deloadInfo?.level && deloadInfo.level!=='unknown') ? deloadInfo.msg : 'insufficient WHOOP history';
    const protAvg = avg7('protein'); const calAvg = avg7('calories');
    const nutLine = protAvg!=null ? `~${protAvg}g protein, ~${calAvg} kcal per day (7-day avg)` : 'not logged';
    const platLine = plateaus.length ? plateaus.map(p=>p.name).join(', ') : 'none';
    const bpLine = latestBP ? `${latestBP.sys}/${latestBP.dia} (${bpCategory(latestBP.sys,latestBP.dia).label})` : 'not logged';
    const ebLine = (nutriCoach.ok && nutriCoach.avgIntake!=null) ? `intake ~${nutriCoach.avgIntake} kcal/day vs est. maintenance ~${nutriCoach.tdee} (empirical) = ${nutriCoach.avgIntake-nutriCoach.tdee>=0?'+':''}${nutriCoach.avgIntake-nutriCoach.tdee} kcal/day net` : 'not available';
    const coachLine = nutriCoach.ok
      ? `est. maintenance ~${nutriCoach.tdee} kcal/day (${nutriCoach.conf} confidence, derived from logged intake vs weight trend); recent intake ~${nutriCoach.avgIntake} kcal/day; weight trend ${nutriCoach.ratePerWk>0?'+':''}${nutriCoach.ratePerWk.toFixed(2)} kg/wk; current ${goalPhase} target ${(activeTarget&&Number.isFinite(activeTarget.cals))?activeTarget.cals+' kcal/day (locked)':nutriCoach.targetCals+' kcal/day'} (P ${nutriCoach.proteinG} / C ${nutriCoach.carbG} / F ${nutriCoach.fatG} g)${nutriCoach.adjust&&nutriCoach.adjust.dir==='down'?'; app flags loss stalled vs target, suggests trimming ~'+nutriCoach.adjust.kcal+' kcal/day':nutriCoach.adjust&&nutriCoach.adjust.dir==='up'?'; app flags loss faster than 1%/wk, suggests adding ~'+nutriCoach.adjust.kcal+' kcal/day to protect muscle':nutriCoach.adjust?'; loss rate on target':''}`
      : 'not enough recent food + weigh-in data to estimate maintenance yet';
    let prompt;
    if (scope === 'week') {
      const wl = logs.filter(l => l.week === week && (l.block||1) === block);
      const sessLines = wl.length ? wl.map(l => `- ${l.sessionName||l.sessionId}: ${l.exercises.length} exercises, ${l.exercises.reduce((a,e)=>a+e.sets.length,0)} sets`).join('\n') : 'no sessions logged yet';
      const cardioLine = cardioLog.length ? `${cardioSessions} sessions, ${cardioMins} min this week` : 'none';
      prompt = `You are a personal strength coach giving a weekly check-in for a 48-year-old male on an optimised hormonal protocol with enhanced recovery, following the Diamond Protocol 12-week hypertrophy programme. ${phaseLine}

WEEK ${week}/12 (${ph.name})
Sessions this week:
${sessLines}
Hard sets per muscle this week: ${fmtVol(weekMuscleVolume(logs, week, block))}
Recovery/fatigue trend: ${recTrend}
Nutrition: ${nutLine}
Adaptive nutrition: ${coachLine}
Cardio: ${cardioLine}
Stalled lifts: ${platLine}
Bodyweight: ${bw}\nBlood pressure: ${bpLine}\nEnergy balance (empirical, 7-21d): ${ebLine}

Write a concise weekly check-in in 2-3 short paragraphs. Cover: (1) how the week went - volume hit, whether recovery is holding, (2) anything to watch (stalls, under-trained muscles, fatigue, low protein), (3) 2-3 specific things to focus on next week. Where the data allows, connect the dots - e.g. flag if low protein lines up with stalls, if sleep debt or low recovery tracks with how sessions felt, or if blood pressure is drifting up with training load. Reference the adaptive nutrition numbers above: say whether current intake and the suggested target line up with the ${goalPhase} goal and whether the weight trend supports it. Direct and practical, like a coach reviewing the week.`;
    } else {
      const blockLogs = logs.filter(l => (l.block||1) === block);
      const vol = {};
      for (const l of blockLogs) for (const ex of (l.exercises||[])) { const m=exMuscle(ex); if(!m)continue; const s=ex.sets?.length||0; vol[m.p]=(vol[m.p]||0)+s; if(m.s){const ss=Array.isArray(m.s)?m.s:[m.s];for(const sm of ss)vol[sm]=(vol[sm]||0)+s*0.5;} }
      const sessLines = blockLogs.length ? blockLogs.slice(0,40).map(l => `- W${l.week} ${l.sessionName||l.sessionId}: ${l.exercises.reduce((a,e)=>a+e.sets.length,0)} sets`).join('\n') : 'none logged';
      prompt = `You are a personal strength coach writing an end-of-block retrospective for a 48-year-old male on an optimised hormonal protocol with enhanced recovery, who has run the Diamond Protocol 12-week hypertrophy programme (currently week ${week}). ${phaseLine}

All sessions logged:
${sessLines}
Total hard sets per muscle across the block: ${fmtVol(vol)}
Recovery/fatigue trend: ${recTrend}
Nutrition: ${nutLine}
Adaptive nutrition: ${coachLine}
Stalled lifts: ${platLine}
Bodyweight change: ${bw}\nBlood pressure (latest): ${bpLine}\nEnergy balance (empirical, 7-21d): ${ebLine}

Write a concise end-of-block review in 3-4 short paragraphs. Cover: (1) what the block achieved overall, (2) which muscles and lifts progressed well and which lagged or stalled, (3) what to change for the next block - exercise selection, volume distribution, recovery or nutrition. Explicitly connect the data where you can - protein vs progression, recovery and sleep debt vs performance, BP vs training load. Use the adaptive nutrition numbers above when discussing nutrition: connect the maintenance estimate, intake and weight trend to whether the ${goalPhase} goal is being met. Direct and honest, like a coach planning the next mesocycle.`;
    }
    try {
      const res = await fetch('/.netlify/functions/ai-proxy', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ model:'claude-sonnet-4-6', max_tokens: scope==='week'?750:1100, messages:[{role:'user',content:prompt}] })
      });
      const data = await res.json();
      setPeriodReview(data.content?.[0]?.text || 'Could not generate review. The AI proxy returned no text — check the Netlify function and ANTHROPIC_API_KEY.');
    } catch(e){ setPeriodReview('Error: '+e.message); }
    finally { setPeriodLoading(false); }
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
  const tombstone = (setter, kind) => (predicate) => setter(prev => prev.map(e => {
    if (!predicate(e)) return e;
    const id = e.id || legacyId(e, kind);
    return { ...e, id, deletedAt: Date.now(), updatedAt: Date.now() };
  }));
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
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date || '') || isNaN(new Date(f.date + 'T12:00:00'))) return fail('Enter a valid draw date.');
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
    const base = { date: f.date, label: dateLbl + ' \u00b7 ' + provider, groups, updatedAt: now };
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

  const addNutrition = () => {
    if (!nP && !nC && !nF) return;
    const p = parseFloat(nP) || 0, c = parseFloat(nC) || 0, f = parseFloat(nF) || 0;
    const entry = { date: nDate, protein: p, carbs: c, fat: f, calories: Math.round(p*4 + c*4 + f*9) };
    // Re-entering a date must UPDATE the existing record (keeping its id), not drop it and
    // mint a new one. The dropped record left no tombstone, so the cloud copy had no matching
    // local id, survived the merge, and the old entry reappeared next to the new one.
    setNutrition(prev => {
      const now = Date.now();
      const existing = prev.find(e => !e.deletedAt && e.date === entry.date);
      let arr;
      if (existing) {
        let first = true;
        arr = prev.map(e => {
          if (e.date !== entry.date || e.deletedAt) return e;
          if (e.id === existing.id && first) { first = false; return { ...e, ...entry, id: e.id, deletedAt: undefined, updatedAt: now }; }
          return { ...e, deletedAt: now, updatedAt: now };   // tombstone any same-date duplicates
        });
      } else {
        arr = [{ ...entry, id: newId(), updatedAt: now }, ...prev];
      }
      arr.sort((a,b)=>(a.date<b.date?1:a.date>b.date?-1:0));
      return arr.slice(0, 400);
    });
    setNP(''); setNC(''); setNF(''); setNDate(localToday()); setShowAddNutri(false);
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


  const pullFromCloud = async (code) => {
    const c = code || syncCode || LS.get('sync_code');
    if (!c) return false;
    setCloudStatus('syncing');
    try {
      const res = await fetch('/.netlify/functions/sync-data', { headers: { 'x-sync-code': c } });
      if (!res.ok) { setCloudStatus('error'); return false; }
      const data = await res.json();
      // Snapshot existence is judged primarily on METADATA: any snapshot this app has ever
      // written carries `updatedAt`, so its presence proves a real snapshot regardless of which
      // arrays happen to be populated. The field checks below are belt-and-suspenders for older
      // snapshots — now complete (context, active target, deload skips, whoop workouts were the
      // gaps), so a sparse-but-valid snapshot can never be read as empty and then overwritten.
      const hasSnapshot = data && typeof data === 'object' && (
        data.updatedAt != null || data.config != null || data.activeTarget != null || data.deloadSkips != null ||
        Array.isArray(data.logs) || Array.isArray(data.bodyMetrics) || Array.isArray(data.nutrition) ||
        Array.isArray(data.bpLog) || Array.isArray(data.glucoseLog) || Array.isArray(data.protocolLog) ||
        Array.isArray(data.vitalsLog) || Array.isArray(data.bloodsLog) || Array.isArray(data.contextLog) ||
        Array.isArray(data.measurements) || Array.isArray(data.cardioLog) ||
        Array.isArray(data.whoopHistory) || Array.isArray(data.whoopWorkouts)
      );
      if (hasSnapshot) {
        // Merge cloud with current local so offline sessions are never lost
        const mergedLogs = mergeLogs(logs, Array.isArray(data.logs) ? data.logs : []);
        const mergedBody = mergeByKey(ensureIds(bodyMetricsRaw,'bm'), ensureIds(Array.isArray(data.bodyMetrics)?data.bodyMetrics:[], 'bm'), e => e.id);
        const mergedProt = mergeByKey(ensureIds(protocolLogRaw,'pr'), ensureIds(Array.isArray(data.protocolLog)?data.protocolLog:[], 'pr'), e => e.id);
        const mergedMeas = mergeByKey(ensureIds(measurementsRaw,'ms'), ensureIds(Array.isArray(data.measurements)?data.measurements:[], 'ms'), e => e.id);
        const mergedNutri = mergeByKey(ensureIds(nutritionRaw,'nu'), ensureIds(Array.isArray(data.nutrition)?data.nutrition:[], 'nu'), e => e.id);
        const mergedCardio = mergeByKey(ensureIds(cardioLogRaw,'cd'), ensureIds(Array.isArray(data.cardioLog)?data.cardioLog:[], 'cd'), e => e.id);
        const mergedBP = mergeByKey(ensureIds(bpLogRaw,'bp'), ensureIds(Array.isArray(data.bpLog)?data.bpLog:[], 'bp'), e => e.id);
        const mergedGl = mergeByKey(ensureIds(glucoseLogRaw,'gl'), ensureIds(Array.isArray(data.glucoseLog)?data.glucoseLog:[], 'gl'), e => e.id);
        const mergedCtx = mergeByKey(ensureIds(contextLogRaw,'cx'), ensureIds(Array.isArray(data.contextLog)?data.contextLog:[], 'cx'), e => e.id);
        const mergedVit = mergeByKey(ensureIds(vitalsLogRaw,'vt'), ensureIds(Array.isArray(data.vitalsLog)?data.vitalsLog:[], 'vt'), e => e.id);
        const mergedBld = mergeByKey(ensureIds(bloodsLogRaw,'bld'), ensureIds(Array.isArray(data.bloodsLog)?data.bloodsLog:[], 'bld'), e => e.id);
        const mergedWhoop = mergeHistory(whoopHistory, Array.isArray(data.whoopHistory) ? data.whoopHistory : []);
        // Union merge for deload skips, local wins on collision. A reverted skip is stored as
        // `false` (a tombstone) rather than a deleted key, so the revert now survives the union
        // and propagates to other devices instead of being resurrected from the cloud copy.
        const mergedSkips = { ...(data.deloadSkips || {}), ...deloadSkips };
        skipPush.current = true;
        setDeloadSkips(mergedSkips);
        setLogs(mergedLogs);
        setBodyMetrics(mergedBody);
        setProtocolLog(mergedProt);
        setMeasurements(mergedMeas);
        setNutrition(mergedNutri);
        setCardioLog(mergedCardio);
        setBpLog(mergedBP);
        setGlucoseLog(mergedGl);
        setContextLog(mergedCtx);
        setVitalsLog(mergedVit);
        setBloodsLog(mergedBld);
        setWhoopHistory(mergedWhoop);
        // Only adopt cloud config if it is NEWER than the local one. Previously cloud always
        // won, so a week/block/phase changed offline was silently reverted on the next pull
        // and then pushed back, losing the change permanently.
        const cloudCfgAt = data.config && data.config.updatedAt != null ? data.config.updatedAt : 0;
        const cloudCfgNewer = !!data.config && cloudCfgAt > (cfgUpdatedAt || 0);
        if (cloudCfgNewer) {
          if (data.config.week != null) setWeek(data.config.week);
          if (data.config.recovery != null) setRecovery(data.config.recovery);
          if (data.config.block != null) setBlock(data.config.block);
          if (data.config.highVol != null) setHighVol(data.config.highVol);
          if (data.config.phase != null) setGoalPhase(data.config.phase);
          setCfgUpdatedAt(cloudCfgAt);
        }
        // Locked calorie target: newer setAt wins, same as config. Adopted under skipPush so it
        // does not immediately re-trigger the auto-push effect.
        const cloudTgtAt = data.activeTarget && data.activeTarget.setAt != null ? data.activeTarget.setAt : -1;
        const localTgtAt = activeTarget && activeTarget.setAt != null ? activeTarget.setAt : -1;
        const cloudTgtNewer = !!(data.activeTarget && Number.isFinite(data.activeTarget.cals) && cloudTgtAt > localTgtAt);
        const mergedTarget = cloudTgtNewer ? data.activeTarget : activeTarget;
        if (cloudTgtNewer) setActiveTarget(data.activeTarget);
        // Push the merged superset back so the cloud gets any offline sessions too
        const snapshot = JSON.stringify({ logs: mergedLogs, config: cloudCfgNewer ? { week: data.config.week, recovery: data.config.recovery, block: data.config.block, highVol: data.config.highVol, phase: data.config.phase, updatedAt: cloudCfgAt } : { week, recovery, block, highVol, phase: goalPhase, updatedAt: (cfgUpdatedAt||Date.now()) }, activeTarget: mergedTarget, bodyMetrics: pruneTombstones(mergedBody), protocolLog: pruneTombstones(mergedProt), measurements: pruneTombstones(mergedMeas), nutrition: pruneTombstones(mergedNutri), cardioLog: pruneTombstones(mergedCardio), bpLog: pruneTombstones(mergedBP), glucoseLog: pruneTombstones(mergedGl), contextLog: pruneTombstones(mergedCtx), vitalsLog: pruneTombstones(mergedVit), bloodsLog: pruneTombstones(mergedBld), whoopHistory: mergedWhoop, deloadSkips: mergedSkips, updatedAt: Date.now() });
        // Must await and check: an un-awaited, unchecked POST let the UI report 'synced'
        // while the merged superset was never actually written to the cloud.
        try {
          const pushRes = await fetch('/.netlify/functions/sync-data', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-sync-code': c }, body: snapshot });
          if (!pushRes.ok) { setCloudStatus('error'); return false; }
        } catch (e) { setCloudStatus('error'); return false; }
        setCloudStatus('synced');
        return true;
      }
      setCloudStatus('synced');
      return false;
    } catch (e) { setCloudStatus('error'); return false; }
  };

  const syncNow = async (codeArg) => {
    const c = codeArg || syncCode || LS.get('sync_code');
    if (!c) return;
    setCloudStatus('syncing');
    try {
      const snapshot = JSON.stringify({ logs, config: { week, recovery, block, highVol, phase: goalPhase, updatedAt: (cfgUpdatedAt || 0) }, activeTarget, bodyMetrics: pruneTombstones(bodyMetricsRaw), protocolLog: pruneTombstones(protocolLogRaw), measurements: pruneTombstones(measurementsRaw), nutrition: pruneTombstones(nutritionRaw), cardioLog: pruneTombstones(cardioLogRaw), bpLog: pruneTombstones(bpLogRaw), glucoseLog: pruneTombstones(glucoseLogRaw), contextLog: pruneTombstones(contextLogRaw), vitalsLog: pruneTombstones(vitalsLogRaw), bloodsLog: pruneTombstones(bloodsLogRaw), whoopHistory, deloadSkips, updatedAt: Date.now() });
      const r = await fetch('/.netlify/functions/sync-data', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-sync-code': c }, body: snapshot });
      if (!r.ok) { setCloudStatus('error'); return; }
      setCloudStatus('synced');
    } catch (e) { setCloudStatus('error'); }
  };

  const connectSync = async () => {
    const c = (syncCodeInput || '').trim();
    if (c.length < 8) { alert('Sync code must be at least 8 characters. Pick something private and memorable.'); return; }
    LS.set('sync_code', c); setSyncCode(c); setSyncCodeInput('');
    const found = await pullFromCloud(c);
    if (!found) { await syncNow(c); }
  };

  const disconnectSync = () => { LS.del('sync_code'); setSyncCode(''); setCloudStatus('idle'); };

  // P0.10: the backend derives the storage key from sha256(code) and has no rate limit, so
  // ALL security rests on the code's entropy. Rather than trust the user to pick a long random
  // one, generate 120 bits of it. Manual entry stays (to restore an existing code on a new
  // device), but "Generate" makes the safe path the easy one.
  const genSyncCode = () => {
    try {
      const b = new Uint8Array(15); crypto.getRandomValues(b);
      setSyncCodeInput(Array.from(b).map(x => x.toString(16).padStart(2,'0')).join('')); // 30 hex chars
    } catch(_) { alert('Secure random generator unavailable in this browser — type a long random code instead (16+ characters).'); }
  };

  // Pull cloud data once on load if a sync code is stored
  useEffect(() => { const c = LS.get('sync_code'); if (c) pullFromCloud(c); }, []);

  // Debounced auto-push whenever training data changes
  useEffect(() => {
    if (!syncCode) return;
    clearTimeout(syncTimer.current);
    if (!syncMounted.current) { syncMounted.current = true; return; }
    if (skipPush.current) { skipPush.current = false; return; }
    const snapshot = JSON.stringify({ logs, config: { week, recovery, block, highVol, phase: goalPhase, updatedAt: (cfgUpdatedAt || 0) }, activeTarget, bodyMetrics: pruneTombstones(bodyMetricsRaw), protocolLog: pruneTombstones(protocolLogRaw), measurements: pruneTombstones(measurementsRaw), nutrition: pruneTombstones(nutritionRaw), cardioLog: pruneTombstones(cardioLogRaw), bpLog: pruneTombstones(bpLogRaw), glucoseLog: pruneTombstones(glucoseLogRaw), contextLog: pruneTombstones(contextLogRaw), vitalsLog: pruneTombstones(vitalsLogRaw), bloodsLog: pruneTombstones(bloodsLogRaw), whoopHistory, deloadSkips, updatedAt: Date.now() });
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
    const top = ss => (ss && ss.length) ? Math.max(...ss.map(s => epley(s.weight||0, s.reps||0))) : 0;
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
  const nutriCoach = useMemo(() => {
    const dayMs=86400000, parse=d=>new Date(d).getTime();
    const latestW=(bodyMetrics&&bodyMetrics.length&&bodyMetrics[0].weight)?bodyMetrics[0].weight:null;
    if(!latestW) return { ok:false, reason:'Log your bodyweight to unlock smart targets.' };
    const allD=[];
    (nutrition||[]).forEach(e=>{const t=parse(e.date); if(!isNaN(t)) allD.push(t);});
    (bodyMetrics||[]).forEach(e=>{const t=parse(e.date); if(!isNaN(t)) allD.push(t);});
    // Anchor to NOW, not the newest supplied date: a future-dated record previously became
    // the anchor and sailed through the freshness test with a negative age.
    const nowTs=Date.now();
    const anchor=Math.min(allD.length?Math.max(...allD):nowTs, nowTs);
    // Targets must expire. Anchoring the 14-day window to the newest LOGGED date meant that
    // if the user stopped logging two months ago, the coach still returned ok:true with
    // confident-looking targets derived entirely from stale data.
    const anchorAgeDays = (Date.now()-anchor)/dayMs;
    if (anchorAgeDays > 10) return { ok:false, reason:'stale', ageDays:Math.round(anchorAgeDays) };
    // Each REQUIRED input must be fresh independently. A fresh food log paired with a
    // two-month-old bodyweight previously produced confident targets built on a stale weight.
    const _lw = (bodyMetrics||[])[0];
    // Compare on LOCAL CALENDAR DATES, not raw timestamps. Weigh-ins are stored at noon UTC
    // (`...T12:00:00Z`), so a weigh-in logged this morning in BST is timestamped a few hours
    // in the FUTURE relative to now — which made (now - ts) negative and tripped the
    // "weightAgeDays < 0" guard, falsely rejecting today's fresh weight as unusable.
    const _lwDateStr = _lw && _lw.date ? String(_lw.date).slice(0,10) : null;
    const _todayStr = localToday();
    const weightAgeDays = _lwDateStr
      ? Math.max(0, Math.round((new Date(_todayStr+'T12:00:00') - new Date(_lwDateStr+'T12:00:00')) / dayMs))
      : Infinity;
    if (weightAgeDays > 10) return { ok:false, reason:'stale_weight', ageDays:isFinite(weightAgeDays)?weightAgeDays:null };
    const winStart=anchor-21*dayMs;   // 21d not 14d: more weigh-ins dilute day-to-day water swings
    // Today's log is almost never finished when the card is read, so including it drags
    // avgIntake down and inflates the maintenance estimate. Exclude the current date entirely;
    // it re-enters the window tomorrow when it is complete.
    const nutWinRaw=(nutrition||[]).filter(e=>{
      const t=parse(e.date);
      if(isNaN(t)||!(e.calories>0)) return false;
      if((e.date||'').slice(0,10)===_todayStr) return false;
      return t>=winStart&&t<=nowTs;
    });
    // Partial-day guard: days logged well below the window median (e.g. 1335 vs ~2150) are
    // almost always incomplete logging, not genuine low-intake days. They deflate avgIntake,
    // which deflates the empirical TDEE — the one number everything else trusts. Exclude days
    // under 65% of the median. Needs >=5 days to compute a stable median; below that keep all.
    const nutWin=(()=>{ 
      if(nutWinRaw.length<5) return nutWinRaw;
      const sorted=nutWinRaw.map(e=>e.calories).sort((a,b)=>a-b);
      const med=sorted[Math.floor(sorted.length/2)];
      const kept=nutWinRaw.filter(e=>e.calories>=med*0.65);
      return kept.length>=5?kept:nutWinRaw;   // never guard ourselves below the data floor
    })();
    const wWin=(bodyMetrics||[]).filter(e=>{const t=parse(e.date); return !isNaN(t)&&t>=winStart&&t<=nowTs&&e.weight>0;}).sort((a,b)=>parse(a.date)-parse(b.date));
    let tdee=null, conf='low', spanDays=0, avgIntake=null, ratePerWk=null;
    if(nutWin.length>=7&&wWin.length>=2){
      avgIntake=Math.round(nutWin.reduce((s,e)=>s+e.calories,0)/nutWin.length);
      // Endpoint-to-endpoint weight change is spike-sensitive: a single water-inflated reading
      // at the START of the window (very common on tren) fabricates a huge apparent deficit and
      // inflates TDEE. Use least-squares regression across ALL weigh-ins in the window, which is
      // robust to individual spikes; fall back to averaged endpoints when data is sparse.
      const pts = wWin.map(e => ({ t: parse(e.date)/dayMs, w: e.weight }));
      const wA=wWin[0], wB=wWin[wWin.length-1];
      spanDays=(parse(wB.date)-parse(wA.date))/dayMs;
      if(spanDays>=10){
        // BLOCK-AVERAGED ENDS, matching the headline bwRate method. A trailing regression
        // (Theil-Sen or least-squares) collapses to ~0 when the window contains a rise then a
        // fall, because the up-pairs and down-pairs cancel — which fabricated an "at
        // maintenance" verdict while the scale was falling steadily. Averaging a block of
        // readings at each END cannot cancel that way, and it still suppresses single-day
        // water noise. Needs >=3 readings per block to beat a plain endpoint read.
        let slopePerDay = null;
        {
          const kk = Math.min(7, Math.floor(pts.length/2));
          if (kk >= 3) {
            const head = pts.slice(0, kk), tail = pts.slice(-kk);
            const hW = head.reduce((a,p)=>a+p.w,0)/kk, tW = tail.reduce((a,p)=>a+p.w,0)/kk;
            const hT = head.reduce((a,p)=>a+p.t,0)/kk, tT = tail.reduce((a,p)=>a+p.t,0)/kk;
            if (tT - hT > 0) slopePerDay = (tW - hW) / (tT - hT);
          }
        }
        if (slopePerDay === null) {
          // averaged endpoints (up to 3 readings each end) instead of single points
          const k=Math.min(3, Math.floor(pts.length/2)) || 1;
          const headW=pts.slice(0,k).reduce((s,p)=>s+p.w,0)/k;
          const tailW=pts.slice(-k).reduce((s,p)=>s+p.w,0)/k;
          const headT=pts.slice(0,k).reduce((s,p)=>s+p.t,0)/k;
          const tailT=pts.slice(-k).reduce((s,p)=>s+p.t,0)/k;
          slopePerDay=(tailT-headT)>0 ? (tailW-headW)/(tailT-headT) : 0;
        }
        ratePerWk=slopePerDay*7;
        // Sanity-bound the rate. |rate| > 1.2% of bodyweight per week is not real tissue change
        // over this timescale - it's a water swing landing at a window edge. Treat TDEE as
        // unreliable rather than manufacturing a 1400 or 3800 maintenance from it.
        const rateFrac = latestW>0 ? Math.abs(ratePerWk)/latestW : 0;
        if (rateFrac > 0.012) { tdee=null; }
        else { tdee=Math.round(avgIntake-(slopePerDay*7700)); }
        conf=(nutWin.length>=14&&spanDays>=18)?'high':(nutWin.length>=10&&spanDays>=14)?'medium':'low';
      }
    }
    if(tdee===null) {
      // Two different reasons TDEE can be null: genuinely too little data, OR we DID have data
      // but the weight trend was too noisy to trust (rate rejected above). Tell them which.
      if (nutWin.length>=7 && wWin.length>=2 && ratePerWk!=null) {
        return { ok:false, reason:'noisy', ratePerWk:+ratePerWk.toFixed(2), avgIntake, foodDays:nutWin.length };
      }
      return { ok:false, partial:true, foodDays:nutWin.length, weighIns:wWin.length };
    }
    tdee=Math.max(1400,Math.min(5500,tdee));
    // TREND WEIGHT, not the last reading. A single water-heavy morning previously shifted
    // protein by ~2g and the calorie floor by ~22 kcal for no physiological reason.
    const _recentW=(bodyMetrics||[]).filter(e=>e&&e.weight>0&&(nowTs-parse(e.date))<=7*dayMs).map(e=>e.weight);
    const trendW=_recentW.length>=3 ? +(_recentW.reduce((a,b)=>a+b,0)/_recentW.length).toFixed(1) : latestW;
    const W=trendW, proteinG=Math.round(2.2*W), fatG=Math.round(0.7*W);
    let targetRatePct, targetCals;
    // 0.35%/wk, not 0.5%. At ~90kg a 0.5% deficit is ~483 kcal/day, which on an enhanced
    // protocol with protein already at ~2.2g/kg is more aggressive than needed and risks
    // lean mass. 0.35%/wk (~338 kcal) matches the rate that is demonstrably working.
    if(goalPhase==='cut'){ targetRatePct=0.35; targetCals=tdee-Math.round((0.35/100*W*7700)/7); }
    else if(goalPhase==='bulk'){ targetRatePct=0.25; targetCals=tdee+Math.round((0.25/100*W*7700)/7); }
    else { targetRatePct=0; targetCals=tdee; }
    // The 22 kcal/kg floor is a crude guardrail, not a validated threshold, and when it binds
    // it silently replaces the goal the user selected: a "0.35%/wk cut" can actually prescribe
    // ~0.20%/wk. Surface it rather than let the label lie.
    const kcalFloor=Math.round(W*22);
    const floorLimited=targetCals<kcalFloor;
    if(floorLimited) targetCals=kcalFloor;
    const actualDeficit=tdee-targetCals;
    const impliedRatePct=+((actualDeficit*7/7700)/W*100).toFixed(2);
    const carbG=Math.max(0, Math.round((targetCals-proteinG*4-fatG*9)/4));
    let adjust=null;
    if(goalPhase==='cut'&&ratePerWk!=null){
      const actPct=ratePerWk/W*100;
      // ADHERENCE BEFORE PRESCRIPTION. targetCals is already derived from measured maintenance,
      // so it fully accounts for a stall. Recommending a further cut on top double-counts and
      // blames the target for what is usually an intake gap: stalling while eating 283 kcal
      // OVER target is not evidence the target is too high. Only consider changing the
      // prescription once intake is actually close to it.
      const overBy = (avgIntake!=null) ? avgIntake-targetCals : null;
      if(overBy!=null && overBy>75){
        adjust={dir:'gap',over:Math.round(overBy)};
      } else if(actPct>-0.15){
        const k=150; adjust={dir:'down',kcal:k,carb:Math.round(k*0.75/4),fat:Math.round(k*0.25/9)};
      } else if(actPct<-0.75){
        const k=150; adjust={dir:'up',kcal:k,carb:Math.round(k/4),fat:0};
      } else adjust={dir:'hold'};
    }
    let cycle=null, dayTargets=null;
    if(carbG>0){
      // Training days come from the ACTUAL program schedule (number of sessions defined),
      // not from counting logged workouts in the last 7 days (which under-counts when logging is sparse).
      const scheduledTrainDays = Object.keys(SESSIONS).length; // 4-day split: U1,U2,U3,Lower
      const trainDays=Math.min(6,Math.max(2,scheduledTrainDays||4)), restDays=7-trainDays, weekly=carbG*7;
      const lowCarb=Math.round(carbG*0.6), highCarb=restDays>0?Math.round((weekly-lowCarb*restDays)/trainDays):carbG;
      cycle={trainDays,restDays,lowCarb:Math.max(0,lowCarb),highCarb:Math.max(0,highCarb)};
      // per-day-type calories: protein+fat constant, carbs vary
      const baseKcal=proteinG*4+fatG*9;
      dayTargets={
        train:{cals:Math.round(baseKcal+cycle.highCarb*4),carb:cycle.highCarb,protein:proteinG,fat:fatG},
        rest:{cals:Math.round(baseKcal+cycle.lowCarb*4),carb:cycle.lowCarb,protein:proteinG,fat:fatG}
      };
    }
    // SANITY GUARD. If the computed target wildly contradicts what the user is actually eating
    // while their weight is already moving the intended way, the underlying rate estimate is
    // almost certainly corrupted by water noise. Showing "eat 3867" to someone eating 2100 and
    // losing weight is worse than showing nothing.
    const implausible = (() => {
      if (avgIntake == null || !targetCals) return false;
      const gap = targetCals - avgIntake;
      if (goalPhase === 'cut'  && gap >  600) return true;   // cut telling you to eat far MORE
      if (goalPhase === 'bulk' && gap < -600) return true;   // bulk telling you to eat far LESS
      if (Math.abs(gap) > 1000) return true;                 // absurd in any phase
      // Maintenance sanity: a real maintenance sits within a plausible band of actual intake.
      // A 1400 or 3800 estimate while eating ~2050 means the rate is water-corrupted.
      if (tdee != null && avgIntake > 0) {
        const r = tdee / avgIntake;
        if (r < 0.7 || r > 1.4) return true;
      }
      // Rate direction must match the phase: a CUT should not be reporting weight GAIN
      // (and vice-versa) - that only happens when noise dominates the trend.
      if (goalPhase === 'cut'  && ratePerWk != null && ratePerWk >  0.15) return true;
      if (goalPhase === 'bulk' && ratePerWk != null && ratePerWk < -0.15) return true;
      return false;
    })();
    if (implausible) {
      // When the trend is too water-noisy to trust BUT intake has held weight roughly flat,
      // current intake IS a sound maintenance estimate. Suggest a real cut/bulk target off it
      // (0.4%/wk ≈ 440 kcal at 89kg) rather than a token -100 that produces no meaningful loss.
      const _adjFrac = goalPhase==='cut' ? -0.004 : goalPhase==='bulk' ? 0.0025 : 0;
      const _adjKcal = Math.round(_adjFrac * latestW * 1100);   // 7700 kcal/kg ÷ 7 days ≈ 1100
      const _sugg = Math.round(avgIntake + _adjKcal);
      const _suggCarb = Math.max(0, Math.round((_sugg - proteinG*4 - fatG*9)/4));  // same split as the ok-path
      // Train/rest carb cycle — identical formula to the ok-path: protein+fat fixed, carbs move,
      // rest days at 60% of the daily carb average, remainder pushed onto training days.
      let _cyc=null, _dayT=null;
      if(_suggCarb>0){
        const _tD=Math.min(6,Math.max(2,Object.keys(SESSIONS).length||4)), _rD=7-_tD, _wk=_suggCarb*7;
        const _lo=Math.max(0,Math.round(_suggCarb*0.6)), _hi=_rD>0?Math.max(0,Math.round((_wk-_lo*_rD)/_tD)):_suggCarb;
        const _base=proteinG*4+fatG*9;
        _cyc={trainDays:_tD,restDays:_rD,lowCarb:_lo,highCarb:_hi};
        _dayT={ train:{cals:Math.round(_base+_hi*4),carb:_hi,protein:proteinG,fat:fatG},
                rest:{cals:Math.round(_base+_lo*4),carb:_lo,protein:proteinG,fat:fatG} };
      }
      return { ok:false, reason:'implausible', tdee, avgIntake, atMaint:true,
               ratePerWk: ratePerWk!=null?+ratePerWk.toFixed(2):null,
               suggested: _sugg, proteinG, fatG, carbG: _suggCarb, cycle:_cyc, dayTargets:_dayT };
    }
    return { ok:true, tdee, conf, avgIntake, ratePerWk, spanDays:Math.round(spanDays), targetCals, proteinG, fatG, carbG, targetRatePct, adjust, cycle, dayTargets, phase:goalPhase,
             floorLimited, kcalFloor, impliedRatePct, trendW:W };
  }, [logs, nutrition, bodyMetrics, goalPhase]);
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
  const totalSets=Object.values(setData).reduce((a,s)=>a+s.length,0);
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
    const e1 = (s) => epley(totalLoad(eid, s.weight, bwAt, _today), s.reps);
    const best=sets.reduce((a,s)=> e1(s) > e1(a) ? s : a, sets[0]);
    return {name:(mapped&&mapped.name)||ex.name, orm:e1(best)};
  }).filter(Boolean):[];
  const progHist=progEx?getPrevHist(progEx,logs,20):[];
  const _metricVal=(sets, dateStr)=>{ if(!sets||!sets.length) return 0; if(progMetric==='weight') return Math.max(...sets.map(s=>s.weight||0)); if(progMetric==='volume') return sets.reduce((a,s)=>a+(s.weight||0)*(s.reps||0),0); return Math.max(...sets.map(s=>epley(totalLoad(progEx, s.weight, bwAt, dateStr), s.reps||0))); };
  const progChartData=progHist.slice().reverse().map(h=>({x:fmtShort(h.date),y:Math.round(_metricVal(h.sets, h.date)),t:new Date(h.date).getTime()}));
  const prWeight=progChartData.length?Math.max(...progChartData.map(d=>d.y)):0;
  const lastWeight=progChartData.length?progChartData[progChartData.length-1].y:0;
  // 6.7 (additive, read-only): lifetime best e1RM per MOVEMENT, aggregated across every slot the
  // movement appears in (grouped by name). This is the cross-slot PR view the audit wanted, built
  // WITHOUT touching getProgRec/getPrevHist — the progression engine stays slot-keyed exactly as
  // before, so nothing here can affect prescribed loads. Deload sessions excluded from PRs.
  const movementPRs = useMemo(() => {
    try {
      const byName = {};
      for (const l of (logs||[])) {
        // isDeloadLog is local to computeDeloadRebound and not in scope here. Calling it threw
        // inside this try/catch, so the Lifetime movement PRs card silently never rendered.
        if (l.deload === true || (l.deload == null && DLW.has(l.week))) continue;
        for (const ex of (l.exercises||[])) {
          if (!ex || !Array.isArray(ex.sets) || !ex.sets.length) continue;
          const pid = ex.origId || ex.id;
          let best = 0;
          for (const s of ex.sets) { if (!s || !(s.reps > 0)) continue; const e = epley(totalLoad(pid, s.weight, bwAt, l.date), s.reps); if (e > best) best = e; }
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
      if (tags.includes('travel'))    evs.push({ t, label:'trip',  color:'#4a9eff' });
      if (tags.includes('poorsleep')) evs.push({ t, label:'sleep', color:'#f0a020' });
    }
    // Deload weeks, taken from logged sessions so a trained-through week is not shaded.
    const dl = (logs||[]).filter(l => l && l.deload === true).map(l => new Date(l.date).getTime())
      .filter(t => !isNaN(t)).sort((a,b) => a-b);
    const dayMs = 86400000;
    let i = 0;
    while (i < dl.length) {
      let j = i;
      while (j+1 < dl.length && dl[j+1] - dl[j] <= 4*dayMs) j++;
      evs.push({ t: dl[i] - dayMs, tEnd: dl[j] + dayMs, color:'#ff8c00' });
      i = j + 1;
    }
    return evs.slice(0, 40);
  }, [contextLog, logs]);

  // WEEKLY LOCKED TARGET.
  //
  // The maintenance estimate should update continuously; the PRESCRIPTION should not. A single
  // weigh-in moves for water, sodium, glycogen, bowel content and training inflammation, and
  // none of those are reasons to eat differently tomorrow. Previously the target recalculated
  // on every food log and every weigh-in, so it drifted (1826 -> 1830 -> 1927) with no check-in
  // and no way to tell a real change from noise.
  //
  // Three separate numbers, as a coached system would: a live estimate (information), a
  // candidate for the next check-in (projection), and an active target locked for the week
  // (the actual instruction). NOTE: activeTarget is declared far earlier — the cloud-sync
  // effect lists it as a dependency, and a deps array is evaluated during render.
  const targetLock = useMemo(() => {
    if (!nutriCoach) return null;
    const dayMs = 86400000, now = Date.now();
    const hasLock = activeTarget && Number.isFinite(activeTarget.cals);
    // A locked target is a committed weekly instruction and must survive the engine losing
    // confidence — that is precisely when it matters most. When !ok there is no trustworthy
    // candidate to propose, so surface the active lock alone (no auto-suggestion, no delta)
    // rather than returning null and wiping the whole prescription.
    if (!nutriCoach.ok) {
      if (!hasLock) return null;
      const ageDays = Math.floor((now - (activeTarget.setAt || 0)) / dayMs);
      return { active: activeTarget, candidate: null, ageDays, due: ageDays >= 7, delta: null, reason: 'nocand' };
    }
    const cand = {
      cals: nutriCoach.targetCals, protein: nutriCoach.proteinG,
      fat: nutriCoach.fatG, carb: nutriCoach.carbG, tdee: nutriCoach.tdee,
    };
    if (!hasLock) {
      return { active: null, candidate: cand, ageDays: null, due: true, delta: null, reason: 'first' };
    }
    const ageDays = Math.floor((now - (activeTarget.setAt || 0)) / dayMs);
    const raw = cand.cals - activeTarget.cals;
    // Hysteresis: below ~50 kcal the difference is inside the noise of the estimate itself.
    // Cap a single weekly move at 100 kcal so one odd week cannot swing the prescription.
    const meaningful = Math.abs(raw) >= 50;
    const capped = Math.max(-100, Math.min(100, raw));
    return {
      active: activeTarget, candidate: cand, ageDays,
      due: ageDays >= 7,
      delta: meaningful ? Math.round(capped) : 0,
      reason: !meaningful ? 'stable' : raw > 0 ? 'up' : 'down',
    };
  }, [nutriCoach, activeTarget]);
  // The engine proposes; the athlete decides. Its cut rate is deliberately conservative, so
  // the proposed figure is often slower than someone with the protein intake and training to
  // support a faster rate actually wants. Locking an explicit number keeps the weekly-hold
  // discipline while leaving the decision where it belongs.
  const [lockCals, setLockCals] = useState('');
  const acceptTarget = (explicit) => {
    if (!targetLock) return;
    // When the engine is unconfident there is no candidate, but the athlete may still re-lock a
    // manual figure. Fall back to the active lock's macros in that case.
    const c = targetLock.candidate || targetLock.active;
    if (!c) return;
    const proposed = targetLock.active && targetLock.delta != null
      ? targetLock.active.cals + targetLock.delta
      : c.cals;
    const raw = Number.isFinite(explicit) ? explicit : proposed;
    // Never lock below the safety floor, however it was entered.
    const floor = nutriCoach && nutriCoach.kcalFloor ? nutriCoach.kcalFloor : 0;
    const cals = Math.max(floor, Math.round(raw));
    // Macros stay coherent with whatever figure is adopted: protein and fat held, carbs absorb.
    const carb = Math.max(0, Math.round((cals - c.protein*4 - c.fat*9)/4));
    setActiveTarget({ cals, protein:c.protein, fat:c.fat, carb, tdee:c.tdee,
                      manual: Number.isFinite(explicit), setAt: Date.now() });
    setLockCals('');
  };

  // Effective prescription. The locked target, when one exists, is what the athlete has
  // actually committed to for the week — so it, not the live engine figure, must drive the
  // daily card. It is a WEEKLY AVERAGE and gets cycled into training and rest days using the
  // same rule as the engine: protein and fat fixed daily, carbs carrying the difference,
  // rest days at 60% of the average carb figure.
  const effTargets = useMemo(() => {
    if (!nutriCoach) return null;
    const locked = activeTarget && Number.isFinite(activeTarget.cals) ? activeTarget : null;
    // Without a committed lock, only a confident live estimate can drive the card.
    if (!locked) {
      if (!nutriCoach.ok) return null;
      return { source:'engine', weekly:nutriCoach.targetCals, cycle:nutriCoach.cycle,
               dayTargets:nutriCoach.dayTargets, protein:nutriCoach.proteinG,
               fat:nutriCoach.fatG, carb:nutriCoach.carbG };
    }
    // A target IS locked: it drives the daily card whether or not the live estimate is
    // confident this week. When the engine is unconfident nutriCoach.cycle can be absent, so
    // the train/rest split falls back to the scheduled session count below.
    const protein = locked.protein != null ? locked.protein : nutriCoach.proteinG;
    const fat = locked.fat != null ? locked.fat : nutriCoach.fatG;
    const carb = Math.max(0, Math.round((locked.cals - protein*4 - fat*9)/4));
    const trainDays = (nutriCoach.cycle && nutriCoach.cycle.trainDays) || (Object.keys(SESSIONS).length || 4);
    const restDays = 7 - trainDays;
    const weeklyCarb = carb * 7;
    const lowCarb = Math.max(0, Math.round(carb * 0.6));
    const highCarb = restDays > 0 ? Math.max(0, Math.round((weeklyCarb - lowCarb*restDays)/trainDays)) : carb;
    const base = protein*4 + fat*9;
    return {
      source:'locked', weekly:locked.cals, protein, fat, carb,
      cycle:{ trainDays, restDays, lowCarb, highCarb },
      dayTargets:{
        train:{ cals:Math.round(base + highCarb*4), carb:highCarb, protein, fat },
        rest: { cals:Math.round(base + lowCarb*4),  carb:lowCarb,  protein, fat },
      },
    };
  }, [nutriCoach, activeTarget]);

  // MEAL DISTRIBUTION. Reference, not tracking: the daily card says eat 2597 kcal with 319g
  // of carbs, and the obvious next question is when. Derived from whichever target is in
  // force so it can never disagree with the number above it.
  //
  // Distribution rules: protein spread near-evenly across four feeds, since per-meal protein
  // matters more than daily total for muscle protein synthesis; fat kept away from the
  // pre-workout window because it slows gastric emptying; carbohydrate concentrated around
  // training on training days, where it does the most for performance and partitioning.
  const [mealSlot, setMealSlot] = usePersistentState('meal_slot', 'pm');
  const mealPlan = useMemo(() => {
    if (!effTargets || !effTargets.dayTargets) return null;
    const build = (dt, isTrain) => {
      const P = dt.protein, C = dt.carb, F = dt.fat;
      // Fractions per meal: [protein, carb, fat]
      const layout = !isTrain
        ? [ ['Breakfast',        .28, .25, .30],
            ['Lunch',            .28, .30, .35],
            ['Snack',            .16, .15, .10],
            ['Dinner',           .28, .30, .25] ]
        : (mealSlot === 'am'
          // 5am session: little runway before training, so carbs land after it.
          ? [ ['Pre (5am, small)', .10, .12, .00],
              ['Post-workout',     .30, .33, .10],
              ['Lunch',            .30, .28, .40],
              ['Dinner',           .30, .27, .50] ]
          // 8pm session: fuel across the day, biggest carb feed pre-training.
          : [ ['Breakfast',        .25, .18, .35],
              ['Lunch',            .25, .22, .40],
              ['Pre-workout',      .20, .30, .05],
              ['Post / dinner',    .30, .30, .20] ]);
      return layout.map(([name, p, c, f]) => {
        const prot = Math.round(P*p), carb = Math.round(C*c), fat = Math.round(F*f);
        return { name, protein:prot, carb, fat, cals: prot*4 + carb*4 + fat*9 };
      });
    };
    return { train: build(effTargets.dayTargets.train, true),
             rest:  build(effTargets.dayTargets.rest,  false) };
  }, [effTargets, mealSlot]);

  // HYDRATION + ELECTROLYTE REFERENCE.
  //
  // Water is held near 4 L on BOTH days: a constant habit is easier to keep than a variable
  // one, and total intake is not the lever that matters here. What changes is the electrolyte
  // load, for two different reasons. Training days lose roughly a litre of sweat carrying
  // ~1 g of sodium. Rest days lose none — but drinking 4 L without sweating dilutes plasma
  // sodium, so rest-day sodium is REDUCED relative to training yet kept well above zero
  // rather than dropped proportionally.
  //
  // Potassium is deliberately food-led and the supplemental dose is conservative. Renal
  // clearance is what protects against hyperkalaemia, and this user's cystatin C was flagged
  // above range (1.08 vs 0.58-1.05) even with a satisfactory eGFR. UK/EU potassium tablets
  // are capped at 99 mg for exactly this reason, so grams of citrate powder deserve caution.
  //
  // Elemental yields: sodium citrate (trisodium dihydrate) 235 mg Na/g, grey/pink sea salt ~381 mg
  // Na/g, potassium citrate (tripotassium monohydrate) 362 mg K/g.
  const hydration = useMemo(() => {
    const w = (nutriCoach && nutriCoach.trendW) ? nutriCoach.trendW
            : (bodyMetrics && bodyMetrics[0] && bodyMetrics[0].weight) ? bodyMetrics[0].weight : null;
    if (!w) return null;
    const NA_CIT = 235, SALT = 381, K_CIT = 362;
    const mk = (naCit, salt, kCit, tau, vol) => ({
      naCit, salt, kCit, tau, vol,
      na: Math.round(naCit*NA_CIT + salt*SALT),
      k:  Math.round(kCit*K_CIT),
    });
    // Training-day phases. Taurine loads entirely pre-workout because it peaks roughly
    // 60-90 min after ingestion, so taking it beforehand covers the session. Sodium is
    // weighted intra, where the sweat loss actually happens. Potassium is weighted to the
    // rest of the day: it is intracellular, there is no acute intra-session requirement,
    // and spreading it is easier on both gut and kidney. The three phases sum to exactly
    // the same totals as the single-figure version.
    const phases = [
      { k:'pre',   label:'Pre',        vol:'500 ml',  ...mk(0.6, 0.6, 0,   2, '') },
      { k:'intra', label:'Intra',      vol:'750 ml',  ...mk(0.8, 0.8, 0.4, 0, '') },
      { k:'rest',  label:'Rest of day',vol:'~2.75 L', ...mk(0.6, 0.5, 0,   0, '') },
    ];
    return {
      litres: 4,
      train: mk(2.0, 1.9, 0.4, 2, '1 L pre + intra'),
      rest:  mk(0.8, 0.7, 0,   1, 'across the day'),
      phases,
      foodNa: 2200, foodK: 2800,
    };
  }, [nutriCoach, bodyMetrics]);

  const stalls=useMemo(()=>computeStalls(logs,3,bwAt),[logs,bwAt]);
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
  // --- Body dashboard derived data ---
  // Privacy dashboard: approximate on-device storage per category. Fully wrapped — a display
  // panel must never be able to crash the app, and it reads localStorage which can throw.
  const storageBreakdown = useMemo(() => {
    try {
      const cat = {
        'Training': ['dp_logs','dp_wip','dp_cfg','deload_skips','active_target','schema_v','cfg_updated_at'],
        'Body & health': ['body_metrics','body_measurements','bloods_log','bp_log','glucose_log','vitals_log','protocol_log','cardio_log','nutrition_log','context_log','bloods_draft'],
        'Check-in photos': ['checkin_photos'],
        'WHOOP': ['whoop_access_token','whoop_refresh_token','whoop_expires_at','whoop_cache','whoop_history','whoop_workouts'],
        'Sync & keys': ['sync_code'],
        'App settings': ['meal_slot','body_sec_closed','prog_grp_closed','meal_day','meal_time'],
      };
      const sizeOf = k => { try { const v = localStorage.getItem(k); return v==null ? 0 : new Blob([v]).size; } catch(_) { return 0; } };
      const known = new Set(Object.values(cat).flat());
      const rows = Object.entries(cat).map(([name, keys]) => ({ name, bytes: keys.reduce((a,k)=>a+sizeOf(k),0) }));
      let other = 0;
      for (let i=0;i<localStorage.length;i++){ const k=localStorage.key(i); if (k && !known.has(k)) other += sizeOf(k); }
      if (other > 0) rows.push({ name:'Other', bytes: other });
      const total = rows.reduce((a,r)=>a+r.bytes,0);
      return { rows: rows.filter(r=>r.bytes>0).sort((a,b)=>b.bytes-a.bytes), total };
    } catch(e) { try{console.error('storageBreakdown failed',e);}catch(_){} return { rows: [], total: 0 }; }
  }, [view, logs, bodyMetrics, checkins]);
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
  const protSeries=useMemo(()=>nutrition.slice(0,21).reverse().map(n=>({x:fmtShort(n.date),y:n.protein,t:new Date(n.date).getTime()})),[nutrition]);
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
    const now=Date.now(); const by={};
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
  const calStats = useMemo(() => {
    const _now=Date.now(); const _by={};
    (nutrition||[]).forEach(n=>{ const d=(n.date||'').slice(0,10); if(!d) return; const a=(_now-new Date(d+'T12:00:00').getTime())/86400000; if(a>=0&&a<=7&&!(d in _by)) _by[d]=n; });
    const l7 = Object.values(_by); if (!l7.length) return null;
    const avgCal = Math.round(l7.reduce((a,n)=>a+(n.calories||0),0)/l7.length);
    const avgP = Math.round(l7.reduce((a,n)=>a+(n.protein||0),0)/l7.length);
    // Compare the 7-day average (which blends training + rest days) against the BLENDED weekly
    // target from Smart targets (~1990), NOT the training-day-only 2250 — otherwise it always
    // reads ~250 under even when eating exactly to plan. Fall back to 1990 if Smart isn't ready.
    // Single source of truth: a committed lock is what the athlete is eating to, so the delta is
    // measured against it. Only fall back to the live engine / suggestion when nothing is locked.
    const calTgt = (activeTarget && Number.isFinite(activeTarget.cals)) ? activeTarget.cals
                 : (nutriCoach && nutriCoach.ok && nutriCoach.targetCals) ? nutriCoach.targetCals
                 : (nutriCoach && nutriCoach.suggested) ? nutriCoach.suggested
                 : 1990;
    const pTgt = (nutriCoach && nutriCoach.proteinG) ? nutriCoach.proteinG : 210;
    return { avgCal, avgP, calTgt, pTgt, calDelta: avgCal-calTgt, pDelta: avgP-pTgt, n:l7.length };
  }, [nutrition, nutriCoach, activeTarget]);

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
        note: stalls.stalled.length ? stalls.stalled.slice(0,2).map(s=>s.name).join(', ') : 'everything progressing' });
    }

    if (!items.length) return null;
    const misses = items.filter(i=>i.verdict==='miss');
    return { items, sessions:wk.length, misses: misses.map(i=>i.k) };
  }, [logs, actualVol, calStats, bwRate, bpStats, stalls, goalPhase]);

  const plateRes=calcPlates(plateTgt);
  const warmups=calcWarmups(warmWt);

  return (
    <div className="app">
      {storageFail && (
        <div style={{position:'sticky',top:0,zIndex:9999,background:'rgba(255,68,68,0.14)',borderBottom:'1px solid rgba(255,68,68,0.5)',color:'#ff9a9a',fontFamily:"'JetBrains Mono',monospace",fontSize:11,padding:'8px 12px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:10}}>
          <span>Storage write failed ({storageFail}). Your device storage may be full or blocked — recent changes might not survive a reload. Export a backup, then free space.</span>
          <button onClick={()=>setStorageFail(null)} style={{background:'none',border:'1px solid rgba(255,68,68,0.5)',color:'#ff9a9a',borderRadius:6,padding:'3px 8px',cursor:'pointer',flexShrink:0}}>Dismiss</button>
        </div>
      )}
      {timerOn && (
        <div className="timer-ov">
          <div className="t-lbl">Rest Period</div>
          <div className="t-ring">
            <svg width="200" height="200" viewBox="0 0 200 200">
              <circle className="t-track" cx="100" cy="100" r={R}/>
              <circle className="t-fill" cx="100" cy="100" r={R} strokeDasharray={CIRC} strokeDashoffset={dashOff}/>
            </svg>
            <div className="t-ctr"><div className="t-secs">{fmt(timerSecs)}</div><div className="t-unit">remaining</div></div>
          </div>
          <div className="t-msg">{timerMsg}</div>
          <button className="t-skip" onClick={skipTimer}>Skip Rest</button>
        </div>
      )}

      {editBody && editBodyDraft && (() => {
        const cfg = BODY_TYPES[editBody.type];
        const dv = cfg.dateOnly ? (editBodyDraft.date||'') : (editBodyDraft.date||'').slice(0,10);
        const setDate = (val) => setEditBodyDraft(d => ({...d, date: cfg.dateOnly ? val : `${val}T12:00:00.000Z`}));
        return (
          <div className="modal-ov">
            <div className="modal">
              <div className="modal-title">{cfg.title}</div>
              {cfg.ro && cfg.ro.map(([k,lbl])=>(<div key={k} className="modal-sub">{lbl}: {editBodyDraft[k]}</div>))}
              <div className="ebody-grid">
                <div className="ebody-f"><label>Date</label><input type="date" value={dv} onChange={e=>setDate(e.target.value)}/></div>
                {cfg.fields.map(([k,lbl,kind])=>(
                  <div key={k} className="ebody-f"><label>{lbl}</label>
                    <input type={kind==='num'?'number':'text'} inputMode={kind==='num'?'decimal':'text'} value={editBodyDraft[k]==null?'':editBodyDraft[k]} onChange={e=>setEditBodyDraft(d=>({...d,[k]:e.target.value}))}/>
                  </div>
                ))}
              </div>
              <div className="modal-btns">
                <button className="mbt danger" onClick={()=>{ cfg.setter(prev=>prev.map(e => ((e.id||'')===editBody.id) ? {...e, deletedAt: Date.now(), updatedAt: Date.now()} : e)); setEditBody(null); setEditBodyDraft(null); }}>Delete</button>
                <button className="mbt ghost" onClick={()=>{setEditBody(null);setEditBodyDraft(null);}}>Cancel</button>
                <button className="mbt go" onClick={saveBodyEdit}>Save</button>
              </div>
            </div>
          </div>
        );
      })()}

      {newBlockConfirm && (
        <div className="modal-ov">
          <div className="modal">
            <div className="modal-title">Start Block {block+1}?</div>
            <div className="modal-sub">This begins a fresh 12-week wave at Week 1. Your logged sessions stay in History tagged Block {block}, and your working weights carry forward &#8212; nothing is reset or deleted.</div>
            <div className="modal-btns">
              <button className="mbt ghost" onClick={()=>setNewBlockConfirm(false)}>Cancel</button>
              <button className="mbt go" onClick={startNewBlock}>Start Block {block+1}</button>
            </div>
          </div>
        </div>
      )}

      {finishModal && (() => {
        const sess=SESSIONS[sel];
        const undone=sess.exercises.map((ex,i)=>({ex,i})).filter(({ex})=>{ if(ex.opt) return false; const eid=subMap[ex.id]?subMap[ex.id].id:ex.id; return !(setData[eid]&&setData[eid].length>0); });
        return (
          <div className="modal-ov">
            <div className="modal">
              <div className="modal-title">Finish session?</div>
              <div className="modal-sub">You haven't logged {undone.length} exercise{undone.length>1?'s':''} yet. Jump to one to do it now, or finish anyway.</div>
              <div className="swap-list">
                {undone.map(({ex,i})=>(<button key={i} className="swap-opt" onClick={()=>goToExercise(i)}>{(subMap[ex.id]&&subMap[ex.id].name)||ex.name}</button>))}
              </div>
              <div className="modal-btns">
                <button className="mbt ghost" onClick={()=>setFinishModal(false)}>Keep going</button>
                <button className="mbt danger" onClick={()=>{setFinishModal(false); saveAndFinish(setData);}}>Finish anyway</button>
              </div>
            </div>
          </div>
        );
      })()}

      {skipConfirm && (
        <div className="modal-ov">
          <div className="modal">
            <div className="modal-title">Skip Exercise?</div>
            <div className="modal-sub">Skip {curEx?.name}? Unlogged sets will not be saved.</div>
            <div className="modal-btns">
              <button className="mbt ghost" onClick={() => setSkipConfirm(false)}>Cancel</button>
              <button className="mbt danger" onClick={doSkipEx}>Skip</button>
            </div>
          </div>
        </div>
      )}

      {showSwap && curEx && (
        <div className="modal-ov">
          <div className="modal">
            <div className="modal-title">Swap Exercise</div>
            <div className="modal-sub">Replace {curEx.name} with another option for the same muscle. Your set and rep scheme carries over; it tracks as its own lift.</div>
            <div className="swap-list">
              {(ALT_BY_MUSCLE[EX_MUSCLE[baseEx?.id]?.p] || []).filter(o => o.name !== curEx.name).map((o, i) => (
                <button key={i} className="swap-opt" onClick={() => applySwap(o)}>{o.name}</button>
              ))}
            </div>
            <div className="modal-btns"><button className="mbt ghost" onClick={() => setShowSwap(false)}>Cancel</button></div>
          </div>
        </div>
      )}

      {clearConfirm && (
        <div className="modal-ov">
          <div className="modal">
            <div className="modal-title">Clear All Data?</div>
            <div className="modal-sub">This permanently deletes everything — workout history, logs, settings, and all health metrics (bodyweight, measurements, nutrition, BP, cardio, protocol). Export a backup first if you want to keep your data.</div>
            <div className="modal-btns">
              <button className="mbt ghost" onClick={() => setClearConfirm(false)}>Cancel</button>
              <button className="mbt danger" onClick={clearAllData}>Clear Everything</button>
            </div>
          </div>
        </div>
      )}

      {view === 'today' && (
        <div className="screen">
          <div className="topbar"><span className="logo">Today</span><span className="top-badge">B{block} · W{week}/12</span></div>
          <div className="today-date">{new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'})}</div>

          {/* ACTION FIRST. Today used to open on a recovery dashboard, so the thing you actually
              need — what to train and what to load — sat below the fold. This card answers it:
              readiness call (advice), the session, the first lift's exact prescription, any
              warnings, and Start. Everything below stays as the supporting detail. */}
          {(() => {
            const inProg = wipData && SESSIONS[wipData.sessionId];
            // Derive the next session durably from what's actually been completed this programme
            // week, instead of depending on `sel` (which is null on every fresh load and forced a
            // "Choose a session" dead-end). Rotation order = programme order; the first session not
            // yet performed this week is "next up". An explicit selection still overrides.
            const order = Object.keys(SESSIONS);
            const doneThisWeek = new Set((logs||[]).filter(l => (l.block||1)===block && l.week===week && sessionPerformed(l)).map(l => l.sessionId));
            const derivedNext = order.find(id => !doneThisWeek.has(id)) || order[0];
            const allDone = doneThisWeek.size >= order.length;
            const sid = inProg ? wipData.sessionId : (sel || derivedNext);
            const isDerived = !inProg && !sel;
            const sess = sid ? SESSIONS[sid] : null;
            const ex0 = sess ? sess.exercises[0] : null;
            const t0 = ex0 ? getTarget(ex0, logs, week, effPhase) : null;
            const warns = [];
            if (latestBP) { const c = bpCategory(latestBP.sys, latestBP.dia); if (c.cls==='red'||c.cls==='amber') warns.push('BP '+latestBP.sys+'/'+latestBP.dia+' — '+(c.label||'elevated')); }
            if (whoopData && whoopData.cachedAt && (Date.now()-new Date(whoopData.cachedAt).getTime())>30*3600000) warns.push('WHOOP data stale');
            if (isDeload) warns.push('Deload week — sets cut to ~40-50% of base, 85% load');
            if (ctxReasons && ctxReasons.length) warns.push(ctxReasons.join(' · '));
            return (
              <div className={`td-act ${readiness.cls}`}>
                <div className="ta-top">
                  <span className={`ta-mode ${readiness.cls}`}>{readiness.title}</span>
                  <span className="ta-prov">guidance</span>
                </div>
                <div className="ta-action">{readiness.action}</div>
                {sess ? (
                  <>
                    <div className="ta-sess">{sess.name}{inProg && <span className="td-chip">in progress</span>}{isDerived && !allDone && <span className="td-chip">next up{sess.day?' · '+sess.day:''}</span>}{isDerived && allDone && <span className="td-chip">week complete · new rotation</span>}</div>
                    <div className="ta-sub">{sess.focus} · {getPhase(week).name} · target {wr.rir}</div>
                    {ex0 && t0 && (
                      <div className="ta-first">
                        <span className="ta-ex">{ex0.name}</span>
                        <span className="ta-tgt">{t0.weight ? t0.weight+'kg' : 'establish'} {t0.reps?'× '+t0.reps:''}</span>
                      </div>
                    )}
                    {ex0 && t0 && t0.note && <div className="ta-note">{t0.note}</div>}
                    {warns.length > 0 && <div className="ta-warn">{warns.join(' · ')}</div>}
                    <button className="ta-go" onClick={()=> inProg ? resumeWorkout() : startWorkout(sid)}>
                      {inProg ? 'Resume session' : 'Start '+sess.name}
                    </button>
                    {!inProg && <button onClick={()=>setView('home')} style={{marginTop:8,background:'none',border:'none',color:'var(--t3)',fontSize:12,textDecoration:'underline',cursor:'pointer',width:'100%',textAlign:'center',fontFamily:'inherit'}}>Not this one? Choose another</button>}
                  </>
                ) : (
                  <>
                    {warns.length > 0 && <div className="ta-warn">{warns.join(' · ')}</div>}
                    <button className="ta-go" onClick={()=>setView('home')}>Choose a session</button>
                  </>
                )}
              </div>
            );
          })()}

          <div className="td-hero">
            <div className="th-lbl">Recovery <span className="td-prov">measured · WHOOP</span></div>
            {whoopData && whoopData.recovery!=null ? (
              <>
                <div className="th-val"><span className={'wcls '+getWhoopCls(whoopData.recovery)}>{whoopData.recovery}<span style={{fontSize:26}}>%</span></span>
                  <span className="th-tag" style={{color: whoopData.recovery>=67?'var(--ok)':whoopData.recovery>=34?'#ffd24a':'var(--err)'}}>{whoopData.recovery>=67?'Green':whoopData.recovery>=34?'Yellow':'Red'}</span></div>
                <div className="th-sub">RHR {whoopData.rhr}bpm · HRV {whoopData.hrv}ms{whoopData.sleepHrs!=null?' · Sleep '+whoopData.sleepHrs+'h':''}{whoopData.sleepDebt!=null&&whoopData.sleepDebt>0?<span style={{color:whoopData.sleepDebt>=1?'var(--warn)':'inherit'}}> · Debt {whoopData.sleepDebt}h</span>:''}<br/>{whoopData.sleepConsistency!=null?'Consistency '+whoopData.sleepConsistency+'% · ':''}{whoopData.spo2!=null?'SpO₂ '+whoopData.spo2+'% · ':''}{fmtAgo(whoopData.cachedAt)}</div>
              </>
            ) : <div className="th-none">No WHOOP data yet today</div>}
          </div>

          <div className="td-card">
            <div className="td-row"><span className="td-lbl">Weight {(() => { const f=freshInfo(bodyMetrics[0]&&bodyMetrics[0].date,10); return <span className="td-prov" style={f&&f.stale?{color:'var(--warn)'}:undefined}>{f?'measured · '+f.label:'measured'}</span>; })()}</span>
              <span className="td-val">{bodyMetrics[0]?bodyMetrics[0].weight+'kg':'—'}{bwRate?<span className={'td-arrow '+(bwRate.perWeek<-0.02?'good':bwRate.perWeek>0.02?'warn':'')}>{bwRate.perWeek>0.02?'▲':bwRate.perWeek<-0.02?'▼':'→'} {Math.abs(bwRate.perWeek).toFixed(2)}/wk</span>:null}</span></div>
            {bpStats||bwRate?<div className="td-sub">{bwRate?('trend '+(bwRate.pctWeek>0?'+':'')+bwRate.pctWeek.toFixed(2)+'%/wk'):''}</div>:null}
          </div>

          <div className="td-card">
            <div className="td-row"><span className="td-lbl">Fuel target <span className="td-prov">estimated</span></span>
              <span className="td-val">{effTargets ? effTargets.weekly : (nutriCoach && nutriCoach.suggested) ? nutriCoach.suggested : '—'}{(effTargets || (nutriCoach && nutriCoach.suggested)) ? <span className="td-muted" style={{fontSize:13}}> kcal{effTargets && effTargets.source==='locked' ? ' \u00b7 locked' : ''}</span> : null}</span></div>
            {(() => {
              // Macros come from the SAME source as the calorie number above (effTargets), so a
              // locked calorie target and its macros always reconcile. Reading protein/carb/fat
              // off the live engine while calories came from the lock let them silently disagree
              // (locked cals, but carbs derived from a different live estimate). Falls back to the
              // live engine only when there is no effTargets at all.
              const P = effTargets ? effTargets.protein : (nutriCoach && nutriCoach.proteinG);
              const C = effTargets ? effTargets.carb    : (nutriCoach && nutriCoach.carbG);
              const F = effTargets ? effTargets.fat     : (nutriCoach && nutriCoach.fatG);
              return (P != null && Number.isFinite(P))
                ? <div className="td-sub">P {P}g{C!=null?' · C '+C+'g':''}{F!=null?' · F '+F+'g':''}</div>
                : null;
            })()}
          </div>

          <div className="td-card">
            <div className="td-row"><span className="td-lbl">Blood pressure {(() => { const f=freshInfo(latestBP&&latestBP.date,7); return <span className="td-prov" style={f&&f.stale?{color:'var(--warn)'}:undefined}>{f?'measured · '+f.label:'measured'}</span>; })()}</span>
              {latestBP
                ? <span className="td-val"><span className={'bpc '+bpCategory(latestBP.sys,latestBP.dia).cls}>{latestBP.sys}/{latestBP.dia}</span></span>
                : <span className="td-val td-muted">not logged</span>}</div>
            {latestBP && bpStats && <div className="td-sub">{bpCategory(latestBP.sys,latestBP.dia).label||''} · 7-day avg {bpStats.avgSys}/{bpStats.avgDia}{latestBP.sys>bpStats.avgSys?' · ▲ up':latestBP.sys<bpStats.avgSys?' · ▼ down':' · → level'}</div>}
          </div>

          {latestGl && <div className="td-card">
            <div className="td-row"><span className="td-lbl">Glucose {(() => { const f=freshInfo(latestGl&&latestGl.date,7); return <span className="td-prov" style={f&&f.stale?{color:'var(--warn)'}:undefined}>{f?'measured · '+f.label:'measured'}</span>; })()}</span>
              <span className="td-val"><span className={'bpc '+glucoseCategory(latestGl.value).cls}>{latestGl.value}</span><span className="td-muted" style={{fontSize:13}}> mmol/L</span></span></div>
            {glStats && <div className="td-sub">7-day avg {glStats.avg} · {glStats.inRange}% in range{latestGl.value>glStats.avg?' · ▲ up':latestGl.value<glStats.avg?' · ▼ down':' · → level'}</div>}
          </div>}

          <div className="td-card">
            <div className="td-row"><span className="td-lbl">Waking temp <span className="td-prov">measured</span></span>
              <span className="td-val">{todayVitals && todayVitals.temp!=null
                ? todayVitals.temp+'°'
                : (whoopData && whoopData.skinTemp!=null
                    ? <span>{whoopData.skinTemp}°<span className="td-chip">WHOOP skin</span></span>
                    : <span className="td-muted" style={{fontSize:14}}>—</span>)}</span></div>
            {todayVitals && todayVitals.temp!=null && tempStat && <div className="td-sub">7-day avg {tempStat.avg}°{tempStat.delta!=null && Math.abs(tempStat.delta)>=0.05 ? ' · '+(tempStat.delta>0?'▲ +'+tempStat.delta.toFixed(1):'▼ '+tempStat.delta.toFixed(1))+'° today' : tempStat.delta!=null?' · → steady':''}{tempStat.n<7?' ('+tempStat.n+'d)':''}</div>}
            {(!todayVitals || todayVitals.temp==null) && whoopData && whoopData.skinTemp!=null && skinTempStat && <div className="td-sub">Wrist skin temp, not oral &#8212; read the drift, not the number. 7-day avg {skinTempStat.avg}°{skinTempStat.delta!=null && Math.abs(skinTempStat.delta)>=0.05 ? ' · '+(skinTempStat.delta>0?'▲ +'+skinTempStat.delta.toFixed(1):'▼ '+skinTempStat.delta.toFixed(1))+'°' : ' · → steady'}</div>}
            {(!todayVitals || todayVitals.temp==null) && <div className="td-sub" style={{color:'var(--t3)'}}>Log manually in Body &#8594; Waking Temp to override</div>}
          </div>

          <div className="td-card">
            <div className="td-row"><span className="td-lbl">Morning wood</span>
              <span className="td-val">{todayVitals && todayVitals.wood===true?'Yes':todayVitals && todayVitals.wood===false?'No':<span className="td-muted" style={{fontSize:14}}>—</span>}</span></div>
            <div className="td-wood">
              <button className={todayVitals && todayVitals.wood===true?'on':''} onClick={()=>setWood(true)}>Yes</button>
              <button className={todayVitals && todayVitals.wood===false?'on':''} onClick={()=>setWood(false)}>No</button>
            </div>
          </div>

          {ctxReasons && ctxReasons.length>0 && <div className="td-card">
            <div className="td-row"><span className="td-lbl">Flags today</span><span className="td-val" style={{fontSize:13}}>{ctxReasons.join(' · ')}</span></div>
          </div>}
        </div>
      )}

      {view === 'home' && (
        <div className="screen">
          <div className="topbar"><span className="logo">Diamond Protocol</span><span className="top-badge">B{block} · W{week}/12</span></div>
          <div className={`phase-bar ${bannerColor}`}>
            <div><div className="ph-name">{bannerName}</div><div className="ph-sub">{isDeload?"~40-50% volume · 85% load · 3-4 RIR":(scheduledDeload && !deloadActive)?"Base volume, full load \u2014 ramp resets this week":showInt?"Intensifiers active, selective failure":"Straight sets only, no failure"}</div></div>
            <div className="rir-val">{wr.rir}</div>
          </div>
          <div className="wksel">
            <button className="wkb" disabled={week===1} onClick={() => userSetWeek(w=>Math.max(1,w-1))}>&#8249;</button>
            <div><div className="wknum">{week}</div><div className="wksub">Block {block} · of 12</div></div>
            <button className="wkb" disabled={week===12} onClick={() => userSetWeek(w=>Math.min(12,w+1))}>&#8250;</button>
          </div>
          <div className="grid12">
            {Array.from({length:12},(_,i) => {
              const w2=i+1;
              const ws=new Set(logs.filter(l=>l.week===w2 && (l.block||1)===block).map(l=>l.sessionId));
              const cls=w2===week?'cur':ws.size>=4?'all':ws.size>0?'part':DLW.has(w2)?'dl':'';
              return <div key={w2} className={`wc ${cls}`} onClick={() => userSetWeek(w2)}><span className="wc-n">{w2}</span></div>;
            })}
          </div>
          {allDone && week < 12 && (
            <div className="adv-banner">
              <span className="adv-txt">All 4 sessions done — Week {week} complete</span>
              <button className="adv-btn" onClick={() => userSetWeek(w=>Math.min(12,w+1))}>Week {week+1} &#8250;</button>
            </div>
          )}
          {allDone && week === 12 && (
            <div className="adv-banner">
              <span className="adv-txt">Block {block} complete — nice work</span>
              <button className="adv-btn" onClick={() => setNewBlockConfirm(true)}>Start Block {block+1} &#8250;</button>
            </div>
          )}
          {!(allDone && week === 12) && (
            <button className="newblock-btn" onClick={() => setNewBlockConfirm(true)}>&#8635; Start a new block</button>
          )}
          <div className="rec-sec">
            <div className="sec-lbl">Goal Phase</div>
            <div className="rec-row">
              {[['bulk','Bulk'],['maintain','Maintain'],['cut','Cut']].map(([p,lbl])=>(
                <button key={p} className={`rc${goalPhase===p?' nm':''}`} onClick={()=>userSetPhase(p)}>{lbl}</button>
              ))}
            </div>
          </div>
          <div className="rec-sec">
            <div className="sec-lbl">High-Volume Track</div>
            <div className="rec-row">
              <button className={`rc${!highVol?' nm':''}`} onClick={()=>userSetHighVol(false)}>Off</button>
              <button className={`rc${highVol?' nm':''}`} onClick={()=>userSetHighVol(true)}>On</button>
            </div>
            <div className="hv-sub">{!highVol ? 'Standard volume' : DLW.has(week) ? 'Paused \u00b7 deload week' : goalPhase==='cut' ? 'Paused \u00b7 cut phase' : 'Active \u00b7 +1 set on priority muscles'}</div>
          </div>
          {wipData && (
            <div className="resume-box">
              <div className="rb-title">Resume workout?</div>
              <div className="rb-sub">Unfinished {SESSIONS[wipData.sessionId]?.name} session.</div>
              <div className="rb-btns">
                <button className="rb-btn p" onClick={resumeWorkout}>Resume</button>
                <button className="rb-btn g" onClick={clearWip}>Discard</button>
              </div>
            </div>
          )}
          <div className="rec-sec">
            <div className="sec-lbl">Recovery Status</div>
            <div className="rec-row">
              {[['excellent','ok','Excellent'],['normal','nm','Normal'],['beat','bt','Beat Up']].map(([k,cls,label]) => (
                <button key={k} className={`rc${recovery===k?' '+cls:''}`} onClick={() => userSetRecovery(k)}>{label}</button>
              ))}
            </div>
          </div>
          {scheduledDeload && (
            <div className="rec-sec">
              <div className="sec-lbl">Scheduled Deload</div>
              <div className="rec-row">
                <button className={`rc${deloadActive?' bt':''}`} onClick={()=>setDeloadSkips(m=>({...m,[block+'-'+week]:false}))}>Take deload</button>
                <button className={`rc${!deloadActive?' nm':''}`} onClick={()=>setDeloadSkips(m=>({...m,[block+'-'+week]:true}))}>Train through</button>
              </div>
              <div className="hv-sub">{deloadActive?'~40-50% volume · 85% load · 3-4 RIR':'Training through · base volume, full load & 1-2 RIR · ramp resets'}</div>
            </div>
          )}
          {isDeload && <div className="info-banner warn">Deload week — sets roughly halved (floored, so odd-set lifts drop a little more)</div>}
          {recovery==='beat' && <div className="info-banner err">Beat up — drop volume 25-40%, skip intensifiers</div>}
          {whoopConnected && deloadInfo.level==='deload' && <div className="info-banner err">Fatigue rising across your WHOOP data — a deload is recommended. See Progress.</div>}
          {/* WHOOP Biometrics */}
          {whoopConnected ? (
            <div className={`whoop-panel${whoopData?.recovery!=null?' '+getWhoopCls(whoopData.recovery):''}`}>
              <div className="whoop-hdr">
                <span className="whoop-nm">&#9889; WHOOP{whoopData?.recovery!=null&&<span className={`whoop-auto-badge ${getWhoopCls(whoopData.recovery)}`} style={{marginLeft:8}}>{whoopData.recovery>=67?'Green':whoopData.recovery>=34?'Yellow':'Red'}</span>}</span>
                <span className="whoop-sync">{whoopLoading?'Syncing...':fmtAgo(whoopData?.cachedAt)}</span>
              </div>
              {whoopLoading&&!whoopData?<div className="whoop-loading">Loading recovery data...</div>
              :whoopData?.recovery!=null?(
                <div className="whoop-body">
                  <div className="wr-block">
                    <div className={`wr-score ${getWhoopCls(whoopData.recovery)}`}>{whoopData.recovery}%</div>
                    <div className="wr-lbl">Recovery</div>
                  </div>
                  <div className="whoop-stats">
                    {whoopData.hrv!=null&&<div className="wst"><div className="wst-v">{whoopData.hrv}</div><div className="wst-l">HRV ms</div></div>}
                    {whoopData.rhr!=null&&<div className="wst"><div className="wst-v">{whoopData.rhr}</div><div className="wst-l">RHR bpm</div></div>}
                    {whoopData.sleepHrs!=null?<div className="wst"><div className="wst-v">{whoopData.sleepHrs}h</div><div className="wst-l">Sleep</div></div>:whoopData.sleep!=null&&<div className="wst"><div className="wst-v">{whoopData.sleep}%</div><div className="wst-l">Sleep</div></div>}
                    {whoopData.deepHrs!=null&&<div className="wst"><div className="wst-v">{whoopData.deepHrs}h</div><div className="wst-l">Deep</div></div>}
                    {whoopData.remHrs!=null&&<div className="wst"><div className="wst-v">{whoopData.remHrs}h</div><div className="wst-l">REM</div></div>}
                    {whoopData.respRate!=null&&<div className="wst"><div className="wst-v">{whoopData.respRate}</div><div className="wst-l">Resp br/m</div></div>}
                    {whoopData.spo2!=null&&<div className="wst"><div className="wst-v">{whoopData.spo2}%</div><div className="wst-l">SpO2</div></div>}
                    {whoopData.strain!=null&&<div className="wst"><div className="wst-v">{whoopData.strain}</div><div className="wst-l">Strain</div></div>}
                    {whoopData.dayCal!=null&&<div className="wst"><div className="wst-v">{whoopData.dayCal}</div><div className="wst-l">Cal out</div></div>}
                  </div>
                </div>
              ):<div className="whoop-nodata">No recovery data yet — check back after your next sleep cycle.</div>}
            </div>
          ):(
            <button className="connect-whoop" onClick={()=>window.location.href='/.netlify/functions/whoop-auth'}>
              Connect <b>WHOOP</b> to auto-sync your recovery
            </button>
          )}
          <div className={`readiness-card ${readiness.cls}`}>
            <div className="rd-label">Today's call</div>
            <div className="rd-mode">{readiness.title}</div>
            <div className="rd-action">{readiness.action}</div>
            {readiness.factors.length > 0 && <div className="rd-factors">{readiness.factors.join(' \u00b7 ')}</div>}
            <div className="rd-factors" style={{marginTop:6,opacity:0.7}}>Guidance only — this never changes your sets, targets or logged loads. You decide.</div>
          </div>
          <div className="sec-lbl" style={{padding:'0 15px 6px'}}>This week</div>
          <div className="wk-strip">
            {[['Mon','rest'],['Tue','Upper 2'],['Wed','Z2'],['Thu','Upper 3'],['Fri','Z2'],['Sat','Upper 1'],['Sun','Lower']].map(([d,label]) => (
              <div key={d} className={`wk-day${label==='rest'?' wk-rest':label==='Z2'?' wk-cardio':' wk-train'}`}>
                <div className="wk-dn">{d}</div>
                <div className="wk-lbl">{label==='Z2'?'Zone 2':label==='rest'?'Rest':label}</div>
              </div>
            ))}
          </div>
          <div className="sec-lbl" style={{padding:'0 15px 6px'}}>Sessions</div>
          <div className="sg">
            {(() => { const DORD={Monday:1,Tuesday:2,Wednesday:3,Thursday:4,Friday:5,Saturday:6,Sunday:7}; return Object.values(SESSIONS).slice().sort((a,b)=>(DORD[a.day]||9)-(DORD[b.day]||9)); })().map(s => (
              <div key={s.id} className={`sc${doneToday.has(s.id)?' done':''}`}
                onClick={() => {setSel(s.id);setActiveInts(showInt?new Set(DEF_INTS[s.id]):new Set());setView('session');}}>
                {doneToday.has(s.id) && <div className="s-done">&#10003;</div>}
                <div className="s-day">{s.day}</div>
                <div className="s-nm">{s.name}</div>
                <div className="s-foc">{s.focus}</div>
                <div className="s-time">{s.time}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {view === 'session' && sess && (
        <div className="screen">
          <button className="back-btn" onClick={() => setView('home')}>&#8592; Back</button>
          <div className="s-hdr">
            <div className="s-hdr-nm">{sess.name}</div>
            <div className="s-hdr-foc">{sess.focus}</div>
            <div className="s-hdr-meta">
              <span className="mp">{sess.day}</span><span className="mp">{sess.time}</span><span className="mp">{wr.rir}</span>
              {showInt && <span className="mp acc">Intensifiers ON</span>}
              {isDeload && <span className="mp warn">Deload</span>}
            </div>
          </div>
          {showInt && (
            <div className="int-ctrl">
              <span className="int-ctrl-lbl">Intensifiers active</span>
              <span className={`int-count${activeInts.size>=sess.maxInt?' full':''}`}>{activeInts.size} / {sess.maxInt}</span>
            </div>
          )}
          <div className="cond-toggle-row">
            <span className="cond-lbl">Short on time?</span>
            <button className={`cond-btn${condensed?' on':''}`} onClick={() => setCondensed(c => !c)}>{condensed?'30-min version ON':'Show 30-min version'}</button>
          </div>
          <div className="ex-list">
            {sess.exercises.map((ex, i) => {
              const adj = getEffSets(ex, week, hvActive);
              const rec = getProgRec(ex.id, ex, logs, effPhase);
              return (
                <div key={ex.id} className={`ex-row${condensed && !CORE_EX[sess.id]?.has(ex.id) ? ' ex-dim' : ''}`}>
                  <div className="ex-n">{i+1}</div>
                  <div className="ex-body">
                    <div className={`ex-nm${ex.opt?' opt':''}`}>{ex.name}{ex.opt?' (opt)':''}{condensed && CORE_EX[sess.id]?.has(ex.id) ? <span className="core-tag">core</span> : null}</div>
                    <div className="chips">
                      {adj>ex.sets ? <span className="chip" style={{color:'var(--acc)',borderColor:'rgba(196,255,0,.3)',background:'var(--ag2)'}}>{adj}x (+{adj-ex.sets})</span> : adj<ex.sets ? <span className="chip dl">{adj}x (deload)</span> : <span className="chip">{ex.sets}x</span>}
                      <span className="chip">{ex.setPlan ? `${ex.setPlan[0].rMin}-${ex.setPlan[0].rMax} reps (top set)` : `${ex.rMin}-${ex.rMax} reps`}</span>
                      {ex.tempo && <span className="chip">{ex.tempo} tempo</span>}
                      <span className="chip rir">{ex.rirMin===ex.rirMax?ex.rirMin:`${ex.rirMin}-${ex.rirMax}`} RIR</span>
                      <span className="chip">{fmt(ex.rest)} rest</span>
                      {ex.handle && <span className="chip">{ex.handle}</span>}
                    </div>
                    {ex.setPlan ? (() => {
                      // Explicit set-by-set plan. The old free-text 'struct' line disagreed with
                      // the rep chip (chip showed the whole 6-10 envelope while the note said
                      // "top set 6-8, back-offs 8-10"), forcing the user to reconcile it mid-set.
                      const topW = (() => {
                        const ph = getPrevHist(ex.id, logs, 1)[0];
                        if (!ph || !ph.sets || !ph.sets.length) return null;
                        return Math.max(...ph.sets.map(s => s.weight || 0)) || null;
                      })();
                      let n = 0;
                      return (
                        <div className="setplan">
                          {ex.setPlan.map((sp, si) => {
                            const from = n + 1; n += sp.sets; const to = n;
                            const lbl = sp.sets > 1 ? `Sets ${from}-${to}` : `Set ${from}`;
                            const load = topW ? Math.round(topW * sp.pct / 2.5) * 2.5 : null;
                            return (
                              <div key={si} className="sp-row">
                                <span className="sp-set">{lbl}</span>
                                <span className="sp-lbl">{sp.label}</span>
                                <span className="sp-reps">{sp.rMin}-{sp.rMax}</span>
                                <span className="sp-load">{sp.pct===1 ? 'top load' : `-${Math.round((1-sp.pct)*100)}%`}{load ? ` \u00b7 ~${load}kg` : ''}</span>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })() : ex.struct ? <div style={{fontSize:10,color:'var(--mut)',marginTop:3}}>{ex.struct}</div> : null}
                    {ex.avoidFail && <div><span className="chip avd">{ex.avoidReason}</span></div>}
                    {rec.type==='inc' && <div style={{fontSize:10,color:'var(--ok)',marginTop:4}}>&#9650; Increase weight — all sets hit top range</div>}
                    {rec.type==='beat' && <div style={{fontSize:10,color:'var(--acc)',marginTop:4}}>&#8594; Beat reps on weaker sets</div>}
                    {showInt && ex.int && (
                      <div className="int-tog-row">
                        <span className="int-tog-desc">{ex.int.label}: {ex.int.desc}</span>
                        <button
                          className={`int-tog${activeInts.has(ex.id)?' on':''}`}
                          disabled={!activeInts.has(ex.id) && activeInts.size>=sess.maxInt}
                          onClick={() => {const s=new Set(activeInts);s.has(ex.id)?s.delete(ex.id):s.add(ex.id);setActiveInts(s);}}>
                          {activeInts.has(ex.id)?'ON':'OFF'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="briefing-wrap">
            <button className="briefing-btn" disabled={briefingLoading} onClick={()=>getBriefing(sel)}>
              {briefingLoading?'Generating briefing...':'⚡ Get AI Coaching Briefing'}
            </button>
            {briefingLoading&&<div className="briefing-loading">Analysing your data...</div>}
            {briefing&&briefing.session===SESSIONS[sel]?.name&&(
              <div className="briefing-panel">
                <div className="briefing-tag">AI Briefing — {briefing.session}</div>
                <div className="briefing-text">{briefing.text}</div>
              </div>
            )}
          </div>
          <button className="start-btn" onClick={() => startWorkout(sel)}>Start Workout &#8594;</button>
        </div>
      )}

      {view === 'workout' && sess && curEx && (() => {
        return (
          <div className="fullscreen">
            <div className="wk-prog"><div className="wk-prog-fill" style={{width:`${(exIdx/sess.exercises.length)*100}%`}}/></div>
            <div className="wk-top"><span className="wk-sn">{sess.name} Wk{week}</span><span className="wk-cnt">{exIdx+1}/{sess.exercises.length}</span></div>
            {progRec && (
              <div className={`prog-rec ${progRec.type}`}>
                {progRec.type==='inc'&&'▲'}{progRec.type==='beat'&&'→'}{progRec.type==='keep'&&'→'}{progRec.type==='first'&&'●'} {progRec.msg}
              </div>
            )}
            {curTarget && !curTarget.first && (
              <div className="target-line">
                <span className="target-lbl">Today's target</span>
                <span className="target-val">{curSetPhase ? `${curSetWeight}kg \u00d7 ${curSetPhase.rMin}-${curSetPhase.rMax} reps` : `${curTarget.weight}kg \u00d7 ${curEx.rMin}-${curEx.rMax} reps`}</span>
                {curSetPhase && <span className="target-phase">{curSetPhase.label}{curSetPhase.pct!==1?` \u00b7 -${Math.round((1-curSetPhase.pct)*100)}% off top set`:' \u00b7 heaviest set of the day'}</span>}
                <span className="target-note">{curTarget.note}</span>
              </div>
            )}
            <div className="ex-card">
              <div className="ec-hdr">
                <div className="ec-nm">{curEx.name}{curEx.opt?' (opt)':''}</div>
                <div className="ec-meta">
                  <span className="chip">{effSets} sets</span>
                  <span className="chip">{curSetPhase ? `${curSetPhase.rMin}-${curSetPhase.rMax} reps` : `${curEx.rMin}-${curEx.rMax} reps`}</span>
                  <span className="chip rir">{curEx.rirMin===curEx.rirMax?curEx.rirMin:`${curEx.rirMin}-${curEx.rirMax}`} RIR</span>
                  <span className="chip">{fmt(curEx.rest)} rest</span>
                  {curEx.handle && <span className="chip">{curEx.handle}</span>}
                </div>
              </div>
              <div className="ec-cues">{curEx.cues.map((c,i) => <span key={i} className="cue">{c}</span>)}</div>
              {activeInts.has(curEx.id) && curEx.int && (
                <div className="int-box"><div className="int-lbl">{curEx.int.label}</div><div className="int-txt">{curEx.int.desc}</div></div>
              )}
              {curEx.avoidFail && <div className="avd-box">{curEx.avoidReason}</div>}
              <div className="set-trk">
                <div className="stl">
                  <span>{editIdx!==null?`Editing Set ${editIdx+1}`:`Set ${loggedSetsArr.length+1} of ${effSets}`}</span>
                  <span style={{color:'var(--t3)',fontFamily:'JetBrains Mono,monospace',fontSize:9}}>{loggedSetsArr.length}/{effSets} done</span>
                </div>
                <div className="dots">
                  {Array.from({length:effSets}).map((_,i) => (
                    <div key={i} className={`dot${i<loggedSetsArr.length?' d':i===loggedSetsArr.length&&editIdx===null?' c':''}`}/>
                  ))}
                </div>
              </div>
              {loggedSetsArr.length > 0 && (
                <div className="logged-sets">
                  {loggedSetsArr.map((s,i) => (
                    <div key={i} className={`ls-chip${editIdx===i?' ed':''}`}
                      onClick={() => {if(editIdx===i){setEditIdx(null);clearIntInputs();}else{setEditIdx(i);setWt(s.weight);setRp(s.reps);setRir(s.rir??effWR(week).rirN);
                        const it=s.intensifier; setIntPartials(it&&it.partialReps?String(it.partialReps):''); setIntMyoStr(it&&it.myoReps?it.myoReps.join(','):''); setIntFail(!!(it&&it.kind==='failure'));}}}>
                      <span>{s.weight}kg&#215;{s.reps}</span>
                      <span className="ls-rir">{s.rir}RIR</span>
                      {s.intensifier && <span className="ls-int">{intBadge(s.intensifier)}</span>}
                    </div>
                  ))}
                </div>
              )}
              {prevHist.length > 0 && (
                <div className="prev-sec">
                  <div className="prev-lbl">Previous sessions</div>
                  {prevHist.map((h,i) => {
                    const vl = volLoad(h.sets);
                    const older = prevHist[i+1];
                    const olderVl = older ? volLoad(older.sets) : null;
                    const pct = (olderVl && olderVl > 0) ? Math.round(((vl - olderVl) / olderVl) * 100) : null;
                    return (
                    <div key={i} className="prev-item">
                      <span className="prev-dt">{fmtShort(h.date)}</span>
                      <span>{h.sets.map(s=>`${s.weight}\u00d7${s.reps}${s.intensifier?' ('+intBadge(s.intensifier)+')':''}`).join('  ')}</span>
                      <span className="prev-prog" style={{color:'var(--t3)'}}>{vl.toLocaleString()}kg{pct!==null?` (${pct>=0?'+':''}${pct}%)`:''}</span>
                      {h.swapped && <span className="prev-prog" style={{color:'var(--t3)'}}>via {h.swapped}</span>}
                      {i===0 && progRec?.type==='inc' && <span className="prev-prog">add weight</span>}
                    </div>
                    );
                  })}
                </div>
              )}
              <div className="inp-sec">
                <div className="inp-row">
                  <div className="inp-grp">
                    <div className="inp-lbl">Weight kg</div>
                    <div className="nw">
                      <button className="nb" onClick={() => setWt(v=>Math.max(0,parseFloat(v||0)-2.5))}>&#8722;</button>
                      <input className="ni" type="number" inputMode="decimal" value={wt} onChange={e=>setWt(e.target.value)}/>
                      <button className="nb" onClick={() => setWt(v=>parseFloat(v||0)+2.5)}>+</button>
                    </div>
                  </div>
                  <div className="inp-grp">
                    <div className="inp-lbl">Reps</div>
                    <div className="nw">
                      <button className="nb" onClick={() => setRp(v=>Math.max(1,parseInt(v||1)-1))}>&#8722;</button>
                      <input className="ni" type="number" inputMode="numeric" value={rp} onChange={e=>setRp(e.target.value)}/>
                      <button className="nb" onClick={() => setRp(v=>parseInt(v||0)+1)}>+</button>
                    </div>
                  </div>
                </div>
                <div className="rir-grp">
                  <div className="inp-lbl">RIR — reps in reserve</div>
                  <div className="rir-row">
                    {[0,1,2,3,'4+'].map(r => (
                      <button key={r} className={`rirb${rir===r?' on':''}`} onClick={() => setRir(r)}>{r}</button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="pain-sec">
                <div className="pain-lbl">Joint / tendon discomfort</div>
                <div className="pain-row">
                  {[[0,'None'],[1,'Niggle'],[2,'Sharp']].map(([v,l]) => {
                    const sel=(painData[curEx.id]||0)===v;
                    const extra=v===2?' sharp':v===1?' warn':'';
                    return <button key={v} className={`painb${sel?' on'+extra:''}`} onClick={()=>{const np={...painData,[curEx.id]:v};setPainData(np);painRef.current=np;}}>{l}</button>;
                  })}
                </div>
              </div>
              {intEligible && (
                <div className="int-cap">
                  <div className="int-cap-hd">{curEx.int.label} · final set{(painData[curEx.id]||0)===2?' — sharp pain flagged, skip if it bites':''}</div>
                  {(intKind==='partials' || intKind==='partials_failure') && (
                    <div className="int-cap-row">
                      <span className="int-cap-lbl">Lengthened partials</span>
                      <div className="nw sm">
                        <button className="nb" onClick={()=>setIntPartials(v=>String(Math.max(0,(parseInt(v)||0)-1)))}>&#8722;</button>
                        <input className="ni" type="number" inputMode="numeric" placeholder="0" value={intPartials} onChange={e=>setIntPartials(e.target.value)}/>
                        <button className="nb" onClick={()=>setIntPartials(v=>String((parseInt(v)||0)+1))}>+</button>
                      </div>
                    </div>
                  )}
                  {intKind==='myo' && (
                    <div className="int-cap-row">
                      <span className="int-cap-lbl">Mini-set reps</span>
                      <input className="ni wide" type="text" inputMode="numeric" placeholder="e.g. 5,4,3,3" value={intMyoStr} onChange={e=>setIntMyoStr(e.target.value)}/>
                    </div>
                  )}
                  {(intKind==='failure' || intKind==='partials_failure') && (
                    <button className={`int-cap-fail${intFail?' on':''}`} onClick={()=>setIntFail(v=>!v)}>{intFail?'\u2713 Taken to failure':'Mark taken to failure'}</button>
                  )}
                  <div className="int-cap-note">Recorded separately — never counts toward your working reps, e1RM or progression.</div>
                </div>
              )}
              {curEx.orm && parseInt(rp)>0 && parseFloat(wt)>0 && (
                <div className="onerm-box">
                  <span className="orm-lbl">Est. 1RM</span>
                  <span className="orm-val">{epley(totalLoad(curEx.id, parseFloat(wt), bwAt, new Date().toISOString()), parseInt(rp))}kg</span>
                </div>
              )}
              <div className="log-area">
                <button className={`log-btn${editIdx!==null?' upd':''}`} onClick={logSet}>
                  {editIdx!==null?`Update Set ${editIdx+1}`:`Log Set ${loggedSetsArr.length+1}`}
                </button>
              </div>
            </div>
            <div className="wk-nav">
              <button className="wnb" disabled={exIdx===0} onClick={() => goToExercise(exIdx-1)}>Back</button>
              <button className="wnb" onClick={() => setShowSwap(true)}>Swap</button>
              <button className="wnb" onClick={() => setSkipConfirm(true)}>Skip</button>
              <button className="wnb fin" onClick={() => tryFinish(setData)}>End</button>
            </div>
          </div>
        );
      })()}

      {view === 'complete' && (
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
      )}

      {view === 'progress' && (
        <div className="screen">
          <div className="topbar"><span className="logo">Progress</span></div>
          {(() => {
            // §8.1 core: surface the few things that need action first, so you don't scan 17 cards.
            // Reads only already-computed signals; every access is guarded and the whole block is
            // try/caught to render null on any error — it can never crash the screen.
            try {
              const items = [];
              try { const b = bpLog && bpLog[0]; if (b) { const bc = bpCategory(b.sys, b.dia); const age = (Date.now()-new Date(b.date).getTime())/86400000; if ((bc.cls==='red'||bc.cls==='amber') && age<=7) items.push({sev:'#ff6b6b', t:`Blood pressure ${b.sys}/${b.dia} (${bc.label||'elevated'}) in the last week — take a repeat reading.`}); } } catch(_){}
              try { if (readiness && readiness.cls==='red') items.push({sev:'#ff6b6b', t:`Readiness is red today — ${readiness.action}`}); } catch(_){}
              try { const s = weekReview && weekReview.items && weekReview.items.find(i=>i.k==='Sessions'); if (s && s.verdict==='miss') items.push({sev:'#e0b020', t:`Sessions behind this week (${s.v}).`}); } catch(_){}
              try { const p = weekReview && weekReview.items && weekReview.items.find(i=>i.k==='Protein'); if (p && p.verdict==='miss') items.push({sev:'#e0b020', t:`Protein under target (${p.v}) — muscle-retention risk on a cut.`}); } catch(_){}
              try { if (plateaus && plateaus.length) items.push({sev:'#728aa2', t:`${plateaus.length} lift${plateaus.length>1?'s':''} stalled: ${plateaus.slice(0,2).map(p=>p.name).join(', ')}${plateaus.length>2?'\u2026':''}.`}); } catch(_){}
              const top = items.slice(0,3);
              if (!top.length) return null;
              return (
                <div className="ar-card" style={{borderColor:'rgba(255,107,107,.35)'}}>
                  <div className="hm-head"><span className="hm-ttl">Needs attention</span><span className="hm-wk">{top.length}</span></div>
                  {top.map((it,i)=>(<div key={i} style={{display:'flex',gap:8,padding:'6px 0',borderTop:i?'1px solid var(--bdr)':'none',fontSize:12,color:'var(--t2)',lineHeight:1.5}}><span style={{color:it.sev,fontWeight:800}}>&#8226;</span><span>{it.t}</span></div>))}
                </div>
              );
            } catch(e) { return null; }
          })()}
          {(() => {
            // Reorg: compress everything that's FINE into one glanceable strip, so healthy
            // measures don't each take a full card. Reads existing verdicts only; fully fail-safe.
            try {
              const chips = [];
              try { (weekReview && weekReview.items || []).filter(i=>i.verdict==='good').forEach(i=>chips.push(`${i.k} ${i.v}`)); } catch(_){}
              try { const b = bpLog && bpLog[0]; if (b) { const c = bpCategory(b.sys,b.dia); if (c.cls==='green') chips.push('BP normal'); } } catch(_){}
              if (!chips.length) return null;
              return (
                <div className="ar-card">
                  <div className="hm-head"><span className="hm-ttl">On track</span><span className="hm-wk">{chips.length} &#10003;</span></div>
                  <div style={{display:'flex',flexWrap:'wrap',gap:6,marginTop:6}}>
                    {chips.slice(0,8).map((c,i)=><span key={i} style={{fontSize:11,color:'#00e87a',background:'rgba(0,232,122,.1)',border:'1px solid rgba(0,232,122,.3)',borderRadius:6,padding:'3px 8px'}}>{c}</span>)}
                  </div>
                </div>
              );
            } catch(e) { return null; }
          })()}
          {weekReview && (
            <div className="ar-card">
              <div className="hm-head"><span className="hm-ttl">Week in review</span><span className="hm-wk">last 7 days</span></div>
              {weekReview.items.map((it,i)=>(
                <div key={i} className="wr-row">
                  {/* Glyph as well as colour. A coloured dot alone fails for red-green
                      deficiency (~8% of men) and in bright sunlight mid-session. */}
                  <span className={'wr-dot '+it.verdict}>{it.verdict==='good'?'\u2713':it.verdict==='ok'?'!':'\u2715'}</span>
                  <span className="wr-k">{it.k}</span>
                  <span className="wr-v">{it.v}</span>
                  <span className="wr-note">{it.note}</span>
                </div>
              ))}
              <div className="av-note" style={{marginTop:10,marginBottom:0}}>
                {weekReview.misses.length===0
                  ? 'Nothing off-target this week. Hold the line.'
                  : <>Attention: <b>{weekReview.misses.join(', ')}</b>. Fix the highest one first &#8212; the rest often follow.</>}
              </div>
            </div>
          )}
          <div className="grp-head" onClick={()=>toggleGrp('training')}><span className="grp-ttl">Training & volume</span><span className={'sec-chev'+(grpOpen('training')?' op':'')}>▾</span></div>
          {grpOpen('training') && <>

          <div className="hm-card">
            <div className="hm-head"><span className="hm-ttl">Muscle heat map</span><span className="hm-wk">planned · Wk {week}{hvActive?' · HV':''}</span></div>
            <div className="hm-grid">
              {Object.entries(MUSCLES).map(([key,mus])=>{
                // Status is judged on FRACTIONAL (effective) sets — the same basis as the
                // "Volume actually logged" card and as the landmark min/max ranges. Judging
                // planned on direct sets while judging actual on fractional made the two cards
                // contradict each other for muscles with heavy compound carryover (e.g. triceps
                // reading "under" here but "in range" below). Direct is shown as secondary detail.
                const sets=Math.round((plannedVol[key]||0)*10)/10;   // fractional — drives status
                const dsets=Math.round((volParts.dir[key]||0)*10)/10; // direct isolation — detail
                if(sets===0 && mus.optional) return null;
                const c = sets<mus.min?{bg:'rgba(74,158,255,.12)',bd:'rgba(74,158,255,.38)',fg:'#5aa9ff'}:sets>mus.max?{bg:'rgba(212,160,23,.14)',bd:'rgba(212,160,23,.5)',fg:'#e0b020'}:{bg:'rgba(0,232,122,.12)',bd:'rgba(0,232,122,.38)',fg:'#00e87a'};
                return (
                  <div key={key} className="hm-cell" style={{background:c.bg,borderColor:c.bd}}>
                    <div className="hm-mus">{mus.name}</div>
                    <div className="hm-val" style={{color:c.fg}}>{sets<mus.min?'▼ ':sets>mus.max?'▲ ':''}{sets}</div>
                    <div className="hm-rng">{mus.min}-{mus.max} · {dsets} direct</div>
                    <div className="hm-state" style={{color:c.fg}}>{sets<mus.min?'under':sets>mus.max?'over':'in range'}</div>
                  </div>
                );
              })}
            </div>
            <div className="hm-legend"><span><i style={{background:'#5aa9ff'}}/>below floor</span><span><i style={{background:'#00e87a'}}/>in range</span><span><i style={{background:'#e0b020'}}/>overreach</span></div>
          </div>

          {actualVol && actualVol.completedWeeks > 0 && (
            <div className="ar-card">
              <div className="hm-head"><span className="hm-ttl">Volume actually logged</span><span className="hm-wk">avg/wk · {actualVol.completedWeeks} completed wk{actualVol.completedWeeks===1?'':'s'}</span></div>
              <div className="av-note">What you really did, vs what the programme plans. Gaps here are swaps, cut sets or missed sessions.</div>
              {Object.entries(MUSCLES).map(([key,mus])=>{
                const act=actualVol.avg[key]||0, plan=Math.round((plannedVol[key]||0)*10)/10;
                if(act===0 && mus.optional) return null;
                const pctOfPlan = plan>0 ? (act/plan)*100 : 0;
                const col = act<mus.min ? '#5aa9ff' : act>mus.max ? '#e0b020' : '#00e87a';
                return (
                  <div key={key} className="av-row">
                    <span className="av-mus">{mus.name}</span>
                    <div className="av-bar"><div className="av-fill" style={{width:Math.min(100,pctOfPlan)+'%',background:col}}/></div>
                    <span className="av-val" style={{color:col}}>{act<mus.min?'\u25bc':act>mus.max?'\u25b2':'\u2713'} {act}</span>
                    <span className="av-plan">/ {plan}</span>
                  </div>
                );
              })}
            </div>
          )}

          {!(durations && durations.series.length > 1) && (
            <div className="ar-card">
              <div className="hm-head"><span className="hm-ttl">Session length</span><span className="hm-wk">not yet</span></div>
              <div className="av-note" style={{marginBottom:0}}>Needs at least two completed sessions with a recorded duration.</div>
            </div>
          )}
          {durations && durations.series.length > 1 && (
            <div className="ar-card">
              <div className="hm-head"><span className="hm-ttl">Session length</span><span className="hm-wk">last {durations.series.length} · avg {durations.overall} min</span></div>
              <SVGBars items={durations.types.map(t=>({label:t.name.replace('Upper','Up').replace('Lower','Low'),value:t.avg,lo:t.min,hi:t.max,sub:t.n+' sess'}))} color="#4a9eff" height={132} unit="min avg"/>
              {durations.types.map(t=>{
                return (
                  <div key={t.key} className="dur-row">
                    <span className="dur-name">{t.name}</span>
                    <span className="dur-avg">{t.avg}<span className="st-u">min avg</span></span>
                    <span className="dur-rng">{t.min}&ndash;{t.max}</span>
                    {t.planned && <span className="dur-plan">plan {t.planned.replace(' min','')}</span>}
                  </div>
                );
              })}
              {durSplit && (
                <div style={{marginTop:10,paddingTop:9,borderTop:'1px solid var(--bdr)'}}>
                  <div className="mp-hd" style={{marginBottom:6}}>
                    <span className="mp-ttl">Active vs rest &#183; last {durSplit.n}</span>
                    <span className="mp-cals">{durSplit.wall} min wall</span>
                  </div>
                  <div style={{display:'flex',height:10,borderRadius:5,overflow:'hidden',background:'var(--sur)'}}>
                    <div style={{width:(durSplit.wall?durSplit.active/durSplit.wall*100:0)+'%',background:'var(--acc)'}}/>
                    <div style={{width:(durSplit.wall?durSplit.rest/durSplit.wall*100:0)+'%',background:'#4a9eff',opacity:0.6}}/>
                  </div>
                  <div style={{display:'flex',gap:14,marginTop:6,fontSize:10.5,color:'var(--t2)'}}>
                    <span><b style={{color:'var(--acc)'}}>{durSplit.active} min</b> working</span>
                    <span><b style={{color:'#4a9eff'}}>{durSplit.rest} min</b> resting</span>
                  </div>
                  <div className="av-note" style={{marginTop:7,marginBottom:0}}>This is wall-clock time minus logged rest — so it still includes setup, transitions and any unlogged breaks, not just working sets. Read it as session length, not pure effort time. Sessions logged before this was tracked are not included.</div>
                </div>
              )}
              {durations.outliers > 0 && <div className="av-note" style={{marginTop:9,marginBottom:0}}>{durations.outliers} session{durations.outliers===1?'':'s'} over 150 min excluded from averages &#8212; almost certainly paused and resumed rather than genuinely that long.</div>}
            </div>
          )}

          </>}
          <div className="grp-head" onClick={()=>toggleGrp('recovery')}><span className="grp-ttl">Recovery & body</span><span className={'sec-chev'+(grpOpen('recovery')?' op':'')}>▾</span></div>
          {grpOpen('recovery') && <>

          {!recPerf && (
            <div className="ar-card">
              <div className="hm-head"><span className="hm-ttl">Recovery vs performance</span><span className="hm-wk">not yet</span></div>
              <div className="av-note" style={{marginBottom:0}}>Needs logged sessions on days with a WHOOP recovery score, across at least two recovery bands. Keep training and syncing &#8212; this fills in on its own.</div>
            </div>
          )}
          {recPerf && (
            <div className="ar-card">
              <div className="hm-head"><span className="hm-ttl">Recovery vs performance</span><span className="hm-wk">{recPerf.totalSessions} lift-sessions</span></div>
              <div className="av-note">One point per session: WHOOP recovery that morning against mean e1RM relative to each lift's own average. Deloads excluded. Bands mark red / yellow / green.</div>
              {recPerf.points && recPerf.points.length>=3 && (
                <SVGScatter points={recPerf.points} color="#00e87a" height={155}
                  xLabel="recovery %" yLabel="e1RM vs own avg" xMin={0} xMax={100}
                  bands={[{from:0,to:34,color:'#ff4444'},{from:34,to:67,color:'#ffd24a'},{from:67,to:100,color:'#00e87a'}]}/>
              )}
              {[['high','Green (67%+)',recPerf.high,recPerf.highN],['mid','Yellow (34-66%)',recPerf.mid,recPerf.midN],['low','Red (under 34%)',recPerf.low,recPerf.lowN]].map(([k,lbl,v,n])=>(
                <div key={k} className="st-row">
                  <span className="st-name">{lbl}</span>
                  <span className="st-e1">{n} session{n===1?'':'s'}</span>
                  <span className="st-pct" style={{color: v==null?'var(--t3)': v>0.5?'var(--ok)': v<-0.5?'var(--warn)':'var(--t2)', opacity: recPerf.provisional?0.6:1}}>{v==null?'—':(v>0?'+':'')+v+'%'}</span>
                </div>
              ))}
              <div className="av-note" style={{marginTop:9,marginBottom:0}}>
                {recPerf.provisional && <><b>Early signal, not a verdict.</b> Gap is {recPerf.gap>0?'+':''}{recPerf.gap}% so far, but at least {recPerf.minVerdict} sessions in each band are needed before that means anything. Keep logging.</>}
                {recPerf.verdict==='costly' && <>Green days out-perform low days by <b>{recPerf.gap}%</b>. Your recovery score is earning its place &#8212; respecting it is justified.</>}
                {recPerf.verdict==='negligible' && <>Difference is only <b>{recPerf.gap}%</b> &#8212; within noise. On your data, recovery score is <b>not</b> predicting lift performance, which argues for trusting bar speed and RIR over the number.</>}
                {recPerf.verdict==='inverse' && <>Low-recovery days score <b>higher</b> ({recPerf.gap}%). Almost certainly confounding &#8212; likely tren suppressing HRV on days you're actually fresh. Treat the recovery number with caution.</>}
                {!recPerf.verdict && 'Not enough sessions in two recovery bands yet.'}
              </div>
            </div>
          )}

          {!timeOfDay && (
            <div className="ar-card">
              <div className="hm-head"><span className="hm-ttl">Time of day</span><span className="hm-wk">not yet</span></div>
              <div className="av-note" style={{marginBottom:0}}>Needs sessions logged across at least two time bands before start time can be compared.</div>
            </div>
          )}
          {timeOfDay && (
            <div className="ar-card">
              <div className="hm-head"><span className="hm-ttl">Time of day</span><span className="hm-wk">{timeOfDay.total} sessions</span></div>
              <div className="av-note">Mean e1RM by when you actually started, relative to each lift&rsquo;s own average. Bands with fewer than 3 sessions show a count but no score.</div>
              {timeOfDay.bands.map(b=>(
                <div key={b.k} className="st-row">
                  <span className="st-name">{b.label}<span className="dur-plan" style={{display:'block',textAlign:'left',minWidth:0,marginTop:1}}>{b.typical?'typically '+b.typical:b.sub}</span></span>
                  <span className="st-e1">{b.sessions} sess</span>
                  <span className="st-pct" style={{color: b.mean==null?'var(--t3)': b.mean>0.5?'var(--ok)': b.mean<-0.5?'var(--warn)':'var(--t2)'}}>{b.mean==null?'\u2014':(b.mean>0?'+':'')+b.mean+'%'}</span>
                </div>
              ))}
              <div className="av-note" style={{marginTop:9,marginBottom:0}}>
                {timeOfDay.provisional && <><b>Early signal, not a verdict.</b> {timeOfDay.better.label} is ahead by {timeOfDay.gap}% so far, but moving your training slot is a real change &#8212; it needs {timeOfDay.minVerdict}+ sessions in each band first ({timeOfDay.better.label} has {timeOfDay.better.sessions}, {timeOfDay.worse.label} has {timeOfDay.worse.sessions}).</>}
                {timeOfDay.verdict==='clear' && <><b>{timeOfDay.better.label}</b> out-performs <b>{timeOfDay.worse.label}</b> by <b>{timeOfDay.gap}%</b> across your two most-used slots. Put your hardest sessions there where life allows.</>}
                {timeOfDay.verdict==='nodiff' && <>Only <b>{timeOfDay.gap}%</b> between your two most-used slots &#8212; within noise. Train whenever adherence is easiest; consistency beats the clock.</>}
                {!timeOfDay.verdict && 'Need 3+ sessions in at least two bands before comparing.'}
              </div>
            </div>
          )}

          {!alcoholImpact && (
            <div className="ar-card">
              <div className="hm-head"><span className="hm-ttl">Alcohol vs lifting</span><span className="hm-wk">not yet</span></div>
              <div className="av-note" style={{marginBottom:0}}>Needs alcohol units logged in Body &#8594; Context Flags, plus sessions on both drinking and clear days.</div>
            </div>
          )}
          {alcoholImpact && (
            <div className="ar-card">
              <div className="hm-head"><span className="hm-ttl">Alcohol vs lifting</span><span className="hm-wk">{alcoholImpact.drinkDays} day{alcoholImpact.drinkDays===1?'':'s'} logged</span></div>
              <div className="av-note">Sessions on a drinking day or the day after, vs clear days. Deloads excluded.</div>
              {[['clear','Clear days'],['after','Within 24h of alcohol']].map(([k,lbl])=>{
                const b = alcoholImpact[k];
                if (!b) return null;
                return (
                  <div key={k} className="st-row">
                    <span className="st-name">{lbl}</span>
                    <span className="st-e1">{b.sessions} session{b.sessions===1?'':'s'}</span>
                    <span className="st-pct" style={{color: b.mean==null?'var(--t3)': b.mean>0.5?'var(--ok)': b.mean<-0.5?'var(--warn)':'var(--t2)'}}>{b.mean==null?'\u2014':(b.mean>0?'+':'')+b.mean+'%'}</span>
                  </div>
                );
              })}
              <div className="av-note" style={{marginTop:9,marginBottom:0}}>
                {alcoholImpact.provisional && <><b>Early signal, not a verdict.</b> Difference is {alcoholImpact.gap>0?'+':''}{alcoholImpact.gap}% so far ({alcoholImpact.after.sessions} sessions after drinking vs {alcoholImpact.clear.sessions} clear). Needs {alcoholImpact.minVerdict}+ in each before drawing a conclusion.</>}
                {alcoholImpact.verdict==='costly' && <>Lifting is <b>{Math.abs(alcoholImpact.gap)}%</b> down within 24h of drinking. That is your own data, not a general claim &#8212; worth weighing against training days.</>}
                {alcoholImpact.verdict==='negligible' && <>Difference is <b>{Math.abs(alcoholImpact.gap)}%</b> &#8212; within noise at this sample size. Note that alcohol affects sleep, recovery and protein synthesis whether or not the bar notices.</>}
                {alcoholImpact.verdict==='inverse' && <>Sessions after drinking score <b>higher</b>, which is almost certainly confounding (weekend sessions, more rest beforehand) rather than a real effect.</>}
                {!alcoholImpact.verdict && 'Need at least 3 sessions in each group to compare.'}
              </div>
            </div>
          )}

          {painTrend && painTrend.flagged.length > 0 && (
            <div className="ar-card">
              <div className="hm-head"><span className="hm-ttl">Joint pain by lift</span><span className="hm-wk">{painTrend.overallRate}% of exercise-sessions</span></div>
              <div className="av-note">Which lifts repeatedly produce pain. One niggle is noise; a lift flagging most sessions is telling you to change the movement, not push through it.</div>
              {painTrend.flagged.slice(0,8).map(p=>(
                <div key={p.id} className="st-row">
                  <span className="st-name">{p.name}{p.severity==='sharp'&&<span className="h-pain sharp" style={{marginLeft:6}}>sharp</span>}</span>
                  <span className="st-e1">{p.painCount}/{p.sessions}</span>
                  <span className="st-pct" style={{color: p.rate>=60?'var(--err)':p.rate>=30?'var(--warn)':'var(--t2)'}}>{p.rate}%</span>
                  <span className="dur-plan" style={{color: p.dir==='worsening'?'var(--err)':p.dir==='improving'?'var(--ok)':'var(--t3)'}}>{p.dir==='worsening'?'▲ worse':p.dir==='improving'?'▼ better':'→ flat'}</span>
                </div>
              ))}
              <div className="av-note" style={{marginTop:9,marginBottom:0}}>Anything sharp, or over 60% and worsening, should be swapped for a variation rather than loaded through. Persistent joint pain is worth raising with a physio.</div>
            </div>
          )}

          {trainLoad && trainLoad.weeksOfData >= 2 && (
            <div className="ar-card">
              <div className="hm-head"><span className="hm-ttl">Training load</span><span className="hm-wk">weekly tonnage</span></div>
              <SVGChart data={trainLoad.series.map(b=>({x:b.weeksAgo===0?'now':b.weeksAgo+'w',y:Math.round(b.tonnage/1000)}))} height={110} color="#a479e2"/>
              <div className="st-row"><span className="st-name">This week</span><span className="st-e1">{Math.round(trainLoad.acute/1000)}k kg</span><span className="st-pct" style={{color:'var(--t2)'}}>{trainLoad.series[trainLoad.series.length-1].sessions} sess</span></div>
              {trainLoad.chronic!=null && <div className="st-row"><span className="st-name">4-week average</span><span className="st-e1">{Math.round(trainLoad.chronic/1000)}k kg</span><span className="st-pct" style={{color: trainLoad.verdict==='spike'?'var(--warn)':trainLoad.verdict==='drop'?'var(--inf)':'var(--ok)'}}>{trainLoad.ratio}&#215;</span></div>}
              <div className="av-note" style={{marginTop:9,marginBottom:0}}>
                {trainLoad.verdict==='spike' && <>This week is <b>{trainLoad.ratio}&#215;</b> your recent norm &#8212; a sharp jump. Not inherently bad, but pair it with a genuinely easier week rather than stacking another.</>}
                {trainLoad.verdict==='drop' && <>This week is <b>{trainLoad.ratio}&#215;</b> your recent norm. Fine if deliberate (deload, illness, travel); worth a look if not.</>}
                {trainLoad.verdict==='steady' && <>Load is steady at <b>{trainLoad.ratio}&#215;</b> your 4-week norm &#8212; consistent progression rather than lurching.</>}
                {!trainLoad.verdict && 'Need a few more weeks before the ratio means anything.'}
                <br/><span style={{color:'var(--t3)'}}>Descriptive only. Acute:chronic ratios were popularised for injury prediction and that claim has not held up well &#8212; read this as &quot;load vs my norm&quot;, not a risk score.</span>
              </div>
            </div>
          )}

          {stalls && stalls.total > 0 && (
            <div className="ar-card">
              <div className="hm-head"><span className="hm-ttl">Stalled lifts</span><span className="hm-wk">{stalls.stalled.length} of {stalls.total}</span></div>
              {stalls.stalled.length > 0 ? (<>
              <div className="av-note">Best e1RM in the last 2 sessions vs the sessions before. Deloads excluded. Under 1% improvement = stalled.</div>
              {stalls.stalled.slice(0,8).map(s=>(
                <div key={s.id} className="st-row">
                  <span className="st-name">{s.name}<span className="dur-plan" style={{display:'block',textAlign:'left',minWidth:0,marginTop:1}}>{s.sessionsSincePeak>0?s.sessionsSincePeak+' since peak · now '+s.lastE1rm+'kg vs '+s.peakE1rm+'kg peak':'at peak'}</span></span>
                  <span className="st-e1">{s.bestRecent}<span className="st-u">kg e1RM</span></span>
                  <span className="st-pct" style={{color: s.pct < -2 ? 'var(--err)' : 'var(--warn)'}}>{s.pct>0?'+':''}{s.pct}%</span>
                </div>
              ))}
              <div className="av-note" style={{marginTop:9,marginBottom:0}}>Fixes: drop to a back-off set and rebuild, change the rep range, swap to a fresh variation, or check recovery and sleep for that muscle. <b>On a cut a stall is often a win</b> — holding load while losing weight is retention. Act only if a lift stalls <b>and</b> bodyweight is stable.</div>
              </>) : (
                <div className="av-note" style={{marginBottom:0}}>No stalled lifts — everything with enough history is still progressing.</div>
              )}
            </div>
          )}

          {stalls && stalls.progressing.length > 0 && (
            <div className="ar-card">
              <div className="hm-head"><span className="hm-ttl">Progressing</span><span className="hm-wk">{stalls.progressing.length} lift{stalls.progressing.length===1?'':'s'}</span></div>
              {stalls.progressing.slice(0,6).map(s=>(
                <div key={s.id} className="st-row">
                  <span className="st-name">{s.name}</span>
                  <span className="st-e1">{s.bestRecent}<span className="st-u">kg e1RM</span></span>
                  <span className="st-pct" style={{color:'var(--ok)'}}>+{s.pct}%</span>
                </div>
              ))}
            </div>
          )}

          {burnCheck && (
            <div className="ar-card">
              <div className="hm-head"><span className="hm-ttl">Burn cross-check</span><span className="hm-wk">WHOOP vs empirical</span></div>
              <div style={{display:'flex',alignItems:'baseline',gap:10,marginBottom:6,fontFamily:"'JetBrains Mono',monospace"}}>
                <span style={{fontSize:22,fontWeight:700,color:'var(--t)'}}>{burnCheck.avg}</span>
                <span style={{fontSize:12,color:'var(--t3)'}}>WHOOP</span>
                <span style={{fontSize:22,fontWeight:700,color:'var(--acc)'}}>{burnCheck.tdee}</span>
                <span style={{fontSize:12,color:'var(--t3)'}}>empirical</span>
              </div>
              <div style={{fontSize:12,lineHeight:1.5,color:burnCheck.agree?'var(--ok)':'var(--warn)'}}>
                {burnCheck.agree
                  ? `Within ${Math.abs(burnCheck.gap)} kcal across ${burnCheck.days} completed days — the two independent methods agree, so treat the maintenance figure as solid.`
                  : `${burnCheck.gap>0?'WHOOP reads '+burnCheck.gap+' kcal HIGHER':'WHOOP reads '+Math.abs(burnCheck.gap)+' kcal LOWER'} than your intake-vs-weight maintenance across ${burnCheck.days} days. Trust the empirical figure — it is derived from what actually happened to your weight. Wearable burn estimates are commonly out by 10-20%.`}
              </div>
              <div className="ar-note">Uses only completed WHOOP cycles (true full-day burns), never the in-progress cycle. Needs 5+ complete days, so it fills in over the next week.</div>
            </div>
          )}
          {deloadRebound && (
            <div className="ar-card">
              <div className="hm-head"><span className="hm-ttl">Deload rebound</span><span className="hm-wk">week after vs week before</span></div>
              <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:30,fontWeight:700,color:deloadRebound.avg>=1?'var(--ok)':deloadRebound.avg<=-1?'var(--err)':'var(--t2)',marginBottom:6}}>
                {deloadRebound.avg>0?'+':''}{deloadRebound.avg}%
              </div>
              <div style={{fontSize:12,lineHeight:1.5,color:'var(--t2)',marginBottom:8}}>
                {deloadRebound.avg>=1?'Your deloads are paying off — strength comes back higher than it went in. Keep taking them.'
                 :deloadRebound.avg<=-1?'Strength is coming back LOWER after deloads. Either the deload is too deep, or you were not fatigued enough to need it. Consider training through the next one.'
                 :'Flat. Deloads are neither helping nor hurting measurably yet — more events needed before this is decisive.'}
              </div>
              <div className="ar-list">
                {deloadRebound.events.map((e,i)=>(
                  <div key={i} className="ar-row">
                    <span className="ar-mus" style={{textTransform:'none'}}>Block {e.block} · wk {e.week}</span>
                    <span className={`ar-chip ${e.pct>=1?'add':e.pct<=-1?'back':'hold'}`}>{e.pct>0?'+':''}{e.pct}% · {e.before}→{e.after}kg</span>
                  </div>
                ))}
              </div>
              <div className="ar-note">Compares best e1RM on tracked compounds the week after each deload against the week before it. Needs logged sessions either side, so it fills in as blocks complete. Deload weeks themselves are excluded.</div>
            </div>
          )}
          {rirDrift && (
            <div className="ar-card">
              <div className="hm-head"><span className="hm-ttl">RIR drift</span><span className="hm-wk">logged vs prescribed</span></div>
              <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:30,fontWeight:700,color:Math.abs(rirDrift.avg)<=0.5?'var(--ok)':rirDrift.avg>0.5?'var(--warn)':'var(--inf)',marginBottom:6}}>
                {rirDrift.avg>0?'+':''}{rirDrift.avg}
              </div>
              <div style={{fontSize:12,lineHeight:1.5,color:'var(--t2)',marginBottom:8}}>
                {Math.abs(rirDrift.avg)<=0.5?'Logged effort matches the prescription. Your RIR targets are being hit honestly.'
                 :rirDrift.avg>0.5?'You are logging further from failure than the effective target by about '+rirDrift.avg.toFixed(1)+' reps. That can be right (pain, technique, a protected lift) — but if not, push closer or check you are not carrying a wrong default RIR.'
                 :'You are training HARDER than prescribed by about '+Math.abs(rirDrift.avg).toFixed(1)+' reps. Fine occasionally; sustained, it accumulates fatigue faster than the block plans for.'}
              </div>
              <div className="ar-list">
                {rirDrift.rows.slice(-6).map((r,i)=>(
                  <div key={i} className="ar-row">
                    <span className="ar-mus" style={{textTransform:'none'}}>Week {r.week} <span style={{color:'var(--t3)'}}>(target {r.target}, {r.n} sets)</span></span>
                    <span className={`ar-chip ${Math.abs(r.drift)<=0.5?'hold':r.drift>0.5?'back':'load'}`}>{r.drift>0?'+':''}{r.drift}</span>
                  </div>
                ))}
              </div>
              <div className="ar-note">Positive = logging more reps in reserve than programmed. Negative = training closer to failure than programmed. Deload weeks are compared against their own target, and trained-through weeks against 1-2 RIR.</div>
            </div>
          )}
          {strengthRet && (() => {
            const wrate = bwRate ? bwRate.perWeek : null;
            const losing = wrate != null && wrate < -0.1;
            const gaining = wrate != null && wrate > 0.1;
            const sHeld = strengthRet.avgPct >= -1.5;
            const sUp = strengthRet.avgPct > 1.5;
            let verdict, vCls;
            if (losing && sHeld) { verdict = sUp ? 'Losing weight while strength climbs — consistent with recomp. Strong signal, though estimated strength and scale mass are both noisy.' : 'Weight down, strength broadly held — consistent with retaining muscle and losing mostly fat. Not proof, but a good sign. Stay the course.'; vCls='var(--ok)'; }
            else if (losing && !sHeld) { verdict = 'Weight AND strength dropping — you may be losing muscle. Check protein, sleep, and consider easing the deficit.'; vCls='var(--err)'; }
            else if (gaining && sUp) { verdict = 'Weight and strength both up — consistent with a productive gain phase.'; vCls='var(--ok)'; }
            else if (!losing && !gaining && sUp) { verdict = 'Weight flat, strength up — consistent with a slow recomp.'; vCls='var(--ok)'; }
            else if (!losing && !gaining && !sHeld) { verdict = 'Weight flat but strength slipping — look at recovery and fuel around sessions.'; vCls='var(--warn)'; }
            else { verdict = 'Strength holding. Keep watching the trend.'; vCls='var(--t2)'; }
            return (
              <div className="ar-card">
                <div className="hm-head"><span className="hm-ttl">Strength retention</span><span className="hm-wk">21d vs prior 21d · e1RM</span></div>
                <div style={{display:'flex',alignItems:'baseline',gap:10,marginBottom:6}}>
                  <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:30,fontWeight:700,color:strengthRet.avgPct>=-1.5?'var(--ok)':'var(--err)'}}>{strengthRet.avgPct>0?'+':''}{strengthRet.avgPct}%</span>
                  {wrate!=null && <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:12,color:'var(--t2)'}}>weight {wrate>0?'+':''}{wrate.toFixed(2)} kg/wk</span>}
                </div>
                <div style={{fontSize:12,lineHeight:1.5,color:vCls,marginBottom:8}}>{verdict}</div>
                <div className="ar-list">
                  {strengthRet.lifts.map((l,i)=>(
                    <div key={i} className="ar-row">
                      <span className="ar-mus" style={{textTransform:'none'}}>{l.name}</span>
                      <span className={`ar-chip ${l.pct>=1?'add':l.pct<=-2?'back':'hold'}`}>{l.pct>0?'+':''}{l.pct}% · {l.prior}→{l.recent}kg</span>
                    </div>
                  ))}
                </div>
                <div className="ar-note">On a cut, holding e1RM while weight falls is consistent with losing mostly fat and retaining muscle (not proof — strength estimates are noisy). A drop bigger than ~2-3% across several lifts over 3 weeks is the earliest reliable sign the deficit is costing muscle.</div>
              </div>
            );
          })()}
          <div className="ar-card">
            <div className="hm-head"><span className="hm-ttl">Autoregulation</span><span className="hm-wk">push when earned</span></div>
            <div className="ar-list">
              {Object.entries(MUSCLES).map(([key,mus])=>{
                const a=autoReg[key]; if(!a) return null;
                return (
                  <div key={key} className="ar-row">
                    <span className="ar-mus">{mus.name}</span>
                    <span className={`ar-chip ${a.cls}`}>{a.label}</span>
                  </div>
                );
              })}
            </div>
            <div className="ar-note">Add freely on isolation work while a muscle is progressing and recovery holds - no ceiling. Push compounds with load, not sets. Stop adding when a muscle stalls 2 sessions. Health markers override: red recovery or rising BP means hold regardless.</div>
          </div>
          </>}
          <div className="grp-head" onClick={()=>toggleGrp('detail')}><span className="grp-ttl">Detail & coach review</span><span className={'sec-chev'+(grpOpen('detail')?' op':'')}>▾</span></div>
          {grpOpen('detail') && <>

          <div className="mv-sec">
            <div className="mv-head">
              <span className="mv-ttl">Weekly Volume</span>
              <span className="mv-wk">B{block} · Wk {week}</span>
            </div>
            <div className="mv-sub">Hard sets per muscle this week vs hypertrophy target range</div>
            {Object.keys(curVol).length === 0 ? (
              <div className="mv-empty">No sets logged for Week {week} yet.<br/>Complete a session to see your volume.</div>
            ) : (
              Object.entries(MUSCLES).map(([key, mus]) => {
                const done = Math.round((curVol[key] || 0) * 10) / 10;
                if (done === 0 && mus.optional) return null;
                const status = done < mus.min ? 'low' : done > mus.max ? 'high' : 'ok';
                const pct = Math.min(done / mus.max, 1) * 100;
                const tag = status === 'low' ? 'Low' : status === 'high' ? 'High' : 'On target';
                return (
                  <div key={key} className="mv-row">
                    <div className="mv-row-top">
                      <span className="mv-name">{mus.name}</span>
                      <span className="mv-count"><b>{done}</b> / {mus.min}-{mus.max}<span className={`mv-tag ${status}`}>{tag}</span></span>
                    </div>
                    <div className="mv-track"><div className={`mv-fill ${status}`} style={{width: pct + '%'}}/></div>
                  </div>
                );
              })
            )}
            <div style={{marginTop:16}}>
              <div className="chart-lbl">Weekly hard sets — trend</div>
              <select className="ex-sel mv-trend-sel" value={volMuscle} onChange={e => setVolMuscle(e.target.value)}>
                <option value="all">All muscles (total)</option>
                {Object.entries(MUSCLES).map(([k, m]) => <option key={k} value={k}>{m.name}</option>)}
              </select>
              {volSeries.length > 1
                ? <SVGChart data={volSeries} height={130}/>
                : <div className="mv-empty">Log at least two weeks to see the trend.</div>}
            </div>
          </div>
          <div className="rec-trend-sec">
            <div className="mv-head">
              <span className="mv-ttl">Recovery & Fatigue</span>
              <span className="mv-wk">WHOOP</span>
            </div>
            {whoopHistory.length < 2 ? (
              <div className="mv-empty">{whoopConnected ? 'Building your recovery trend — check back after a few more days of WHOOP data.' : 'Connect WHOOP on the Program tab to track recovery and fatigue.'}</div>
            ) : (
              <>
                <div className={`deload-card ${deloadInfo.level}`}>
                  <div className="deload-lbl">{deloadInfo.level==='deload'?'Deload Recommended':deloadInfo.level==='moderate'?'Watch Fatigue':deloadInfo.level==='fresh'?'Recovered':'Building Data'}</div>
                  <div className="deload-msg">{deloadInfo.msg}</div>
                  {deloadInfo.rRec!=null && deloadInfo.bRec!=null && (
                    <div className="deload-stats">7-day recovery {deloadInfo.rRec}% vs {deloadInfo.bRec}% baseline{deloadInfo.rHrv!=null?` \u00b7 HRV ${deloadInfo.rHrv} vs ${deloadInfo.bHrv}ms`:''}</div>
                  )}
                </div>
                <div className="chart-lbl" style={{marginTop:14}}>Recovery — last {Math.min(whoopHistory.length,30)} readings</div>
                <SVGChart data={whoopHistory.slice(-30).map(h=>({x:h.date.slice(5),y:h.recovery,t:new Date(h.date).getTime()}))} height={120} color="#00e87a" trend={true} events={chartEvents}/>
                {whoopHistory.filter(h=>h.hrv!=null).length>1 && (
                  <>
                    <div className="chart-lbl" style={{marginTop:12}}>HRV trend (ms)</div>
                    <SVGChart data={whoopHistory.slice(-30).filter(h=>h.hrv!=null).map(h=>({x:h.date.slice(5),y:h.hrv,t:new Date(h.date).getTime()}))} height={110} color="#4a9eff"/>
                  </>
                )}
                {(() => {
                  // Sleep and body-signal trends from the per-day WHOOP history. Display only: like
                  // every readiness signal, nothing here changes the workout.
                  try {
                    const H = whoopHistory.slice(-30);
                    const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
                    const series = k => H.filter(h => h && Number.isFinite(h[k])).map(h => ({ x: h.date.slice(5), y: h[k], t: new Date(h.date).getTime() }));
                    const cmp = k => {
                      const v = H.filter(h => h && Number.isFinite(h[k]));
                      if (v.length < 5) return null;
                      const base = v.slice(0, -7).map(h => h[k]);
                      return { now: avg(v.slice(-7).map(h => h[k])), base: base.length >= 3 ? avg(base) : null };
                    };
                    const metrics = [
                      ['sleepHrs', 'Sleep', 'h', 1, '#a479e2'],
                      ['rhr', 'Resting HR', ' bpm', 0, '#ff6b6b'],
                      ['skinTemp', 'Skin temp', '\u00b0C', 1, '#e0b020'],
                      ['spo2', 'SpO\u2082', '%', 1, '#4a9eff'],
                      ['respRate', 'Resp. rate', ' rpm', 1, '#00e87a'],
                    ].map(([k, label, unit, dp, color]) => ({ k, label, unit, dp, color, data: series(k), c: cmp(k) }))
                     .filter(m => m.data.length >= 3);
                    if (!metrics.length) return null;
                    const st = H.filter(h => h && Number.isFinite(h.skinTemp));
                    let tempUp = null;
                    if (st.length >= 10) {
                      const d = avg(st.slice(-3).map(h => h.skinTemp)) - avg(st.slice(0, -3).map(h => h.skinTemp));
                      if (d >= 0.5) tempUp = d.toFixed(1);
                    }
                    return (
                      <>
                        <div className="chart-lbl" style={{ marginTop: 16 }}>Sleep and body signals (last 30 days)</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))', gap: 6, margin: '6px 0 4px' }}>
                          {metrics.map(m => {
                            const delta = m.c && m.c.base != null ? m.c.now - m.c.base : null;
                            return (
                              <div key={m.k} style={{ background: 'var(--sur)', border: '1px solid var(--bdr)', borderRadius: 8, padding: '7px 8px' }}>
                                <div style={{ fontSize: 10, color: 'var(--t3)' }}>{m.label} &#183; 7-day</div>
                                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 14, fontWeight: 700, color: m.color }}>{m.c ? m.c.now.toFixed(m.dp) + m.unit : '-'}</div>
                                <div style={{ fontSize: 10, color: 'var(--t3)' }}>{delta != null ? (delta >= 0 ? '+' : '') + delta.toFixed(m.dp) + ' vs before' : 'building baseline'}</div>
                              </div>
                            );
                          })}
                        </div>
                        {tempUp && <div style={{ fontSize: 11, color: '#e0b020', lineHeight: 1.5, margin: '6px 0' }}>Skin temp is {tempUp}&#176;C above your baseline over the last 3 days. That often comes before illness, or after very hard training. It is a prompt to check in with yourself, not a diagnosis.</div>}
                        {metrics.map(m => (
                          <React.Fragment key={m.k}>
                            <div className="chart-lbl" style={{ marginTop: 10 }}>{m.label} ({m.unit.trim()})</div>
                            <SVGChart data={m.data} height={90} color={m.color} />
                          </React.Fragment>
                        ))}
                      </>
                    );
                  } catch (e) { try { console.error('whoop trends failed', e); } catch (_) {} return null; }
                })()}
                {recFuelReady && (
                  <>
                    <div className="chart-lbl" style={{marginTop:14}}>Recovery vs fuel &#8212; last {recFuelRows.filter(r=>r.recovery!=null).length} days</div>
                    <div style={{fontSize:10,color:'var(--t3)',marginBottom:4}}>Green/amber/red dots = recovery. Blue bars = calories in. Read it yourself: do low-recovery days follow low-fuel or low-sleep days?</div>
                    <RecoveryFuelStrip rows={recFuelRows} height={150}/>
                  </>
                )}
              </>
            )}
          </div>
          {logs.length >= 1 && (
            <div className="period-sec">
              <div className="mv-head"><span className="mv-ttl">Coach Review</span></div>
              <div className="mv-sub">Zoom out &#8212; let the AI coach review your week or the whole block</div>
              <div className="period-btns">
                <button className="period-btn" onClick={() => getPeriodReview('week')} disabled={periodLoading}>{periodLoading && periodScope==='week' ? 'Reviewing\u2026' : 'Weekly Check-in'}</button>
                <button className="period-btn" onClick={() => getPeriodReview('block')} disabled={periodLoading}>{periodLoading && periodScope==='block' ? 'Reviewing\u2026' : 'End-of-Block Review'}</button>
              </div>
              {periodReview && <div className="period-out">{periodReview}</div>}
            </div>
          )}
          <div className="ex-sel-wrap">
            <div className="ex-sel-lbl">Select Exercise</div>
            <select className="ex-sel" value={progEx||''} onChange={e=>setProgEx(e.target.value)}>
              <option value="">Choose an exercise</option>
              {ALL_EX.map(e => <option key={e.id} value={e.id}>{e.name} ({e.session})</option>)}
            </select>
          </div>
          {progEx && progChartData.length > 1 && (
            <>
              <div className="metric-tog">
                {[['e1rm','Est. 1RM'],['weight','Top set'],['volume','Volume']].map(([m,lbl])=>(
                  <button key={m} className={`mtog-btn${progMetric===m?' on':''}`} onClick={()=>setProgMetric(m)}>{lbl}</button>
                ))}
              </div>
              <div className="chart-area">
                <div className="chart-lbl">{_metricLbl}</div>
                <SVGChart data={progChartData} height={130}/>
              </div>
              <div className="pstats">
                <div className="pst"><div className="pst-v">{prWeight}{_unit}</div><div className="pst-l">{_prLbl}</div></div>
                <div className="pst"><div className="pst-v">{lastWeight}{_unit}</div><div className="pst-l">Last Session</div></div>
                <div className="pst"><div className="pst-v">{progChartData.length}</div><div className="pst-l">Sessions</div></div>
              </div>
            </>
          )}
          {progEx && (
            <div className="prog-hist">
              {progHist.length===0
                ? <div className="no-data">No data yet.<br/>Log a session to see progress.</div>
                : progHist.map((h,i) => (
                    <div key={i} className="ph-row">
                      <span className="ph-dt">{fmtShort(h.date)}</span>
                      <div className="ph-sets">{h.sets.map((s,j) => <span key={j} className="ph-s">{s.weight}&#215;{s.reps}</span>)}</div>
                    </div>
                  ))
              }
            </div>
          )}
          {!progEx && <div className="empty-msg">Select an exercise above to see your progression chart and history.</div>}
          {movementPRs.length > 0 && (
            <div style={{marginTop:16,background:'var(--crd)',border:'1px solid var(--bdr)',borderRadius:12,padding:14}}>
              <div style={{fontSize:14,fontWeight:800,color:'var(--t)',marginBottom:2}}>Lifetime movement PRs</div>
              <div style={{fontSize:11,color:'var(--t3)',lineHeight:1.5,marginBottom:10}}>Best estimated 1RM for each movement, pooled across every programme slot it appears in. Read-only &#183; this does not change any session prescription.</div>
              {movementPRs.map((m,i)=>(
                <div key={i} style={{display:'flex',alignItems:'baseline',gap:8,padding:'6px 0',borderTop:i?'1px solid var(--bdr)':'none'}}>
                  <span style={{flex:1,fontSize:13,color:'var(--t)',fontWeight:600}}>{m.name}</span>
                  <span style={{fontSize:13,color:'var(--acc)',fontWeight:800,fontFamily:"'JetBrains Mono',monospace"}}>{m.bestE1RM}kg</span>
                  <span style={{fontSize:10,color:'var(--t3)',minWidth:118,textAlign:'right',fontFamily:"'JetBrains Mono',monospace"}}>{m.sessions} sess &#183; {fmtShort(m.lastDate)}</span>
                </div>
              ))}
            </div>
          )}
          </>}
        </div>
      )}
      {view === 'history' && (
        <div className="screen">
          <div className="topbar"><span className="logo">History</span><span className="top-badge">{logs.length} sessions</span></div>
          {logs.length === 0
            ? <div className="empty-msg">No sessions logged yet.<br/>Complete a workout to see it here.</div>
            : <div className="hist-list">
                {logs.map((log,i) => (
                  <div key={i} className="h-item" onClick={() => { if(editingLog===i) return; setExpandLog(expandLog===i?null:i); }}>
                    <div className="h-date">{fmtDate(log.date)} — Block {log.block||1} · Week {log.week}</div>
                    <div className="h-nm">{log.sessionName}</div>
                    <div className="h-det">{log.exercises.length} exercises · {log.duration||'?'} min · {log.exercises.reduce((a,e)=>a+e.sets.length,0)} sets{log.deload===true?<span className="h-pain mild" style={{marginLeft:6}}>deload</span>:(log.deload===false && DLW.has(log.week))?<span className="core-tag" style={{marginLeft:6}}>trained through</span>:null}{log.hv?<span className="core-tag" style={{marginLeft:6}}>high-vol</span>:null}</div>
                    {(() => {
                      const vl = sessionVol(log);
                      // compare to the previous session of the SAME type (e.g. last Upper 1), not just the prior day
                      const priorSame = logs.slice(i+1).find(l => l.sessionId === log.sessionId);
                      const priorVl = priorSame ? sessionVol(priorSame) : null;
                      const pct = (priorVl && priorVl > 0) ? Math.round(((vl - priorVl) / priorVl) * 100) : null;
                      const cls = pct === null ? '' : pct >= 3 ? 'vl-up' : pct <= -8 ? 'vl-dn' : '';
                      return <div className={`h-vol ${cls}`}>Volume: {vl.toLocaleString()}kg{pct!==null?` (${pct>=0?'+':''}${pct}% vs last ${log.sessionName})`:''}</div>;
                    })()}
                    {(() => { const w = matchWorkout(log, whoopWorkouts); return w ? <div className="h-whoop">&#9889; {w.strain} strain{w.avgHr?` \u00b7 ${w.avgHr} avg HR`:''}{w.maxHr?` \u00b7 ${w.maxHr} max`:''}{w.kcal?` \u00b7 ${w.kcal} cal`:''}</div> : null; })()}
                    {expandLog===i && editingLog!==i && (
                      <div className="h-exp">
                        {log.exercises.map((ex,j) => (
                          <div key={j} className="h-ex">
                            <div className="h-ex-nm">{ex.name}{ex.pain?<span className={`h-pain ${ex.pain===2?'sharp':'mild'}`}>{ex.pain===2?'sharp pain':'niggle'}</span>:null}</div>
                            <div className="h-sets">{ex.sets.map((s,k) => <span key={k} className="h-set">{s.weight}kg&#215;{s.reps}{s.rir!=null?` @${s.rir}RIR`:''}</span>)}</div>
                          </div>
                        ))}
                        <button className="edit-start" onClick={(e)=>{e.stopPropagation(); setEditingLog(i); setEditDraft(JSON.parse(JSON.stringify(log)));}}>Edit session</button>
                      </div>
                    )}
                    {expandLog===i && editingLog===i && editDraft && (
                      <div className="h-exp" onClick={e=>e.stopPropagation()}>
                        {editDraft.exercises.map((ex,j) => (
                          <div key={j} className="edit-ex">
                            <div className="edit-ex-hdr"><span className="h-ex-nm">{ex.name}</span><button className="edit-x" aria-label="Remove this exercise" onClick={()=>delExercise(j)}>&#215;</button></div>
                            {ex.sets.map((s,k) => (
                              <div key={k} className="edit-set">
                                <input className="edit-in" type="number" inputMode="decimal" value={s.weight} placeholder="kg" onChange={e=>updSet(j,k,'weight',e.target.value)}/>
                                <span className="edit-x2">&#215;</span>
                                <input className="edit-in" type="number" inputMode="numeric" value={s.reps} placeholder="reps" onChange={e=>updSet(j,k,'reps',e.target.value)}/>
                                <input className="edit-in sm" type="number" inputMode="numeric" value={s.rir==null?'':s.rir} placeholder="RIR" onChange={e=>updSet(j,k,'rir',e.target.value)}/>
                                <button className="edit-del" aria-label="Remove this set" onClick={()=>delSet(j,k)}>&#215;</button>
                              </div>
                            ))}
                            <button className="edit-addset" onClick={()=>addSet(j)}>+ set</button>
                          </div>
                        ))}
                        {(() => { const sess=SESSIONS[editDraft.sessionId]; const missing=(sess?sess.exercises:[]).filter(e=>!editDraft.exercises.some(de=>de.id===e.id)); return missing.length ? (
                          <div className="edit-addex">
                            <select className="edit-sel" value="" onChange={e=>{if(e.target.value)addExercise(e.target.value);}}>
                              <option value="">+ Add a missed exercise</option>
                              {missing.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
                            </select>
                          </div>
                        ) : null; })()}
                        <div className="edit-btns">
                          <button className="edit-cancel" onClick={()=>{setEditingLog(null);setEditDraft(null);}}>Cancel</button>
                          <button className="edit-save" onClick={saveEdit}>Save changes</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
          }
        </div>
      )}

      {view === 'meals' && (() => {
        try {
          const P = MEAL_PLAN;
          const key = mealDay === 'rest' ? 'rest' : (mealTime === 'pm' ? 'train_pm' : 'train_am');
          const meals = P.days[key];
          const tgt = P.targets[mealDay === 'rest' ? 'rest' : 'train'];
          const tot = meals.reduce((a,m)=>({p:a.p+m.p,c:a.c+m.c,f:a.f+m.f}),{p:0,c:0,f:0});
          const kcal = Math.round(tot.p*4 + tot.c*4 + tot.f*9);
          // Live progress against the plan. bwRate can be null (too few weigh-ins); every branch is guarded.
          const r = (typeof bwRate !== 'undefined') ? bwRate : null;
          const latest = (bodyMetrics && bodyMetrics[0] && Number.isFinite(bodyMetrics[0].weight)) ? bodyMetrics[0].weight : null;
          const trend = r && Number.isFinite(r.ewma) ? r.ewma : latest;
          const loss = r && Number.isFinite(r.perWeek) ? -r.perWeek : null;
          const toGo = trend != null ? +(trend - P.goalKg).toFixed(1) : null;
          let vTxt, vCol;
          if (loss == null) { vTxt = 'Not enough weigh-ins yet to judge the rate. Aim for 3+ morning weigh-ins a week.'; vCol = 'var(--t2)'; }
          else if (loss > 0.9) { vTxt = 'Losing over 0.9 kg a week. Add 150 kcal of carbs.'; vCol = 'var(--warn)'; }
          else if (loss >= 0.7) { vTxt = 'Fast end of the range. Hold, and watch your lifts.'; vCol = 'var(--ok)'; }
          else if (loss >= 0.4) { vTxt = 'On target. Hold the plan.'; vCol = 'var(--ok)'; }
          else if (loss >= 0.3) { vTxt = 'Slightly under target. Hold one more week and check you are hitting the numbers.'; vCol = 'var(--warn)'; }
          else { vTxt = 'Under 0.3 kg a week. If this holds for 2 weeks, cut 150 kcal of rest-day carbs or add 2,000 steps a day.'; vCol = 'var(--warn)'; }
          const wksTarget = toGo != null && toGo > 0 ? Math.ceil(toGo / P.targetRate) : null;
          const wksNow = toGo != null && toGo > 0 && loss != null && loss > 0.05 ? Math.ceil(toGo / loss) : null;
          const mono = {fontFamily:"'JetBrains Mono',monospace"};
          const stat = (label, val) => (
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:10,color:'var(--t3)',marginBottom:2}}>{label}</div>
              <div style={{...mono,fontSize:15,fontWeight:700,color:'var(--t)'}}>{val}</div>
            </div>
          );
          return (
            <div className="screen">
              <div className="topbar"><span className="logo">Meals</span><span className="top-badge">Cut to {P.goalKg}kg</span></div>

              <div className="ar-card">
                <div className="hm-head"><span className="hm-ttl">Where you are</span><span className="hm-wk">goal {P.goalKg}kg</span></div>
                <div style={{display:'flex',gap:10,marginBottom:10}}>
                  {stat('Trend weight', trend != null ? trend.toFixed(1)+'kg' : '-')}
                  {stat('To go', toGo != null ? (toGo > 0 ? toGo.toFixed(1)+'kg' : 'Done') : '-')}
                  {stat('Rate', loss != null ? (loss >= 0 ? '-' : '+') + Math.abs(loss).toFixed(2)+'/wk' : '-')}
                </div>
                <div style={{fontSize:12,lineHeight:1.5,color:vCol,fontWeight:600}}>{vTxt}</div>
                {(wksTarget || wksNow) && <div className="ar-note">
                  {wksTarget ? `About ${wksTarget} weeks to go at the planned 0.5 kg a week` : ''}{wksNow ? `${wksTarget ? '; ' : ''}about ${wksNow} at your current rate` : ''}. Add a week for the diet break.
                </div>}
                {trend != null && trend <= P.checkpointKg && toGo > 0 && <div className="ar-note" style={{color:'var(--acc)'}}>Checkpoint reached ({P.checkpointKg}kg). Reassess whether {P.goalKg}kg is still the right finish, or whether a slightly higher, leaner-looking weight is better.</div>}
              </div>

              <div className="ar-card">
                <div style={{display:'flex',gap:6,marginBottom:8}}>
                  <button className={`rc${mealDay==='train'?' nm':''}`} onClick={()=>setMealDay('train')}>Training day</button>
                  <button className={`rc${mealDay==='rest'?' nm':''}`} onClick={()=>setMealDay('rest')}>Rest day</button>
                </div>
                {mealDay === 'train' && <div style={{display:'flex',gap:6,marginBottom:12}}>
                  <button className={`rc${mealTime==='am'?' nm':''}`} onClick={()=>setMealTime('am')}>5am session</button>
                  <button className={`rc${mealTime==='pm'?' nm':''}`} onClick={()=>setMealTime('pm')}>8pm session</button>
                </div>}
                <div style={{display:'flex',gap:6,marginBottom:12}}>
                  {[['kcal',tgt.kcal],['protein',tgt.p+'g'],['carbs',tgt.c+'g'],['fat',tgt.f+'g']].map(([l,v])=>(
                    <div key={l} style={{flex:1,textAlign:'center',padding:'8px 2px',background:'var(--sur)',border:'1px solid var(--bdr)',borderRadius:8}}>
                      <div style={{...mono,fontSize:14,fontWeight:700,color:'var(--acc)'}}>{v}</div>
                      <div style={{fontSize:10,color:'var(--t3)'}}>{l}</div>
                    </div>
                  ))}
                </div>
                {meals.map((m,i)=>(
                  <div key={i} style={{display:'flex',gap:10,padding:'9px 0',borderTop:'1px solid var(--bdr)'}}>
                    <div style={{...mono,fontSize:12,color:'var(--t2)',width:42,flexShrink:0}}>{m.t}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:700,color:'var(--t)'}}>{m.n}</div>
                      <div style={{fontSize:12,color:'var(--t2)',lineHeight:1.45}}>{m.food}</div>
                      <div style={{...mono,fontSize:10,color:'var(--t3)',marginTop:2}}>P {m.p} &#183; C {m.c} &#183; F {m.f}</div>
                    </div>
                  </div>
                ))}
                <div style={{display:'flex',justifyContent:'space-between',paddingTop:9,borderTop:'1px solid var(--bdr)',...mono,fontSize:11,color:'var(--t2)'}}>
                  <span>Day total &#8776; {kcal} kcal</span><span>P {tot.p} &#183; C {tot.c} &#183; F {tot.f}</span>
                </div>
                <div className="ar-note">Fibre {tgt.fibre}g. Weights are cooked unless stated. Swap like for like (chicken for turkey or lean beef, rice for potato) and keep the protein the same.</div>
              </div>

              <div className="ar-card">
                <div className="hm-head"><span className="hm-ttl">Adjustment rules</span><span className="hm-wk">7-day average</span></div>
                {P.rules.map(([sig,act],i)=>(
                  <div key={i} style={{padding:'7px 0',borderTop:i?'1px solid var(--bdr)':'none'}}>
                    <div style={{fontSize:12,fontWeight:700,color:'var(--t)'}}>{sig}</div>
                    <div style={{fontSize:12,color:'var(--t2)',lineHeight:1.45}}>{act}</div>
                  </div>
                ))}
              </div>

              <div className="ar-card">
                <div className="hm-head"><span className="hm-ttl">Habits that support the cut</span></div>
                {P.habits.map((h,i)=>(<div key={i} style={{fontSize:12,color:'var(--t2)',lineHeight:1.5,padding:'5px 0',borderTop:i?'1px solid var(--bdr)':'none'}}>{h}</div>))}
              </div>
            </div>
          );
        } catch(e) {
          try{console.error('meals view failed',e);}catch(_){}
          return <div className="screen"><div className="topbar"><span className="logo">Meals</span></div><div className="empty-msg">The meal plan could not load. Your data is safe; reload the app.</div></div>;
        }
      })()}
      {view === 'privacy' && (() => {
        const fmtB = b => b < 1024 ? b+' B' : b < 1048576 ? (b/1024).toFixed(1)+' KB' : (b/1048576).toFixed(2)+' MB';
        const syncOn = !!syncCode;
        const total = storageBreakdown.total;
        const QUOTA = 5 * 1048576; // ~5MB typical localStorage limit
        const pct = Math.min(100, Math.round(total / QUOTA * 100));
        return (
          <div className="screen">
            <div className="topbar"><span className="logo">Privacy</span><span className="top-badge">{fmtB(total)} on device</span></div>
            <div style={{fontSize:12,color:'var(--t2)',lineHeight:1.6,margin:'4px 0 14px'}}>Everything below is stored on <b>this device</b> in the browser. Nothing is sold or shared. Data leaves this device only when you sync to the cloud or export a backup &#8212; and check-in photos never leave at all.</div>

            <div style={{background:'var(--crd)',border:'1px solid var(--bdr)',borderRadius:12,padding:14,marginBottom:12}}>
              <div style={{fontSize:14,fontWeight:800,marginBottom:2}}>On-device storage</div>
              <div style={{fontSize:11,color:'var(--t3)',marginBottom:10}}>Approx {fmtB(total)} of a ~5 MB browser limit ({pct}%). Photos are usually the heavy item.</div>
              <div style={{height:6,background:'var(--sur)',borderRadius:3,overflow:'hidden',marginBottom:12}}><div style={{width:pct+'%',height:'100%',background:pct>80?'var(--err)':pct>50?'var(--warn)':'var(--acc)'}}/></div>
              {storageBreakdown.rows.map((r,i)=>(
                <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderTop:i?'1px solid var(--bdr)':'none',fontSize:12}}>
                  <span style={{color:'var(--t)'}}>{r.name}</span>
                  <span style={{color:'var(--t3)',fontFamily:"'JetBrains Mono',monospace"}}>{fmtB(r.bytes)}</span>
                </div>
              ))}
            </div>

            <div style={{background:'var(--crd)',border:'1px solid var(--bdr)',borderRadius:12,padding:14,marginBottom:12}}>
              <div style={{fontSize:14,fontWeight:800,marginBottom:8}}>Connected services</div>
              <div style={{fontSize:12,color:'var(--t2)',lineHeight:1.6}}>
                <div>&#8226; <b>Cloud sync:</b> {syncOn ? 'on — training, body, nutrition & health sync to Netlify Blobs. Photos do NOT sync.' : 'off — data stays on this device only.'}</div>
                <div style={{marginTop:6}}>&#8226; <b>WHOOP:</b> {whoopConnected ? 'connected — recovery/sleep read from WHOOP on app open.' : 'not connected.'}</div>
                <div style={{marginTop:6}}>&#8226; <b>AI coaching:</b> runs through a server-side proxy. No API key is stored on this device.</div>
              </div>
            </div>

            <div style={{background:'var(--crd)',border:'1px solid var(--bdr)',borderRadius:12,padding:14,marginBottom:12}}>
              <div style={{fontSize:14,fontWeight:800,marginBottom:8}}>Your controls</div>
              <button className="data-btn" style={{width:'100%',marginBottom:8}} onClick={exportData}>&#8595; Export a backup</button>
              {syncOn && <button className="data-btn" style={{width:'100%',marginBottom:8}} onClick={disconnectSync}>Disconnect cloud sync (keeps local data)</button>}
              {whoopConnected && <button className="data-btn" style={{width:'100%',marginBottom:8}} onClick={disconnectWhoop}>Disconnect WHOOP (local token only)</button>}
              <button className="data-btn danger" style={{width:'100%'}} onClick={()=>setView('tools')}>Clear all data &#8594; in Tools</button>
            </div>

            <div style={{background:'rgba(212,160,23,.08)',border:'1px solid rgba(212,160,23,.3)',borderRadius:12,padding:14,marginBottom:12}}>
              <div style={{fontSize:13,fontWeight:800,color:'var(--warn)',marginBottom:6}}>What this app can&#8217;t do for you</div>
              <div style={{fontSize:12,color:'var(--t2)',lineHeight:1.6}}>
                <div>&#8226; <b>Revoke WHOOP access:</b> disconnecting here only deletes the local token. To fully revoke, go to your WHOOP account &#8594; Connected Apps.</div>
                <div style={{marginTop:6}}>&#8226; <b>Delete cloud data:</b> use &#8220;Clear all data&#8221; in Tools &#8212; it deletes the cloud snapshot too.</div>
                <div style={{marginTop:6}}>&#8226; <b>Rotate secrets:</b> the AI key and any tokens live in your Netlify/provider consoles, not here.</div>
              </div>
            </div>
          </div>
        );
      })()}
      {view === 'tools' && (
        <div className="screen">
          <div className="topbar"><span className="logo">Tools</span></div>
          <div className="tool-sec">
            <div className="tool-ttl">Plate Calculator</div>
            <div className="tool-sub">20kg bar · standard plates</div>
            <div className="tool-inp-row">
              <span className="tool-lbl">Target</span>
              <div className="tool-nw">
                <button className="tool-nb" onClick={() => setPlateTgt(v=>Math.max(20,parseFloat(v||20)-2.5))}>&#8722;</button>
                <input className="tool-ni" type="number" inputMode="decimal" value={plateTgt} onChange={e=>setPlateTgt(e.target.value)}/>
                <button className="tool-nb" onClick={() => setPlateTgt(v=>parseFloat(v||20)+2.5)}>+</button>
              </div>
              <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:12,color:'var(--t2)',minWidth:20}}>kg</span>
            </div>
            <div className="tool-result">
              {plateRes.ok
                ? plateRes.plates.length===0
                  ? <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:12,color:'var(--t2)'}}>Bar only — 20kg</div>
                  : <>
                      <div style={{fontSize:9,letterSpacing:'.15em',color:'var(--t3)',marginBottom:6,textTransform:'uppercase'}}>Each side:</div>
                      {plateRes.plates.map((p,i) => (
                        <div key={i} className="plate-row">
                          <span className="plate-kg">{p.kg}kg &#215; {p.count}</span>
                          <div className="plate-dots">{Array.from({length:Math.min(p.count,8)}).map((_,j) => <div key={j} className="pdot"/>)}</div>
                        </div>
                      ))}
                    </>
                : <div style={{color:'var(--err)',fontSize:12}}>Cannot make {plateTgt}kg with standard plates</div>
              }
            </div>
          </div>
          <div className="tool-sec">
            <div className="tool-ttl">Warm-Up Sets</div>
            <div className="tool-sub">Ramp to your working weight</div>
            <div className="tool-inp-row">
              <span className="tool-lbl">Working</span>
              <div className="tool-nw">
                <button className="tool-nb" onClick={() => setWarmWt(v=>Math.max(20,parseFloat(v||20)-2.5))}>&#8722;</button>
                <input className="tool-ni" type="number" inputMode="decimal" value={warmWt} onChange={e=>setWarmWt(e.target.value)}/>
                <button className="tool-nb" onClick={() => setWarmWt(v=>parseFloat(v||20)+2.5)}>+</button>
              </div>
              <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:12,color:'var(--t2)',minWidth:20}}>kg</span>
            </div>
            <div className="tool-result">
              {warmups.map((w,i) => <div key={i} className="wu-row"><span className="wu-wt">{w.wt}kg</span><span className="wu-reps">{w.reps} reps</span><span className="wu-pct">{w.pct}</span></div>)}
              <div className="wu-row" style={{borderTop:'1px solid var(--acc)',marginTop:4,paddingTop:8}}>
                <span className="wu-wt" style={{color:'var(--acc)'}}>{warmWt}kg</span>
                <span className="wu-reps" style={{color:'var(--t)'}}>Working set</span>
                <span className="wu-pct" style={{color:'var(--acc)'}}>100%</span>
              </div>
            </div>
          </div>
          <div className="tool-sec">
            <div className="tool-ttl">1RM Estimator</div>
            <div className="tool-sub">Epley formula</div>
            <div className="tool-inp-row">
              <span className="tool-lbl">Weight</span>
              <div className="tool-nw">
                <button className="tool-nb" onClick={() => setOrmWt(v=>Math.max(0,parseFloat(v||0)-2.5))}>&#8722;</button>
                <input className="tool-ni" type="number" inputMode="decimal" value={ormWt} onChange={e=>setOrmWt(e.target.value)}/>
                <button className="tool-nb" onClick={() => setOrmWt(v=>parseFloat(v||0)+2.5)}>+</button>
              </div>
              <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:12,color:'var(--t2)',minWidth:20}}>kg</span>
            </div>
            <div className="tool-inp-row">
              <span className="tool-lbl">Reps</span>
              <div className="tool-nw">
                <button className="tool-nb" onClick={() => setOrmRp(v=>Math.max(1,parseInt(v||1)-1))}>&#8722;</button>
                <input className="tool-ni" type="number" inputMode="numeric" value={ormRp} onChange={e=>setOrmRp(e.target.value)}/>
                <button className="tool-nb" onClick={() => setOrmRp(v=>parseInt(v||0)+1)}>+</button>
              </div>
            </div>
            <div className="tool-result">
              <div className="orm-big-wrap">
                <div className="orm-big">{epley(ormWt,ormRp)}</div>
                <div className="orm-unit">kg estimated 1RM</div>
              </div>
            </div>
          </div>
          <div className="tool-sec">
            <div className="tool-ttl">WHOOP</div>
            <div className="tool-sub">{whoopAuthFail?'Reconnect required — your WHOOP authorisation expired':(whoopConnected?'Connected — recovery syncs automatically on app open':'Connect to pull recovery, HRV and sleep data automatically')}</div>
            {whoopStaleNote && !whoopAuthFail && <div className="info-banner" style={{margin:'0 0 10px'}}>Showing cached WHOOP data — last refresh failed. Tap Refresh Now to retry.</div>}
            {whoopAuthFail && <div className="info-banner err" style={{margin:'0 0 10px'}}>WHOOP disconnected — tap Connect WHOOP to re-authorise. Readiness will use your manual recovery selection until then.</div>}
            {whoopConnected?(
              <div>
                {whoopData?.recovery!=null&&<div style={{fontFamily:'JetBrains Mono,monospace',fontSize:12,color:'var(--ok)',marginBottom:10}}>&#10003; Recovery {whoopData.recovery}% · HRV {whoopData.hrv}ms · RHR {whoopData.rhr}bpm</div>}
                <div className="data-btns" style={{gridTemplateColumns:'1fr'}}>
                  <button className="data-btn" onClick={()=>fetchWhoopData()}>&#8635; Refresh Now</button>
                  <button className="data-btn danger" onClick={disconnectWhoop}>Disconnect WHOOP</button>
                </div>
              </div>
            ):(
              <div className="data-btns" style={{gridTemplateColumns:'1fr'}}>
                <button className="data-btn" onClick={()=>window.location.href='/.netlify/functions/whoop-auth'}>Connect WHOOP</button>
              </div>
            )}
          </div>
          <div className="tool-sec">
            <div className="tool-ttl">Cloud Sync</div>
            <div className="tool-sub">Back up your training, body, nutrition and health logs to the cloud so they survive clearing Safari or switching phones. Enter the same code on another device to restore. <b>Check-in photos are NOT cloud-synced</b> — they stay on this device only, so export a backup if you want to keep them.</div>
            {syncCode ? (
              <div>
                <div className={`sync-status ${cloudStatus}`}>
                  {cloudStatus==='syncing'?'Syncing…':cloudStatus==='error'?('Sync error'+(cloudErr?' ('+cloudErr+')':'')+' — will retry on next change'):cloudStatus==='synced'?'✓ Backed up to cloud':'Connected'}
                </div>
                <div className="data-btns" style={{gridTemplateColumns:'1fr 1fr'}}>
                  <button className="data-btn" onClick={()=>syncNow()}>&#8593; Sync Now</button>
                  <button className="data-btn" onClick={()=>pullFromCloud()}>&#8595; Restore</button>
                </div>
                <button className="data-btn danger" style={{width:'100%',marginTop:8}} onClick={disconnectSync}>Disconnect Sync</button>
              </div>
            ) : (
              <div className="api-row">
                <div className="bf-lbl">Sync Code (min 8 characters)</div>
                <button className="data-btn" style={{width:'100%',marginBottom:6}} onClick={genSyncCode}>Generate secure code</button>
                <input className="api-in" type="text" autoCapitalize="none" autoCorrect="off" placeholder="generate one, or type an existing code" value={syncCodeInput} onChange={e=>setSyncCodeInput(e.target.value)}/>
                <div className="api-note">Anyone with this exact code can read and overwrite your data, and there's no rate limit on guesses &#8212; tap <b>Generate secure code</b> for a strong random one. Only type your own if you're restoring on a new device. Don't share or reuse it.</div>
                <button className="bf-save" style={{marginTop:6}} onClick={connectSync}>Enable Cloud Sync</button>
              </div>
            )}
          </div>
          <div className="tool-sec">
            <div className="tool-ttl">AI Coaching</div>
            <div className="tool-sub">AI runs through a server-side proxy — no API key is stored on this device</div>
            <div style={{fontSize:9,color:'var(--t3)',fontFamily:"'JetBrains Mono',monospace",marginTop:6}}>build {BUILD_ID}</div>
            <div className="api-note">The key lives in the Netlify ANTHROPIC_API_KEY env var, never in the browser. Nothing to enter here.</div>
          </div>
          <div className="tool-sec">
            <div className="tool-ttl">Data</div>
            <div className="tool-sub">Export a backup before any app update. Import restores full history.</div>
            <div className="data-btns">
              <button className="data-btn" onClick={exportData}>&#8595; Export Backup</button>
              <button className="data-btn" onClick={exportSummary}>&#128203; Summary (coach/AI)</button>
              <button className="data-btn" onClick={importData}>&#8593; Import Backup</button>
              <button className="data-btn danger" onClick={() => setClearConfirm(true)}>&#128465; Clear All Data</button>
            </div>
            <div className="ver">Diamond Protocol v2.0 — data stored in localStorage</div>
          </div>
        </div>
      )}


      {view==='body'&&(
        <div className="screen">
          <div className="topbar"><span className="logo">Body</span></div>

          <div className="body-sec">
            <div className="sec-head" onClick={()=>toggleSec('weight')}><div className="body-ttl">Body Weight</div><span className={'sec-chev'+(secOpen('weight')?' op':'')}>▾</span></div>
            {secOpen('weight') && <>
            <div className="body-sub">Weekly weigh-in — track alongside your training block</div>
            {(bodyDash.curW!=null) && (
              <div className="dash-cards">
                <div className="dash-card">
                  <div className="dc-lbl">Weight</div>
                  <div className="dc-val">{bodyDash.curW}<span className="dc-u">kg</span></div>
                  <div className="dc-sub">{bodyDash.avg7!=null?`7-day avg ${bodyDash.avg7.toFixed(1)}kg`:''}</div>
                  {bodyDash.wtSpark.length>1 && <div style={{marginTop:4}}><Sparkline vals={bodyDash.wtSpark} color="#c4ff00" w={90}/><div style={{fontSize:8,color:'var(--t3)',fontFamily:"'JetBrains Mono',monospace",marginTop:2}}>{bodyDash.wtSparkFrom&&fmtShort(bodyDash.wtSparkFrom)} &ndash; {bodyDash.wtSparkTo&&fmtShort(bodyDash.wtSparkTo)} &#183; {bodyDash.wtSpark.length} weigh-ins</div></div>}
                </div>
              </div>
            )}
            {bwRate && (
              <div className="bw-rate">
                <span className="bw-rate-v" style={{color: bwRate.perWeek<0?'var(--ok)':bwRate.perWeek>0?'var(--inf)':'var(--t2)'}}>{bwRate.perWeek>0?'+':''}{bwRate.perWeek.toFixed(2)} kg/wk</span>
                <span className="bw-rate-pct">{bwRate.pctWeek>0?'+':''}{bwRate.pctWeek.toFixed(2)}%/wk</span>
                {goalPhase==='cut' && <span className="bw-rate-tgt">target -0.5 to -1%/wk</span>}
              </div>
            )}
            {bwRate && (
              <div className="av-note" style={{margin:'0 15px 10px'}}>
                {bwRate.weeksUsed>=3
                  ? <>Trend across <b>{bwRate.weeksUsed} weekly averages</b>: {bwRate.prior.filter(x=>x!=null).reverse().join(' \u2192 ')} &#8594; <b>{bwRate.thisWeek.avg}kg</b>.</>
                  : <>Last 7 days avg <b>{bwRate.thisWeek.avg}kg</b> ({bwRate.thisWeek.n} weigh-ins) vs prior 7 days <b>{bwRate.lastWeek.avg}kg</b> ({bwRate.lastWeek.n}).</>}
                {' '}Week-over-week alone reads {bwRate.weekOverWeek>0?'+':''}{bwRate.weekOverWeek} kg/wk.
                {bwRate.waterFlag && <> <span style={{color:'var(--warn)'}}>That is far from the multi-week trend &#8212; a water swing is sitting inside one week, so the week-over-week figure is not real tissue change. The multi-week number is the honest one.</span></>}
              </div>
            )}
            {bodyMetrics.length>1&&(
              <div style={{marginBottom:10}}>
                <SVGChart data={bodyMetrics.slice(0,20).reverse().map(m=>({x:fmtShort(m.date),y:m.weight,t:new Date(m.date).getTime()}))} height={120} trend={true} anchor={6} events={chartEvents}/>
              </div>
            )}
            <button className="add-toggle" onClick={()=>setShowAddBody(v=>!v)}>
              <span>Log weight</span><span className="plus">{showAddBody?'−':'+'}</span>
            </button>
            {showAddBody&&(
              <div className="body-form">
                <div className="bf-row">
                  <div className="bf-grp">
                    <div className="bf-lbl">Weight (kg)</div>
                    <input className="bf-in" type="number" inputMode="decimal" placeholder="89.5" value={newWt} onChange={e=>setNewWt(e.target.value)}/>
                  </div>
                  <div className="bf-grp">
                    <div className="bf-lbl">Notes</div>
                    <input className="bf-in" type="text" placeholder="e.g. fasted" value={newWtNote} onChange={e=>setNewWtNote(e.target.value)}/>
                  </div>
                </div>
                <div className="bf-grp"><div className="bf-lbl">Date</div><input className="bf-in" type="date" value={wtDate} onChange={e=>setWtDate(e.target.value)}/></div>
                <button className="bf-save" onClick={addBodyMetric}>Save</button>
              </div>
            )}
            <button className="add-toggle" onClick={()=>setShowWtLog(v=>!v)} style={{marginTop:8}}>
              <span>Full weight log ({bodyMetrics.length})</span><span className="plus">{showWtLog?'−':'+'}</span>
            </button>
            {showWtLog && <div className="body-list">
              {bodyMetrics.slice(0,20).map((m,i)=>(
                <div key={i} className="bl-row">
                  <span className="bl-date">{fmtShort(m.date)}</span>
                  <span className="bl-val">{m.weight}kg{m.bodyFat!=null?` · ${m.bodyFat}% bf`:''}</span>
                  <span className="bl-note">{m.muscle!=null?`${m.muscle}kg lean`:''}{m.notes?((m.muscle!=null?' · ':'')+m.notes):''}</span>
                  <button className="bl-edit" aria-label="Edit this entry" onClick={()=>openBodyEdit('weight',i,m)}>&#9998;</button>
                  <button className="bl-del" aria-label="Delete this entry" onClick={()=>tombstone(setBodyMetrics,'bm')(x=>x===m)}>&#215;</button>
                </div>
              ))}
              {bodyMetrics.length===0&&<div className="empty-msg">No entries yet — log your first weigh-in above.</div>}
            </div>}
            </>}
          </div>

          <div className="body-sec">
            <div className="sec-head" onClick={()=>toggleSec('measurements')}><div className="body-ttl">Measurements</div><span className={'sec-chev'+(secOpen('measurements')?' op':'')}>▾</span></div>
            {secOpen('measurements') && <>
            <div className="body-sub">Track circumference to separate muscle gain from fat and water</div>
            {Object.keys(latestBySite).length > 0 && (
              <div className="site-trends">
                {[...MEAS_SITES.filter(s=>latestBySite[s]), ...Object.keys(latestBySite).filter(s=>!MEAS_SITES.includes(s))].map(s => {
                  const d = bodyDash.perSite[s] || {};
                  const key = KEY_SITES.includes(s);
                  const expanded = expandedSite===s;
                  return (
                    <div key={s} className={`site-row${key?' site-key':''}`}>
                      <div className="site-main" onClick={()=>{setExpandedSite(expanded?null:s); setMViewSite(s);}}>
                        <span className="site-nm">{s}</span>
                        <span className="site-spark">{d.spark && d.spark.length>1 && <Sparkline vals={d.spark} color={key?'#4a9eff':'#5a6b7a'}/>}</span>
                        <span className="site-latest">{d.latest!=null?d.latest:'—'}<span className="site-u">cm</span></span>
                        <span className="site-chg" style={{color: d.change>0?'var(--inf)':d.change<0?'var(--ok)':'var(--t3)'}}>
                          {d.change!=null?`${d.change>0?'▲':d.change<0?'▼':''}${Math.abs(d.change)}`:''}
                        </span>
                      </div>
                      {expanded && (
                        <div className="site-hist">
                          {measurements.filter(m=>m.site===s).slice(0,12).map((m,i)=>(
                            <div key={i} className="sh-row">
                              <span className="sh-date">{fmtShort(m.date)}</span>
                              <span className="sh-val">{m.value}cm</span>
                              <button className="bl-edit" aria-label="Edit this entry" onClick={()=>openBodyEdit('meas',measurements.indexOf(m),m)}>&#9998;</button>
                              <button className="bl-del" aria-label="Delete this entry" onClick={()=>tombstone(setMeasurements,'ms')(x=>x===m)}>&#215;</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {measSeries.length > 1 && expandedSite && (
              <div style={{marginTop:8,marginBottom:10}}>
                <div className="chart-lbl">{mViewSite} — trend (cm)</div>
                <SVGChart data={measSeries} height={120} color="#4a9eff"/>
              </div>
            )}
            <button className="add-toggle" onClick={() => setShowAddMeas(v => !v)}>
              <span>Log a measurement</span><span className="plus">{showAddMeas ? '\u2212' : '+'}</span>
            </button>
            {showAddMeas && (
              <div className="body-form">
                <div className="bf-row">
                  <div className="bf-grp">
                    <div className="bf-lbl">Site</div>
                    <select className="bf-sel" value={mSite} onChange={e => setMSite(e.target.value)}>
                      {MEAS_SITES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="bf-grp">
                    <div className="bf-lbl">Measurement (cm)</div>
                    <input className="bf-in" type="number" inputMode="decimal" placeholder="e.g. 40.5" value={mVal} onChange={e => setMVal(e.target.value)}/>
                  </div>
                </div>
                <div className="bf-grp"><div className="bf-lbl">Date</div><input className="bf-in" type="date" value={mDate} onChange={e=>setMDate(e.target.value)}/></div>
                <button className="bf-save" onClick={addMeasurement}>Save</button>
              </div>
            )}
            {measurements.length === 0 && <div className="empty-msg">No measurements yet.<br/>Log your first site above.</div>}
            </>}
          </div>

          <div className="body-sec">
            <div className="sec-head" onClick={()=>toggleSec('photos')}><div className="body-ttl">Check-In Photos</div><span className={'sec-chev'+(secOpen('photos')?' op':'')}>▾</span></div>
            {secOpen('photos') && <>
            <div className="body-sub">Stored on this device only. Same pose, same light, same time of day — consistency is what makes progress visible. Compress automatically; keeps your most recent 24.</div>
            <div style={{display:'flex',gap:6,marginBottom:10}}>
              {['all','front','side','back'].map(p=>(
                <button key={p} onClick={()=>setCiPose(p)} style={{flex:1,padding:'7px',fontSize:11,borderRadius:7,border:'1px solid var(--bdr)',background:ciPose===p?'var(--acc)':'var(--sur)',color:ciPose===p?'#000':'var(--t2)',fontWeight:ciPose===p?700:500,textTransform:'capitalize'}}>{p}</button>
              ))}
            </div>
            <div style={{display:'flex',gap:6,marginBottom:8,alignItems:'center'}}>
              <span style={{fontSize:10.5,color:'var(--t2)',letterSpacing:'.1em',textTransform:'uppercase'}}>Add as</span>
              {['front','side','back'].map(p=>(
                <button key={p} onClick={()=>setCiAddPose(p)} style={{padding:'5px 11px',fontSize:10.5,borderRadius:6,border:'1px solid var(--bdr)',background:ciAddPose===p?'var(--acc)':'var(--sur)',color:ciAddPose===p?'#000':'var(--t2)',fontWeight:ciAddPose===p?700:500,textTransform:'capitalize'}}>{p}</button>
              ))}
            </div>
            <label className="add-toggle" style={{cursor:'pointer',display:'flex'}}>
              <span>Add {ciAddPose} photo</span><span className="plus">+</span>
              <input type="file" accept="image/*" style={{display:'none'}} onChange={e=>{addCheckin(e.target.files[0]); e.target.value='';}}/>
            </label>

            {checkins.length>0&&(() => {
              // GROUPED BY CHECK-IN DATE, newest first. A check-in is one event - you stand in
              // the same spot and shoot front, side and back together - so the date is the
              // natural unit. Grouping by pose hid the side view behind a tab, which is where
              // waist change reads most clearly on a cut. Poses keep consistent order within a
              // row so scanning down a column is still a like-for-like comparison, and a date
              // with only one pose shows one photo rather than two empty slots.
              const POSE_ORDER = ['front','side','back'];
              const POSE_TAG = { front:'F', side:'S', back:'B' };
              const pool = ciPose === 'all' ? checkins : checkins.filter(c => c.pose === ciPose);
              if (!pool.length) return <div className="empty-msg">No {ciPose==='all'?'':ciPose+' '}photos yet.<br/>Add one above.</div>;
              const byDay = {};
              for (const c of pool) {
                const d = (c.date||'').slice(0,10);
                (byDay[d] = byDay[d] || []).push(c);
              }
              const days = Object.keys(byDay).sort((a,b) => a < b ? 1 : -1);
              return (
                <div style={{marginTop:10}}>
                  {days.map(day => {
                    const row = byDay[day].slice().sort(
                      (a,b) => POSE_ORDER.indexOf(a.pose) - POSE_ORDER.indexOf(b.pose));
                    const head = row[0];
                    return (
                      <div key={day} style={{marginBottom:12}}>
                        <div className="dc-lbl" style={{marginBottom:5}}>
                          {fmtShort(head.date)}{head.weight?` \u00b7 ${head.weight}kg`:''}{head.week?` \u00b7 W${head.week}`:''}
                        </div>
                        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:6}}>
                          {row.map(c=>{
                            const selA=ciCompareA===c.id, selB=ciCompareB===c.id;
                            // Same-pose guard. With poses mixed on screen it becomes possible to
                            // tap a front for A and a side for B, and the AI would produce a
                            // confident read of two different views. Once A is chosen, only the
                            // matching pose can be selected for B.
                            const aSel = ciCompareA ? checkins.find(x=>x.id===ciCompareA) : null;
                            const blocked = !!(aSel && !selA && !selB && aSel.pose !== c.pose);
                            return (
                              <div key={c.id} style={{position:'relative',borderRadius:8,overflow:'hidden',opacity:blocked?0.35:1,border:selA?'2px solid var(--acc)':selB?'2px solid var(--inf)':'1px solid var(--bdr)'}}>
                                <img src={imgOf(c)} alt={c.pose} style={{width:'100%',aspectRatio:'3/4',objectFit:'cover',display:'block'}}
                                  onClick={()=>{
                                    if(selA){setCiCompareA(null);setCiCompareB(null);}
                                    else if(selB){setCiCompareB(null);}
                                    else if(blocked){return;}
                                    else if(!ciCompareA){setCiCompareA(c.id);}
                                    else if(!ciCompareB){setCiCompareB(c.id);}
                                    else {setCiCompareA(c.id);setCiCompareB(null);}
                                  }}/>
                                <div style={{position:'absolute',top:0,left:0,right:0,padding:'3px 5px',background:'rgba(0,0,0,.65)',fontSize:8,color:'#fff',display:'flex',justifyContent:'space-between'}}>
                                  <span style={{fontWeight:700,letterSpacing:'.06em'}}>{POSE_TAG[c.pose]||'?'}</span>
                                  <span>{selA&&<span style={{color:'var(--acc)',fontWeight:700}}>A</span>}{selB&&<span style={{color:'var(--inf)',fontWeight:700}}>B</span>}</span>
                                </div>
                                <button aria-label="Delete this check-in photo" onClick={()=>delCheckin(c.id)} style={{position:'absolute',top:2,right:2,width:30,height:30,borderRadius:15,border:'none',background:'rgba(0,0,0,.6)',color:'#fff',fontSize:15,lineHeight:'28px',padding:0}}>&#215;</button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
            {checkins.length===0&&<div className="empty-msg">No check-ins yet.<br/>Add your week-1 baseline in each pose.</div>}

            {checkins.length>=2&&(
              <div style={{marginTop:12}}>
                <div className="body-sub" style={{marginBottom:6}}>Tap two photos (A = baseline, B = current), then analyse. AI gives an honest visual read anchored to your weight/waist trend — it will not invent a body-fat number.</div>
                <button className="bf-save" style={{opacity:(ciCompareA&&ciCompareB)?1:0.5}} disabled={ciAnalysing||!ciCompareA||!ciCompareB} onClick={analyseProgress}>
                  {ciAnalysing?'Analysing…':'Analyse progress (A vs B)'}
                </button>
                {ciAnalysis&&(
                  <div style={{marginTop:10,padding:'11px 13px',background:'var(--sur)',border:'1px solid var(--bdr)',borderRadius:9,fontSize:13,lineHeight:1.5,whiteSpace:'pre-wrap',color:'var(--t)'}}>{ciAnalysis}</div>
                )}
              </div>
            )}
            </>}
          </div>

          <div className="body-sec">
            <div className="sec-head" onClick={()=>toggleSec('nutrition')}><div className="body-ttl">Nutrition</div><span className={'sec-chev'+(secOpen('nutrition')?' op':'')}>▾</span></div>
            {secOpen('nutrition') && <>
            <div className="body-sub">Daily macro totals — read them off your tracker and log them here to line fuel up with training</div>
            <div className="nc">
              <div className="nc-hd"><span className="nc-ttl">Smart targets</span>{nutriCoach.ok && <span className={'nc-conf '+nutriCoach.conf}>{nutriCoach.conf} confidence</span>}</div>
              {!nutriCoach.ok && nutriCoach.reason==='stale' && <div className="nc-note">Your most recent food/weight log is {nutriCoach.ageDays} days old, so these targets have expired. Log a few days of food and a weigh-in to recalculate.</div>}
              {!nutriCoach.ok && nutriCoach.reason==='stale_weight' && <div className="nc-note">Your most recent weigh-in is {nutriCoach.ageDays!=null?nutriCoach.ageDays+' days old':'missing'}, so targets can't be calculated from it. Log a fresh weigh-in.</div>}
              {!nutriCoach.ok && nutriCoach.reason==='implausible' && !(activeTarget && Number.isFinite(activeTarget.cals)) && <div className="nc-note">Your weight is holding roughly steady on ~{nutriCoach.avgIntake} kcal/day, so that's close to your maintenance. The short-term trend ({nutriCoach.ratePerWk!=null?(nutriCoach.ratePerWk>0?'+':'')+nutriCoach.ratePerWk+' kg/wk':'unclear'}) is too water-noisy to auto-lock a precise target &#8212; but to {goalPhase==='cut'?'lose':goalPhase==='bulk'?'gain':'hold'}, {goalPhase==='cut'?'drop to':goalPhase==='bulk'?'push to':'stay around'} <b>{nutriCoach.suggested} kcal/day</b> and keep weighing in daily. A precise target locks in once the trend clears.</div>}
              {!nutriCoach.ok && nutriCoach.reason==='implausible' && !(activeTarget && Number.isFinite(activeTarget.cals)) && nutriCoach.carbG!=null && (nutriCoach.dayTargets ? (
                <div style={{marginTop:8}}>
                  <div className="nc-dayrow"><span className="nc-daylbl">Training day</span><span className="nc-daykcal">{nutriCoach.dayTargets.train.cals} kcal</span><span className="nc-macros"><span className="nc-mac p">P {nutriCoach.dayTargets.train.protein}g</span><span className="nc-mac c">C {nutriCoach.dayTargets.train.carb}g</span><span className="nc-mac f">F {nutriCoach.dayTargets.train.fat}g</span></span></div>
                  <div className="nc-dayrow"><span className="nc-daylbl">Rest day</span><span className="nc-daykcal">{nutriCoach.dayTargets.rest.cals} kcal</span><span className="nc-macros"><span className="nc-mac p">P {nutriCoach.dayTargets.rest.protein}g</span><span className="nc-mac c">C {nutriCoach.dayTargets.rest.carb}g</span><span className="nc-mac f">F {nutriCoach.dayTargets.rest.fat}g</span></span></div>
                  <div className="nc-tgt-avg">Weekly avg {nutriCoach.suggested} kcal &#183; C {nutriCoach.carbG}g/day ({nutriCoach.cycle.trainDays} train / {nutriCoach.cycle.restDays} rest) &#183; protein &amp; fat held every day, carbs cycled</div>
                </div>
              ) : (
                <div className="nc-macros" style={{marginTop:8}}><span className="nc-mac p">P {nutriCoach.proteinG}g</span><span className="nc-mac c">C {nutriCoach.carbG}g</span><span className="nc-mac f">F {nutriCoach.fatG}g</span></div>
              ))}
              {!nutriCoach.ok && nutriCoach.reason && nutriCoach.reason!=='stale' && nutriCoach.reason!=='stale_weight' && nutriCoach.reason!=='implausible' && <div className="nc-note">{nutriCoach.reason}</div>}
              {!nutriCoach.ok && nutriCoach.partial && <div className="nc-note">Need ~1-2 weeks of consistent logging to estimate your maintenance. So far: {nutriCoach.foodDays} food day{nutriCoach.foodDays===1?'':'s'} and {nutriCoach.weighIns} weigh-in{nutriCoach.weighIns===1?'':'s'} in the last 14 days.</div>}
              {!nutriCoach.ok && nutriCoach.reason==='noisy' && <div className="nc-note">Your weight trend is too noisy right now to set a reliable target (reading {nutriCoach.ratePerWk>0?'+':''}{nutriCoach.ratePerWk} kg/wk, which is water not tissue). You are logging ~{nutriCoach.avgIntake} kcal/day &#8212; hold there and keep weighing in daily; the trend will settle within a few days.</div>}
              {(nutriCoach.ok || (effTargets && effTargets.source==='locked')) && (
                <div className="nc-body">
                  <div className="nc-tgt nc-hero">
                    {effTargets && effTargets.dayTargets ? (() => {
                      const dt = effTargets.dayTargets[nutriDayType];
                      return (
                        <>
                          <div className="nc-daytoggle">
                            <button className={`nc-dtb${nutriDayType==='train'?' on':''}`} onClick={()=>setNutriDayType('train')}>Training day</button>
                            <button className={`nc-dtb${nutriDayType==='rest'?' on':''}`} onClick={()=>setNutriDayType('rest')}>Rest day</button>
                          </div>
                          <div className="nc-eat">Eat today</div>
                          <div className="nc-tgt-cal nc-tgt-hero">{dt.cals} <span>kcal</span></div>
                          <div className="nc-macros"><span className="nc-mac p">P {dt.protein}g</span><span className="nc-mac c">C {dt.carb}g</span><span className="nc-mac f">F {dt.fat}g</span></div>
                          {hydration && (() => {
                    const isT = nutriDayType==='train';
                    const h = isT ? hydration.train : hydration.rest;
                    return (
                      <div className="mp-box">
                        <div className="mp-head">
                          <span className="mp-ttl">Hydration &amp; electrolytes &#183; {isT?'training day':'rest day'}</span>
                          <span className="mp-cals">~{hydration.litres} L</span>
                        </div>
                        {isT && hydration.phases ? (
                          <div className="ph-grid">
                            <div className="ph-hd"/>
                            {hydration.phases.map(p=>(<div key={'h'+p.k} className="ph-hd">{p.label}<span>{p.vol}</span></div>))}
                            {[['Sodium citrate','naCit','g'],['Grey salt','salt','g'],['Potassium citrate','kCit','g'],['Taurine','tau','g']].map(([lbl,fld,u])=>(
                              <React.Fragment key={fld}>
                                <div className="ph-lbl">{lbl}</div>
                                {hydration.phases.map(p=>(
                                  <div key={p.k+fld} className={'ph-v'+(p[fld]?'':' nil')}>{p[fld]?p[fld]+u:'\u2014'}</div>
                                ))}
                              </React.Fragment>
                            ))}
                            <div className="ph-lbl tot">&#8594; sodium</div>
                            {hydration.phases.map(p=>(<div key={p.k+'na'} className="ph-v tot">{p.na}<span>mg</span></div>))}
                            <div className="ph-lbl tot">&#8594; potassium</div>
                            {hydration.phases.map(p=>(<div key={p.k+'k'} className="ph-v tot">{p.k}<span>mg</span></div>))}
                          </div>
                        ) : (<>
                          <div className="mp-row"><span className="mp-name">Sodium citrate</span><span className="mp-cals">{h.naCit} g</span><span className="mp-macros">{h.vol}</span></div>
                          <div className="mp-row"><span className="mp-name">Grey salt</span><span className="mp-cals">{h.salt} g</span><span className="mp-macros">&#8594; {h.na} mg Na</span></div>
                          <div className="mp-row">{h.kCit>0
                            ? <><span className="mp-name">Potassium citrate</span><span className="mp-cals">{h.kCit} g</span><span className="mp-macros">&#8594; {h.k} mg K</span></>
                            : <><span className="mp-name">Potassium</span><span className="mp-cals" style={{color:'var(--t2)'}}>food-led</span><span className="mp-macros">greens, potato, yoghurt</span></>}</div>
                          <div className="mp-row"><span className="mp-name">Taurine</span><span className="mp-cals">{h.tau} g</span><span className="mp-macros">through the day</span></div>
                        </>)}
                        <div className="mp-row" style={{borderBottom:'none'}}><span className="mp-name" style={{color:'var(--t2)'}}>With food (~{hydration.foodNa}/{hydration.foodK})</span><span className="mp-cals" style={{color:'var(--t2)'}}>{h.na+hydration.foodNa}</span><span className="mp-macros">mg Na &#183; {h.k+hydration.foodK} mg K</span></div>
                        <div className="av-note" style={{marginTop:8,marginBottom:0}}>
                          Water stays near 4 L both days &#8212; a constant habit is easier to keep. The <b>electrolytes</b> change:
                          training replaces ~1 g of sodium lost in sweat; rest days need less, but not none, because 4 L without
                          sweating dilutes plasma sodium.
                          Judge by thirst, cramp and urine colour &#8212; pale straw is right, clear all day means you are over-drinking.
                          Magnesium malate at night to ~200&ndash;300 mg elemental Mg (check your label &#8212; roughly 1.5&ndash;2 g), <b>not</b> in the drink.
                          Creatine monohydrate 5 g every day, both training and rest, any time &#8212; not part of the drink.
                          Dextrose is optional: 15&ndash;25 g intra only on a long or heavy session, and it counts toward your carbs.
                        </div>
                        <div className="av-note" style={{marginTop:6,marginBottom:0,color:'var(--warn)'}}>
                          Potassium is kept deliberately low and food-led. Your cystatin C was flagged above range, and renal
                          clearance is what protects against potassium building up &#8212; worth confirming this dose with whoever
                          manages your protocol before making it routine. These figures are tuned to your labs, not a general protocol.
                        </div>
                      </div>
                    );
                  })()}
                  {mealPlan && (
                    <div className="mp-box">
                      <div className="mp-head">
                        <span className="mp-ttl">Meal split &#183; {nutriDayType==='train'?'training day':'rest day'}</span>
                        {nutriDayType==='train' && (
                          <span className="mp-slot">
                            {[['am','5am'],['pm','8pm']].map(([k,l])=>(
                              <button key={k} className={mealSlot===k?'on':''} onClick={()=>setMealSlot(k)}>{l}</button>
                            ))}
                          </span>
                        )}
                      </div>
                      {(nutriDayType==='train'?mealPlan.train:mealPlan.rest).map((m,i)=>(
                        <div key={i} className="mp-row">
                          <span className="mp-name">{m.name}</span>
                          <span className="mp-cals">{m.cals}</span>
                          <span className="mp-macros">P{m.protein} C{m.carb} F{m.fat}</span>
                        </div>
                      ))}
                      <div className="av-note" style={{marginTop:8,marginBottom:0}}>
                        Protein spread evenly &#8212; per-meal protein drives synthesis more than the daily total.
                        Fat kept out of the pre-workout feed so it does not slow digestion.
                        {nutriDayType==='train' && ' Carbs concentrated around training.'}
                        {' '}A guide, not a rule: hit the daily totals however suits the day.
                      </div>
                    </div>
                  )}
                  <div className="nc-tgt-avg">Weekly avg {effTargets.weekly} kcal{effTargets.source==='locked'?' (locked)':''} &#183; C {effTargets.carb}g/day ({effTargets.cycle.trainDays} train / {effTargets.cycle.restDays} rest) &#183; {nutriCoach.ok?(nutriCoach.phase==="cut"?(nutriCoach.floorLimited?("floor-limited \u2212"+nutriCoach.impliedRatePct+"%/wk"):("cut \u2212"+nutriCoach.targetRatePct+"%/wk")):nutriCoach.phase==="bulk"?("lean gain +"+nutriCoach.targetRatePct+"%/wk"):"maintenance"):(goalPhase==='cut'?"cut \u2014 held":goalPhase==='bulk'?"lean gain \u2014 held":"maintenance \u2014 held")}</div>
                          {nutriCoach.floorLimited && effTargets.source!=='locked' && <div className="nc-tgt-avg" style={{color:"var(--warn)"}}>Held at the {nutriCoach.kcalFloor} kcal minimum ({Math.round(nutriCoach.trendW)}kg &#215; 22), so this prescribes about &#8722;{nutriCoach.impliedRatePct}%/wk rather than the &#8722;{nutriCoach.targetRatePct}%/wk selected. Losing faster would mean going below the floor.</div>}
                        </>
                      );
                    })() : (
                      <>
                        <div className="nc-tgt-hd">{nutriCoach.phase==='cut'?('Cut target (-'+nutriCoach.targetRatePct+'%/wk)'):nutriCoach.phase==='bulk'?'Lean-gain target':'Maintenance target'}</div>
                        <div className="nc-tgt-cal nc-tgt-hero">{nutriCoach.targetCals} <span>kcal/day</span></div>
                        <div className="nc-macros"><span className="nc-mac p">P {nutriCoach.proteinG}g</span><span className="nc-mac c">C {nutriCoach.carbG}g</span><span className="nc-mac f">F {nutriCoach.fatG}g</span></div>
                      </>
                    )}
                  </div>
                  {targetLock && (
                    <div className="tl-box">
                      {targetLock.active ? (<>
                        <div className="tl-row"><span className="tl-k">Active target</span><span className="tl-v">{targetLock.active.cals} kcal{targetLock.active.manual?<span className="tl-tag">manual</span>:null}</span></div>
                        <div className="tl-sub">Locked {targetLock.ageDays===0?'today':targetLock.ageDays+'d ago'} &#183; {targetLock.due?'review due now':'review in '+(7-targetLock.ageDays)+'d'}</div>
                      </>) : (
                        <div className="tl-sub">No target locked yet &#8212; accept one to hold it for the week.</div>
                      )}
                      <div className="tl-row" style={{marginTop:7}}><span className="tl-k">Live maintenance</span><span className="tl-v" style={{color:'var(--t2)'}}>{nutriCoach.ok && nutriCoach.tdee!=null ? nutriCoach.tdee+' kcal' : 'unsettled'}</span></div>
                      <div className="tl-sub">Updates daily as information. Does not change what you eat.</div>
                      {targetLock.active && targetLock.candidate && targetLock.delta!=null && (<>
                        <div className="tl-row" style={{marginTop:7}}><span className="tl-k">Next target</span>
                          <span className="tl-v" style={{color: targetLock.delta===0?'var(--t2)':'var(--acc)'}}>
                            {targetLock.delta===0 ? 'no change' : (targetLock.active.cals+targetLock.delta)+' kcal'}
                          </span></div>
                        <div className="tl-sub">{targetLock.delta===0
                          ? 'Difference is inside the noise of the estimate \u2014 holding.'
                          : (targetLock.delta>0?'+':'')+targetLock.delta+' kcal, capped at 100/week so one odd week cannot swing it.'}</div>
                      </>)}
                      {targetLock.active && !targetLock.candidate && (
                        <div className="tl-sub" style={{marginTop:7,color:'var(--warn)'}}>Estimate is unsettled this week &#8212; no reliable adjustment to suggest, so your locked target holds. Keep weighing in; it resumes once the trend clears.</div>
                      )}
                      {(targetLock.due || !targetLock.active) && (<>
                        <div className="tl-edit">
                          <span className="tl-k" style={{whiteSpace:'nowrap'}}>Lock at</span>
                          <input type="number" inputMode="numeric" step="10"
                            placeholder={String(targetLock.active && targetLock.delta!=null ? targetLock.active.cals+targetLock.delta : (targetLock.candidate ? targetLock.candidate.cals : (targetLock.active ? targetLock.active.cals : '')))}
                            value={lockCals} onChange={e=>setLockCals(e.target.value)}/>
                          <span className="tl-sub" style={{margin:0}}>kcal</span>
                        </div>
                        <button className="tl-btn" onClick={()=>{
                          const v=parseFloat(lockCals);
                          acceptTarget(isFinite(v)&&v>0 ? v : undefined);
                        }}>
                          {lockCals.trim() ? 'Lock '+lockCals.trim()+' kcal for the week'
                            : (targetLock.candidate ? (targetLock.active ? 'Accept the suggested target' : 'Lock the suggested target') : 'Hold '+targetLock.active.cals+' kcal for another week')}
                        </button>
                        <div className="tl-sub">{targetLock.candidate ? 'Leave blank to take the suggestion. Type a number to set your own \u2014 it will still hold for seven days.' : 'Type a number to change it, or hold to keep your current target for another week.'}</div>
                      </>)}
                    </div>
                  )}
                  {nutriCoach.adjust && nutriCoach.adjust.dir==='gap' && <div className="nc-adj down">You are averaging <b>{nutriCoach.adjust.over} kcal/day over target</b>. That gap explains the stall &#8212; the target itself is fine. Close it before changing anything.</div>}
                  {nutriCoach.adjust && nutriCoach.adjust.dir==='down' && <div className="nc-adj down">Intake is on target but loss has stalled. Drop ~{nutriCoach.adjust.kcal} kcal/day: -{nutriCoach.adjust.carb}g carb and -{nutriCoach.adjust.fat}g fat, protein held.</div>}
                  {nutriCoach.adjust && nutriCoach.adjust.dir==='up' && <div className="nc-adj up">Dropping faster than 1%/wk. Add ~{nutriCoach.adjust.kcal} kcal/day (+{nutriCoach.adjust.carb}g carb) to protect muscle.</div>}
                  {nutriCoach.adjust && nutriCoach.adjust.dir==='hold' && <div className="nc-adj hold">On track. Loss rate is in the target range, hold these numbers.</div>}
                  {nutriCoach.ok
                    ? <div className="nc-ctx">est. maintenance ~{nutriCoach.tdee} kcal ({nutriCoach.conf} confidence) &#183; logging ~{nutriCoach.avgIntake}/day &#183; {nutriCoach.ratePerWk>0?'+':''}{nutriCoach.ratePerWk.toFixed(2)} kg/wk over {nutriCoach.spanDays}d</div>
                    : <div className="nc-ctx">engine can't verify maintenance this week &#8212; trend {nutriCoach.ratePerWk!=null?(nutriCoach.ratePerWk>0?'+':'')+nutriCoach.ratePerWk+' kg/wk':'unclear'} is too water-noisy{nutriCoach.avgIntake!=null?' at ~'+nutriCoach.avgIntake+' kcal/day logged':''}{nutriCoach.suggested!=null?'; it would otherwise suggest ~'+nutriCoach.suggested+' kcal':''}. Holding your locked target.</div>}
                </div>
              )}
            </div>
            {(nutriCoach.ok && nutriCoach.avgIntake!=null) ? (
              <div className="energy-bal">
                <div className="eb-item"><div className="eb-v">{nutriCoach.avgIntake}</div><div className="eb-l">avg in</div></div>
                <div className="eb-op">&#8722;</div>
                <div className="eb-item"><div className="eb-v">{nutriCoach.tdee}</div><div className="eb-l">maintenance</div></div>
                <div className="eb-op">=</div>
                <div className="eb-item"><div className="eb-v" style={{color: (nutriCoach.avgIntake-nutriCoach.tdee)>=0?'var(--acc)':'var(--warn)'}}>{(nutriCoach.avgIntake-nutriCoach.tdee)>=0?'+':''}{nutriCoach.avgIntake-nutriCoach.tdee}</div><div className="eb-l">daily net</div></div>
              </div>
            ) : null}
            {calStats && (
              <div className="dash-cards">
                <div className="dash-card">
                  <div className="dc-lbl">7-day calories</div>
                  <div className="dc-val">{calStats.avgCal}<span className="dc-u">kcal</span></div>
                  <div className="dc-sub" style={{color: Math.abs(calStats.calDelta)<=100?'var(--t2)':calStats.calDelta<0?'var(--warn)':'var(--inf)'}}>
                    {calStats.calDelta>=0?'+':''}{calStats.calDelta} vs {calStats.calTgt} weekly-avg target
                  </div>
                </div>
                <div className="dash-card">
                  <div className="dc-lbl">7-day protein</div>
                  <div className="dc-val">{calStats.avgP}<span className="dc-u">g</span></div>
                  <div className="dc-sub" style={{color: calStats.pDelta>=-10?'var(--ok)':'var(--warn)'}}>
                    {calStats.pDelta>=0?'+':''}{calStats.pDelta} vs {calStats.pTgt}g target
                  </div>
                </div>
              </div>
            )}
            {protSeries.length > 1 && (
              <div style={{marginBottom:10}}>
                <div className="chart-lbl">Protein — last {Math.min(nutrition.length,21)} days (g)</div>
                <SVGChart data={protSeries} height={110} color="#c4ff00"/>
              </div>
            )}
            <button className="add-toggle" onClick={() => setShowAddNutri(v => !v)}>
              <span>Log today's macros</span><span className="plus">{showAddNutri ? '\u2212' : '+'}</span>
            </button>
            {showAddNutri && (
              <div className="body-form">
                <div className="bf-row">
                  <div className="bf-grp"><div className="bf-lbl">Protein (g)</div><input className="bf-in" type="number" inputMode="decimal" placeholder="0" value={nP} onChange={e => setNP(e.target.value)}/></div>
                  <div className="bf-grp"><div className="bf-lbl">Carbs (g)</div><input className="bf-in" type="number" inputMode="decimal" placeholder="0" value={nC} onChange={e => setNC(e.target.value)}/></div>
                  <div className="bf-grp"><div className="bf-lbl">Fat (g)</div><input className="bf-in" type="number" inputMode="decimal" placeholder="0" value={nF} onChange={e => setNF(e.target.value)}/></div>
                </div>
                {(nP || nC || nF) && <div className="cal-preview">= {Math.round((parseFloat(nP)||0)*4 + (parseFloat(nC)||0)*4 + (parseFloat(nF)||0)*9)} kcal</div>}
                <div className="bf-grp"><div className="bf-lbl">Date</div><input className="bf-in" type="date" value={nDate} onChange={e=>setNDate(e.target.value)}/></div>
                <button className="bf-save" onClick={addNutrition}>Save</button>
              </div>
            )}
            <button className="add-toggle" onClick={()=>setShowCalLog(v=>!v)} style={{marginTop:8}}>
              <span>Full log ({nutrition.length})</span><span className="plus">{showCalLog?'−':'+'}</span>
            </button>
            {showCalLog && <div className="body-list">
              {nutrition.slice(0, 21).map((n, i) => (
                <div key={i} className="bl-row">
                  <span className="bl-date">{fmtShort(n.date)}</span>
                  <span style={{flex:1,margin:'0 8px',fontFamily:"'JetBrains Mono',monospace",fontSize:10,color:'var(--t2)'}}>P{n.protein} C{n.carbs} F{n.fat}</span>
                  <span className="bl-val">{n.calories}<span style={{fontSize:9,color:'var(--t3)',marginLeft:2}}>kcal</span></span>
                  <button className="bl-edit" aria-label="Edit this entry" onClick={()=>openBodyEdit('nutrition',i,n)}>&#9998;</button>
                  <button className="bl-del" aria-label="Delete this entry" onClick={() => tombstone(setNutrition,'nu')(x=>x===n)}>&#215;</button>
                </div>
              ))}
              {nutrition.length === 0 && <div className="empty-msg">No macros logged yet.<br/>Log today's totals above.</div>}
            </div>}
            </>}
          </div>

          <div className="body-sec">
            <div className="sec-head" onClick={()=>toggleSec('cardio')}><div className="body-ttl">Cardio</div><span className={'sec-chev'+(secOpen('cardio')?' op':'')}>▾</span></div>
            {secOpen('cardio') && <>
            <div className="body-sub">Zone-2 work for recovery, work capacity and heart health &#8212; aim 2-3x a week</div>
            {(cardioLog.length > 0 || whoopCardio.sessions > 0) && (
              <div>
                <div className="meas-grid">
                  <div className="meas-cell" style={{cursor:'default'}}><div className="meas-site">This week</div><div className="meas-val">{cardioSessions}<span className="meas-unit">sessions</span></div></div>
                  <div className="meas-cell" style={{cursor:'default'}}><div className="meas-site">Weekly total</div><div className="meas-val">{cardioMins}<span className="meas-unit">min</span></div></div>
                </div>
                {whoopCardio.sessions > 0 && <div className="av-note" style={{marginTop:8}}>Includes {whoopCardio.sessions} WHOOP workout{whoopCardio.sessions===1?'':'s'} ({whoopCardio.mins} min in zone 2&ndash;3), auto-detected. Sessions overlapping a logged lift are excluded.</div>}
                {cardioTrend && (() => {
                  const W=340,H=120,PX=30,PY=12, rows=cardioTrend.rows;
                  const maxV=Math.max(cardioTrend.target, ...rows.map(r=>r.total), 30);
                  const bw=(W-2*PX)/rows.length;
                  const yf=v=> (H-PY) - (v/maxV)*(H-2*PY);
                  return (
                    <div style={{marginTop:12}}>
                      <div className="mp-hd" style={{marginBottom:6}}>
                        <span className="mp-ttl">8-week trend</span>
                        <span className="mp-cals" style={{color: cardioTrend.avg>=cardioTrend.target?'var(--ok)':'var(--warn)'}}>avg {cardioTrend.avg} min/wk</span>
                      </div>
                      <svg viewBox={`0 0 ${W} ${H}`} style={{width:'100%',display:'block'}}>
                        <line x1={PX} y1={yf(cardioTrend.target)} x2={W-PX} y2={yf(cardioTrend.target)} stroke="var(--ok)" strokeWidth="1" strokeDasharray="4 3" opacity="0.55"/>
                        <text x={W-PX} y={yf(cardioTrend.target)-3} textAnchor="end" fontSize="8" fill="#00e87a" opacity="0.8" fontFamily="JetBrains Mono">150 min guide</text>
                        {rows.map((r,i)=>{
                          const x=PX+i*bw+bw*0.18, w=bw*0.64;
                          const segs=[['manual','#4a9eff',r.manual],['z2','#c4ff00',r.z2],['z3','#ff8c00',r.z3]];
                          let acc=0;
                          return (<g key={i}>
                            {segs.map(([k,c,v],si)=>{ if(!v) return null; const y0=yf(acc), y1=yf(acc+v); acc+=v;
                              return <rect key={si} x={x} y={y1} width={w} height={Math.max(0,y0-y1)} fill={c} opacity={i===rows.length-1?1:0.75}/>; })}
                            <text x={x+w/2} y={H-2} textAnchor="middle" fontSize="7.5" fill="#728aa2" fontFamily="JetBrains Mono">{i===rows.length-1?'now':fmtShort(new Date(r.t).toISOString()).split(' ')[0]}</text>
                          </g>);
                        })}
                        <text x={PX-4} y={yf(maxV)+4} textAnchor="end" fontSize="8" fill="#728aa2" fontFamily="JetBrains Mono">{Math.round(maxV)}</text>
                      </svg>
                      <div style={{display:'flex',gap:12,marginTop:6,flexWrap:'wrap'}}>
                        {[['Logged','#4a9eff'],['Zone 2','#c4ff00'],['Zone 3','#ff8c00']].map(([l,c],i)=>(
                          <span key={i} style={{display:'flex',alignItems:'center',gap:4,fontSize:10,color:'var(--t2)'}}>
                            <span style={{width:8,height:8,borderRadius:2,background:c}}/>{l}
                          </span>))}
                      </div>
                      <div className="av-note" style={{marginTop:8,marginBottom:0}}>
                        Zone 2 and zone 3 are shown separately &#8212; the weekly headline counts both, which overstates true zone-2 time. Averages exclude the in-progress week. With your haematocrit and BP where they are, aerobic minutes are the counterweight to the lifting; this is a general activity reference, not a prescription.
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
            <button className="add-toggle" onClick={() => setShowAddCardio(v => !v)}>
              <span>Log cardio</span><span className="plus">{showAddCardio ? '\u2212' : '+'}</span>
            </button>
            {showAddCardio && (
              <div className="body-form">
                <div className="bf-row">
                  <div className="bf-grp"><div className="bf-lbl">Type</div><select className="bf-sel" value={cType} onChange={e => setCType(e.target.value)}>{['Zone 2','Incline Walk','Bike','Row','Stairs','Other'].map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                  <div className="bf-grp"><div className="bf-lbl">Minutes</div><input className="bf-in" type="number" inputMode="numeric" placeholder="35" value={cMin} onChange={e => setCMin(e.target.value)}/></div>
                </div>
                <input className="bf-in" type="text" placeholder="Note (optional)" value={cNote} onChange={e => setCNote(e.target.value)}/>
                <div className="bf-grp"><div className="bf-lbl">Date</div><input className="bf-in" type="date" value={cDate} onChange={e=>setCDate(e.target.value)}/></div>
                <button className="bf-save" onClick={addCardio}>Save</button>
              </div>
            )}
            <div className="body-list">
              {cardioLog.slice(0, 21).map((c, i) => (
                <div key={i} className="bl-row">
                  <span className="bl-date">{fmtShort(c.date)}</span>
                  <span style={{flex:1,margin:'0 8px',color:'var(--t)',fontWeight:600,fontSize:12}}>{c.modality}{c.note ? <span style={{color:'var(--t3)',fontWeight:400,fontSize:10}}> &#183; {c.note}</span> : null}</span>
                  <span className="bl-val">{c.minutes}<span style={{fontSize:9,color:'var(--t3)',marginLeft:2}}>min</span></span>
                  <button className="bl-edit" aria-label="Edit this entry" onClick={()=>openBodyEdit('cardio',i,c)}>&#9998;</button>
                  <button className="bl-del" aria-label="Delete this entry" onClick={() => tombstone(setCardioLog,'cd')(x=>x===c)}>&#215;</button>
                </div>
              ))}
              {cardioLog.length === 0 && <div className="empty-msg">No cardio logged yet.<br/>Log a session above.</div>}
            </div>
            </>}
          </div>

          <div className="body-sec">
            <div className="sec-head" onClick={()=>toggleSec('bp')}><div className="body-ttl">Blood Pressure</div><span className={'sec-chev'+(secOpen('bp')?' op':'')}>▾</span></div>
            {secOpen('bp') && <>
            <div className="body-sub">Track BP for cardiovascular health &#8212; your stack can raise it, so watch the trend. A fresh Stage 1+ reading holds intensifiers/grinders today; that is a training guardrail, not medical management &#8212; persistent high BP is a conversation for your doctor.</div>
            {latestBP && (() => { const c = bpCategory(latestBP.sys, latestBP.dia); return (
              <div className="bp-latest">
                <div className="bp-reading">{latestBP.sys}/{latestBP.dia}{latestBP.pulse ? <span className="bp-pulse"> &#183; {latestBP.pulse} bpm</span> : null}</div>
                <span className={`bp-chip ${c.cls}`}>{c.label}</span>
              </div>
            ); })()}
            {bpStats && <div className="hl-avg">7-reading avg {bpStats.avgSys}/{bpStats.avgDia} &#183; {bpStats.inRange}% in range</div>}
            {bpSeries.length > 1 && (
              <div style={{marginBottom:10}}>
                <div className="chart-lbl">Systolic &#8212; last {Math.min(bpLog.length,21)} readings</div>
                <SVGChart data={bpSeries} height={110} color="#ff6b6b" trend={true} anchor={40} events={chartEvents} band={{lo:90,hi:120}} bandColor="#00e87a" bandLabel="normal systolic"/>
              </div>
            )}
            <button className="add-toggle" onClick={() => setShowAddBP(v => !v)}>
              <span>Log a reading</span><span className="plus">{showAddBP ? '\u2212' : '+'}</span>
            </button>
            {showAddBP && (
              <div className="body-form">
                <div className="bf-row">
                  <div className="bf-grp"><div className="bf-lbl">Systolic</div><input className="bf-in" type="number" inputMode="numeric" placeholder="120" value={bpSys} onChange={e => setBpSys(e.target.value)}/></div>
                  <div className="bf-grp"><div className="bf-lbl">Diastolic</div><input className="bf-in" type="number" inputMode="numeric" placeholder="80" value={bpDia} onChange={e => setBpDia(e.target.value)}/></div>
                  <div className="bf-grp"><div className="bf-lbl">Pulse (opt)</div><input className="bf-in" type="number" inputMode="numeric" placeholder="60" value={bpPulse} onChange={e => setBpPulse(e.target.value)}/></div>
                </div>
                <div className="bf-grp"><div className="bf-lbl">Date</div><input className="bf-in" type="date" value={bpDate} onChange={e=>setBpDate(e.target.value)}/></div>
                <button className="bf-save" onClick={addBP}>Save</button>
              </div>
            )}
            <button className="add-toggle" onClick={()=>setShowBpLog(v=>!v)} style={{marginTop:8}}>
              <span>Full log ({bpLog.length})</span><span className="plus">{showBpLog?'−':'+'}</span>
            </button>
            {showBpLog && <div className="body-list">
              {bpLog.slice(0, 21).map((b, i) => { const c = bpCategory(b.sys, b.dia); return (
                <div key={i} className="bl-row">
                  <span className="bl-date">{fmtShort(b.date)}</span>
                  <span style={{flex:1,margin:'0 8px',color:'var(--t)',fontWeight:600,fontSize:12}}>{b.sys}/{b.dia}{b.pulse ? <span style={{color:'var(--t3)',fontWeight:400,fontSize:10}}> &#183; {b.pulse}bpm</span> : null}</span>
                  <span className={`bp-dot ${c.cls}`} title={c.label||""} style={{width:"auto",height:"auto",background:"none",fontSize:11,fontWeight:800,lineHeight:1,color:c.cls==="green"?"var(--ok)":c.cls==="amber"?"var(--warn)":"var(--err)"}}>{c.cls==="green"?"✓":c.cls==="amber"?"△":"▲"}</span>
                  <button className="bl-edit" aria-label="Edit this entry" onClick={()=>openBodyEdit('bp',i,b)}>&#9998;</button>
                  <button className="bl-del" aria-label="Delete this entry" onClick={() => tombstone(setBpLog,'bp')(x=>x===b)}>&#215;</button>
                </div>
              ); })}
              {bpLog.length === 0 && <div className="empty-msg">No readings yet.<br/>Log your blood pressure above.</div>}
            </div>}
            </>}
          </div>

          <div className="body-sec">
            <div className="sec-head" onClick={()=>toggleSec('ctx')}><div className="body-ttl">Context Flags</div><span className={'sec-chev'+(secOpen('ctx')?' op':'')}>▾</span></div>
            {secOpen('ctx') && <>
            <div className="body-sub">Alcohol, illness, bad nights and travel all suppress HRV and REM for 24&#8211;48h. Flag them and the readiness engine attributes the dip to the cause instead of reading it as training fatigue and pushing you toward an unnecessary deload.</div>
            {ctxReasons && <div className="info-banner warn" style={{margin:'0 0 10px'}}>Active: {ctxReasons.join(' · ')}</div>}
            <button className="add-toggle" onClick={() => setShowAddCtx(v => !v)}>
              <span>Log a flag</span><span className="plus">{showAddCtx ? '\u2212' : '+'}</span>
            </button>
            {showAddCtx && (
              <div className="body-form">
                <div className="bf-grp">
                  <div className="bf-lbl">Alcohol (units, 0 if none)</div>
                  <input className="bf-in" type="number" inputMode="decimal" placeholder="0" value={ctxUnits} onChange={e => setCtxUnits(e.target.value)}/>
                </div>
                <div className="bf-grp">
                  <div className="bf-lbl">Flags</div>
                  <div className="rec-row">
                    {CTX_TAGS.map(t => (
                      <button key={t.id} className={`rc${ctxTags.includes(t.id)?' bt':''}`} onClick={()=>setCtxTags(p=>p.includes(t.id)?p.filter(x=>x!==t.id):[...p,t.id])}>{t.label}</button>
                    ))}
                  </div>
                </div>
                <input className="bf-in" type="text" placeholder="Note (optional)" value={ctxNote} onChange={e => setCtxNote(e.target.value)}/>
                <div className="bf-grp"><div className="bf-lbl">Date</div><input className="bf-in" type="date" value={ctxDate} onChange={e=>setCtxDate(e.target.value)}/></div>
                <button className="bf-save" onClick={addContext}>Save</button>
              </div>
            )}
            <button className="add-toggle" onClick={()=>setShowCtxLog(v=>!v)} style={{marginTop:8}}>
              <span>Full log ({contextLog.length})</span><span className="plus">{showCtxLog?'−':'+'}</span>
            </button>
            {showCtxLog && <div className="body-list">
              {contextLog.slice(0,21).map((c,i)=>(
                <div key={i} className="bl-row">
                  <span className="bl-date">{fmtShort(c.date)}</span>
                  <span style={{flex:1,margin:'0 8px',color:'var(--t)',fontWeight:600,fontSize:12}}>
                    {c.units>0?`${c.units}u`:''}{c.units>0&&(c.tags||[]).length?' · ':''}
                    {(c.tags||[]).map(t=>(CTX_TAGS.find(x=>x.id===t)||{}).label).filter(Boolean).join(', ')}
                    {c.note?<span style={{color:'var(--t3)',fontWeight:400,fontSize:10}}> · {c.note}</span>:null}
                  </span>
                  <button className="bl-del" aria-label="Delete this entry" onClick={()=>tombstone(setContextLog,'cx')(x=>x===c)}>&#215;</button>
                </div>
              ))}
              {contextLog.length===0&&<div className="empty-msg">No flags logged.<br/>Log alcohol or an off day above.</div>}
            </div>}
            </>}
          </div>

          <div className="body-sec">
            <div className="sec-head" onClick={()=>toggleSec('glucose')}><div className="body-ttl">Fasting Glucose</div><span className={'sec-chev'+(secOpen('glucose')?' op':'')}>▾</span></div>
            {secOpen('glucose') && <>
            <div className="body-sub">HGH and tren both impair insulin sensitivity &#8212; log fasted (morning, pre-caffeine, pre-training) 2&#8211;3&#215;/week and watch the trend, not single readings. Tracking and flags here are not a diagnosis &#8212; persistent watch/high readings are a conversation for your doctor.</div>
            {latestGl && (() => { const c = glucoseCategory(latestGl.value); return (
              <div className="bp-latest">
                <div className="bp-reading">{latestGl.value}<span className="bp-pulse"> mmol/L</span></div>
                <span className={`bp-chip ${c.cls}`}>{c.label}</span>
              </div>
            ); })()}
            {glStats && <div className="hl-avg">7-reading avg {glStats.avg} mmol/L &#183; {glStats.inRange}% in range</div>}
            {glSeries.length > 1 && (
              <div style={{marginBottom:10}}>
                <div className="chart-lbl">Fasting glucose &#8212; last {Math.min(glucoseLog.length,21)} readings (mmol/L)</div>
                <SVGChart data={glSeries} height={110} color="#f0a020" trend={true} anchor={3} band={{lo:4.0,hi:5.5}} bandColor="#00e87a" bandLabel="fasting in-range"/>
              </div>
            )}
            <button className="add-toggle" onClick={() => setShowAddGl(v => !v)}>
              <span>Log a reading</span><span className="plus">{showAddGl ? '\u2212' : '+'}</span>
            </button>
            {showAddGl && (
              <div className="body-form">
                <div className="bf-row">
                  <div className="bf-grp"><div className="bf-lbl">Glucose (mmol/L)</div><input className="bf-in" type="number" inputMode="decimal" step="0.1" placeholder="5.2" value={glVal} onChange={e => setGlVal(e.target.value)}/></div>
                  <div className="bf-grp"><div className="bf-lbl">Date</div><input className="bf-in" type="date" value={glDate} onChange={e=>setGlDate(e.target.value)}/></div>
                </div>
                <button className="bf-save" onClick={addGlucose}>Save</button>
              </div>
            )}
            <button className="add-toggle" onClick={()=>setShowGlLog(v=>!v)} style={{marginTop:8}}>
              <span>Full log ({glucoseLog.length})</span><span className="plus">{showGlLog?'−':'+'}</span>
            </button>
            {showGlLog && <div className="body-list">
              {glucoseLog.slice(0, 21).map((g, i) => { const c = glucoseCategory(g.value); return (
                <div key={i} className="bl-row">
                  <span className="bl-date">{fmtShort(g.date)}</span>
                  <span style={{flex:1,margin:'0 8px',color:'var(--t)',fontWeight:600,fontSize:12}}>{g.value}<span style={{color:'var(--t3)',fontWeight:400,fontSize:10}}> mmol/L</span></span>
                  <span className={`bp-dot ${c.cls}`} title={c.label||""} style={{width:"auto",height:"auto",background:"none",fontSize:11,fontWeight:800,lineHeight:1,color:c.cls==="green"?"var(--ok)":c.cls==="amber"?"var(--warn)":"var(--err)"}}>{c.cls==="green"?"✓":c.cls==="amber"?"△":"▲"}</span>
                  <button className="bl-edit" aria-label="Edit this entry" onClick={()=>openBodyEdit('glucose',i,g)}>&#9998;</button>
                  <button className="bl-del" aria-label="Delete this entry" onClick={() => tombstone(setGlucoseLog,'gl')(x=>x===g)}>&#215;</button>
                </div>
              ); })}
              {glucoseLog.length === 0 && <div className="empty-msg">No readings yet.<br/>Log your fasting glucose above.</div>}
            </div>}
            </>}
          </div>

          <div className="body-sec">
            <div className="sec-head" onClick={()=>toggleSec('temp')}><div className="body-ttl">Waking Temp</div><span className={'sec-chev'+(secOpen('temp')?' op':'')}>▾</span></div>
            {secOpen('temp') && <>
            <div className="body-sub">Morning basal temp &#8212; only the 3-week trend is meaningful, not day-to-day</div>
            {tempChartSeries.length > 1 && (
              <div style={{marginBottom:10}}>
                <div className="chart-lbl">Waking temp &#8212; last {Math.min(tempLogList.length,21)} readings (&deg;)</div>
                <SVGChart data={tempChartSeries} height={110} color="#ff9f43" trend={true} anchor={1.5} events={chartEvents} band={tempBand} bandColor="#00e87a" bandLabel="your baseline"/>
              </div>
            )}
            <button className="add-toggle" onClick={() => setShowAddTemp(v => !v)}>
              <span>Log a reading</span><span className="plus">{showAddTemp ? '\u2212' : '+'}</span>
            </button>
            {showAddTemp && (
              <div className="body-form">
                <div className="bf-row">
                  <div className="bf-grp"><div className="bf-lbl">Waking temp (&deg;)</div><input className="bf-in" type="number" inputMode="decimal" step="0.1" placeholder="36.4" value={tVal} onChange={e => setTVal(e.target.value)}/></div>
                  <div className="bf-grp"><div className="bf-lbl">Date</div><input className="bf-in" type="date" value={tDate} onChange={e=>setTDate(e.target.value)}/></div>
                </div>
                <button className="bf-save" onClick={saveTempBody}>Save</button>
              </div>
            )}
            <button className="add-toggle" onClick={()=>setShowTempLog(v=>!v)} style={{marginTop:8}}>
              <span>Full log ({tempLogList.length})</span><span className="plus">{showTempLog?'−':'+'}</span>
            </button>
            {showTempLog && <div className="body-list">
              {tempLogList.slice(0, 21).map((v, i) => (
                <div key={i} className="bl-row">
                  <span className="bl-date">{fmtShort(v.date)}</span>
                  <span style={{flex:1,margin:'0 8px',color:'var(--t)',fontWeight:600,fontSize:12}}>{v.temp}<span style={{color:'var(--t3)',fontWeight:400,fontSize:10}}> &deg;</span></span>
                  <button className="bl-del" aria-label="Delete this entry" onClick={() => clearVitalField(v.date,'temp')}>&#215;</button>
                </div>
              ))}
              {tempLogList.length === 0 && <div className="empty-msg">No readings yet.<br/>Log your waking temp above.</div>}
            </div>}
            </>}
          </div>

          <div className="body-sec">
            <div className="sec-head" onClick={()=>toggleSec('wood')}><div className="body-ttl">Morning Wood</div><span className={'sec-chev'+(secOpen('wood')?' op':'')}>▾</span></div>
            {secOpen('wood') && <>
            <div className="body-sub">Daily functional marker &#8212; tap on Today, or log any date here</div>
            <div className="body-form" style={{marginBottom:8}}>
              <div className="bf-grp" style={{marginBottom:10}}><div className="bf-lbl">Date</div><input className="bf-in" type="date" value={wDate} onChange={e=>setWDate(e.target.value)}/></div>
              <div className="bf-grp"><div className="bf-lbl">Morning wood</div>
                <div className="td-wood" style={{marginTop:0}}>
                  {(()=>{ const ex=vitalsLog.find(v=>v&&v.date===wDate); const cur=ex?ex.wood:null; return (<>
                    <button className={cur===true?'on':''} onClick={()=>upsertVitalsDated(wDate,{wood:cur===true?null:true})}>Yes</button>
                    <button className={cur===false?'on':''} onClick={()=>upsertVitalsDated(wDate,{wood:cur===false?null:false})}>No</button>
                  </>); })()}
                </div>
              </div>
            </div>
            <button className="add-toggle" onClick={()=>setShowWoodLog(v=>!v)}>
              <span>History ({woodLogList.length})</span><span className="plus">{showWoodLog?'−':'+'}</span>
            </button>
            {showWoodLog && <div className="body-list">
              {woodLogList.slice(0, 30).map((v, i) => (
                <div key={i} className="bl-row">
                  <span className="bl-date">{fmtShort(v.date)}</span>
                  <span style={{flex:1,margin:'0 8px',fontWeight:700,fontSize:12,color:v.wood?'var(--ok)':'var(--t2)'}}>{v.wood?'Yes':'No'}</span>
                  <button className="bl-del" aria-label="Delete this entry" onClick={() => clearVitalField(v.date,'wood')}>&#215;</button>
                </div>
              ))}
              {woodLogList.length === 0 && <div className="empty-msg">No entries yet.<br/>Log Yes/No on the Today tab.</div>}
            </div>}
            </>}
          </div>

          <div className="body-sec">
            <div className="sec-head" onClick={()=>toggleSec('bloods')}><div className="body-ttl">Bloods</div><span className={'sec-chev'+(secOpen('bloods')?' op':'')}>▾</span></div>
            {secOpen('bloods') && <>
            <div className="body-sub">Reference panel &#8212; the slow backdrop your daily markers read against</div>
            {biomarkers.rows.length > 0 && (
              <div className="bm-mon">
                <div className="mp-hd" style={{marginBottom:8}}>
                  <span className="mp-ttl">Monitor &#183; {biomarkers.panels} draw{biomarkers.panels===1?'':'s'}</span>
                  {biomarkers.daysSince!=null && (
                    <span className="mp-cals" style={{color: biomarkers.dueIn<=0 ? 'var(--warn)' : 'var(--t2)'}}>
                      {biomarkers.daysSince}d since last{biomarkers.dueIn<=0 ? ' \u00b7 recheck due' : ' \u00b7 next in '+biomarkers.dueIn+'d'}
                    </span>
                  )}
                </div>
                {biomarkers.flagged.length > 0 && (
                  <div className="bm-flag-wrap">
                    <div className="bm-sub">Out of range now</div>
                    {biomarkers.flagged.map((r,i)=>(
                      <div key={i} className="bm-row">
                        <span className="bm-k">{r.k}</span>
                        <span className={'bm-v '+(r.cur.flag)}>
                          {r.cur.flag==='high'?'\u25b2':'\u25bc'} {r.cur.disp}{r.cur.unit?' '+r.cur.unit:''}
                        </span>
                        <span className="bm-trend">
                          {r.prev
                            ? <>{r.prev.disp} &#8594; {r.cur.disp} {r.delta==null?'':r.dir==='up'?'\u2191':r.dir==='down'?'\u2193':'\u2192'}</>
                            : 'first draw'}
                        </span>
                        <span className="bm-ref">{r.cur.ref}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="bm-sub" style={{marginTop:10}}>Tracked markers</div>
                {biomarkers.rows.filter(r=>!r.outOfRange && r.priority<999).slice(0,10).map((r,i)=>(
                  <div key={i} className="bm-row">
                    <span className="bm-k">{r.k}</span>
                    <span className="bm-v ok">{r.cur.disp}{r.cur.unit?' '+r.cur.unit:''}</span>
                    <span className="bm-trend">
                      {r.prev
                        ? <>{r.prev.disp} &#8594; {r.cur.disp} {r.delta==null?'':r.dir==='up'?'\u2191':r.dir==='down'?'\u2193':'\u2192'}</>
                        : 'first draw'}
                    </span>
                    <span className="bm-ref">{r.cur.ref}</span>
                  </div>
                ))}
                {biomarkers.missing.length > 0 && (
                  <div className="bm-gap">Not in any panel yet: <b>{biomarkers.missing.join(', ')}</b> &#8212; worth asking for at your next draw given your protocol.</div>
                )}
                <div className="bm-note">Monitoring only, not a diagnosis. Trends are for review with whoever manages your protocol &#8212; single values move for lots of reasons, direction across draws is what matters.</div>
              </div>
            )}
            {!bldForm && <button className="add-toggle" onClick={startBloodPanel}><span>Add a blood panel</span><span className="plus">+</span></button>}
            {bldForm && (() => {
              try {
                const f = bldForm;
                const inStyle = { fontSize: 16, padding: '8px 9px' };   // 16px stops iOS zooming on focus
                const filledN = f.rows.filter(r => String(r.k).trim() && String(r.v).trim()).length;
                const flagLbl = (r) => { const a = bloodAutoFlag(r.v, r.ref); return 'Auto' + (a === 'high' ? ' \u25b2' : a === 'low' ? ' \u25bc' : ''); };
                return (
                  <div className="body-form" style={{ background: 'var(--sur)', border: '1px solid var(--bdr)', borderRadius: 10, padding: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--t)' }}>{f.editId ? 'Edit panel' : 'New blood panel'}</div>
                    <div className="bf-row">
                      <div className="bf-grp"><div className="bf-lbl">Draw date</div>
                        <input className="bf-in" style={inStyle} type="date" value={f.date || ''} max={localToday()} onChange={e => setBldForm(x => ({ ...x, date: e.target.value, err: '' }))} /></div>
                      <div className="bf-grp"><div className="bf-lbl">Provider</div>
                        <input className="bf-in" style={inStyle} type="text" placeholder="Manual, Randox..." value={f.provider || ''} onChange={e => setBldForm(x => ({ ...x, provider: e.target.value }))} /></div>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--t3)', lineHeight: 1.5 }}>
                      {f.editId ? 'Change any value, then save.' : 'Marker names, units and ranges are copied from your latest panel. Fill in the values you have; rows left blank are skipped.'} Flags work themselves out from the range unless you set one.
                    </div>
                    <datalist id="bld-markers">{Object.values(bloodMarkerIndex).map(m => <option key={m.k} value={m.k} />)}</datalist>
                    {f.rows.map((r, i) => (
                      <div key={i} style={{ borderTop: '1px solid var(--bdr)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <input className="bf-in" style={{ ...inStyle, flex: 1, minWidth: 0 }} list="bld-markers" placeholder="Marker" value={r.k} onChange={e => updBldRow(i, { k: e.target.value })} />
                          <input className="bf-in" style={{ ...inStyle, width: 84, flexShrink: 0 }} inputMode="decimal" placeholder="Value" value={r.v} onChange={e => updBldRow(i, { v: e.target.value })} />
                          <button className="bl-del" aria-label={'Remove ' + (r.k || 'this marker')} onClick={() => delBldRow(i)}>&#215;</button>
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <input className="bf-in" style={{ ...inStyle, width: 72, flexShrink: 0, fontSize: 16 }} placeholder="Unit" value={r.unit} onChange={e => updBldRow(i, { unit: e.target.value })} />
                          <input className="bf-in" style={{ ...inStyle, flex: 1, minWidth: 0 }} placeholder="Range e.g. 38-50" value={r.ref} onChange={e => updBldRow(i, { ref: e.target.value })} />
                          <select className="bf-sel" style={{ width: 92, flexShrink: 0, fontSize: 16 }} aria-label="Flag" value={r.flag || 'auto'} onChange={e => updBldRow(i, { flag: e.target.value })}>
                            <option value="auto">{flagLbl(r)}</option><option value="ok">OK</option><option value="high">High</option><option value="low">Low</option><option value="watch">Watch</option>
                          </select>
                        </div>
                        <select className="bf-sel" style={{ fontSize: 16 }} aria-label="Group" value={r.g || 'Other'} onChange={e => updBldRow(i, { g: e.target.value })}>
                          {BLOOD_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
                        </select>
                      </div>
                    ))}
                    <button className="add-toggle" onClick={addBldRow}><span>Add a marker</span><span className="plus">+</span></button>
                    <input className="bf-in" style={inStyle} type="text" placeholder="Note (optional)" value={f.note || ''} onChange={e => setBldForm(x => ({ ...x, note: e.target.value }))} />
                    {f.err && <div style={{ fontSize: 12, color: 'var(--err)', fontWeight: 700 }}>{f.err}</div>}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <button className="bf-save" onClick={saveBloodPanel}>{f.editId ? 'Save changes' : 'Save panel'} ({filledN})</button>
                      <button className="bf-save" style={{ background: 'none', color: 'var(--t2)', border: '1px solid var(--bdr)' }} onClick={cancelBloodPanel}>Cancel</button>
                    </div>
                  </div>
                );
              } catch (e) {
                try { console.error('blood form failed', e); } catch (_) {}
                return <div className="empty-msg">The panel form could not load. <button className="bf-save" onClick={() => setBldForm(null)}>Reset form</button></div>;
              }
            })()}
            {bloodCompare.rows.length > 0 && (
              <div className="bm-mon" style={{marginTop:12}}>
                <div className="mp-hd" style={{marginBottom:8}}><span className="mp-ttl">Compare across panels</span><span className="mp-cals">{bloodCompare.rows.length} shared markers</span></div>
                <div style={{overflowX:'auto',WebkitOverflowScrolling:'touch'}}>
                  <table style={{borderCollapse:'collapse',fontSize:11,minWidth:'100%'}}>
                    <thead>
                      <tr>
                        <th style={{textAlign:'left',padding:'4px 8px 6px 0',color:'var(--t3)',fontWeight:700,position:'sticky',left:0,background:'var(--crd)'}}>Marker</th>
                        {bloodCompare.dates.map(d=><th key={d} style={{padding:'4px 8px 6px',color:'var(--t2)',fontFamily:"'JetBrains Mono',monospace",fontWeight:700,whiteSpace:'nowrap',textAlign:'center'}}>{fmtShort(d)}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {bloodCompare.rows.map((r,i)=>(
                        <tr key={i} style={{borderTop:'1px solid var(--bdr)'}}>
                          <td style={{textAlign:'left',padding:'6px 8px 6px 0',color:'var(--t)',position:'sticky',left:0,background:'var(--crd)',whiteSpace:'nowrap'}}>{r.label}{r.unitMismatch && <span title="Units differ between panels" aria-label="Units differ between panels" style={{color:'#e0b020',marginLeft:4}}>&#9888;</span>}</td>
                          {bloodCompare.dates.map(d=>{
                            const c = r.cells[d];
                            const col = !c ? 'var(--t3)' : (c.flag==='high'||c.flag==='low') ? '#ff6b6b' : c.flag==='watch' ? '#e0b020' : 'var(--t)';
                            return <td key={d} style={{padding:'6px 8px',textAlign:'center',fontFamily:"'JetBrains Mono',monospace",color:col,whiteSpace:'nowrap'}}>{c ? `${c.flag==='high'?'\u25b2 ':c.flag==='low'?'\u25bc ':''}${c.disp}` : '\u2014'}</td>;
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="bm-note">Same marker across panels, newest date first. Blank (&#8212;) = not measured that draw. Units can differ between providers &#8212; check the per-panel detail below before comparing absolute values.{bloodCompare.anyMismatch && <span style={{color:'#e0b020'}}> &#9888; marks a marker reported in different units on different panels, so its numbers are not directly comparable.</span>}</div>
              </div>
            )}
            {bloodsLog.length ? (
              <div>
                {/* All panels, newest first. A newer draw supersedes only the markers it
                    actually contains, so older panels stay visible for everything they
                    still own (hormones, lipids, iron and so on). */}
                {bloodsLog.map((panel, pi) => (
                  <div key={panel.id||pi} style={pi>0?{marginTop:16,paddingTop:14,borderTop:'1px solid var(--bdr)',opacity:0.82}:null}>
                    <div className="bld-head" style={{display:'flex',alignItems:'center',gap:4}}><span className="bld-date" style={{flex:1}}>{panel.label||fmtShort(panel.date)}</span>
                      <button className="bl-edit" aria-label={'Edit the '+(panel.label||panel.date)+' panel'} onClick={()=>{ if (bldForm && !window.confirm('Replace the panel you are currently entering?')) return; editBloodPanel(panel); }}>&#9998;</button>
                      <button className="bl-del" aria-label={'Delete the '+(panel.label||panel.date)+' panel'} onClick={()=>deleteBloodPanel(panel)}>&#215;</button></div>
                    {(panel.groups||[]).map((grp,gi)=>(
                      <div key={gi} className="bld-group">
                        <div className="bld-gname">{grp.g}</div>
                        {(grp.m||[]).map((mk,mi)=>(
                          <div key={mi} className="bld-row">
                            <span className="bld-k">{mk.k}</span>
                            <span className={'bld-v '+(mk.flag||'ok')}>{mk.flag==='high'?'\u25b2 ':mk.flag==='low'?'\u25bc ':mk.flag==='watch'?'\u25c6 ':''}{mk.disp}{mk.unit?' '+mk.unit:''}</span>
                            <span className="bld-ref">{mk.ref||''}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                    {panel.gaps && panel.gaps.length>0 && <div className="bld-gaps">{panel.gaps.join(' \u00b7 ')}</div>}
                    {panel.note && <div className="bld-note">{panel.note}</div>}
                  </div>
                ))}
              </div>
            ) : <div className="empty-msg">No bloods stored.</div>}
            </>}
          </div>

          <div className="body-sec">
            <div className="sec-head" onClick={()=>toggleSec('protocol')}><div className="body-ttl">Protocol Log</div><span className={'sec-chev'+(secOpen('protocol')?' op':'')}>▾</span></div>
            {secOpen('protocol') && <>
            <div className="body-sub">Track your protocol doses alongside training</div>
            <button className="add-toggle" onClick={()=>setShowAddProt(v=>!v)}>
              <span>Log a dose</span><span className="plus">{showAddProt?'−':'+'}</span>
            </button>
            {showAddProt&&(
              <div className="body-form">
                <div className="bf-row">
                  <div className="bf-grp">
                    <div className="bf-lbl">Compound</div>
                    <select className="bf-sel" value={pCmp} onChange={e=>setPCmp(e.target.value)}>
                      {['TRT', ...PK_ESTERS.map(p=>p.label), 'HCG', 'Other'].map(c=><option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="bf-grp">
                    <div className="bf-lbl">Dose</div>
                    <input className="bf-in" type="number" inputMode="decimal" placeholder="Amount" value={pDose} onChange={e=>setPDose(e.target.value)}/>
                  </div>
                  <div className="bf-grp" style={{maxWidth:64}}>
                    <div className="bf-lbl">Unit</div>
                    <select className="bf-sel" value={pUnit} onChange={e=>setPUnit(e.target.value)}>
                      {['mg','iu','mcg','ml'].map(u=><option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                </div>
                <input className="bf-in" type="text" placeholder="Notes (optional)" value={pNote} onChange={e=>setPNote(e.target.value)} style={{marginTop:0}}/>
                <div className="bf-grp"><div className="bf-lbl">Date</div><input className="bf-in" type="date" value={pDate} onChange={e=>setPDate(e.target.value)}/></div>
                <button className="bf-save" onClick={addProtocol}>Save</button>
              </div>
            )}
            <div className="body-list">
              {protocolLog.slice(0,40).map((p,i)=>(
                <div key={i} className="p-row">
                  <span className="p-date">{fmtShort(p.date)}</span>
                  <div className="p-body">
                    <div className="p-cmp">{p.compound}</div>
                    <div className="p-dose">{p.dose}{p.unit}</div>
                    {p.notes&&<div className="p-note">{p.notes}</div>}
                  </div>
                  <button className="p-edit" onClick={()=>openBodyEdit('protocol',i,p)}>&#9998;</button>
                  <button className="p-del" onClick={()=>tombstone(setProtocolLog,'pr')(x=>x===p)}>&#215;</button>
                </div>
              ))}
              {protocolLog.length===0&&<div className="empty-msg">No entries yet — log your first dose above.</div>}
            </div>
            {decayModel && (() => {
              const W=340,H=150,PX=34,PY=14, dm=decayModel;
              const xf=d=> PX + (dm.days?d/dm.days:0)*(W-2*PX);
              const yf=a=> (H-PY) - (a/dm.maxAmt)*(H-2*PY);
              return (
                <div style={{marginTop:12}}>
                  <div className="mp-hd" style={{marginBottom:6}}>
                    <span className="mp-ttl">Injection exposure &#183; modelled</span>
                    <span className="mp-cals">{dm.days} d</span>
                  </div>
                  <svg viewBox={`0 0 ${W} ${H}`} style={{width:'100%',display:'block'}}>
                    {[0,0.5,1].map((f,i)=>{const y=(H-PY)-f*(H-2*PY);return(<g key={i}><line x1={PX} y1={y} x2={W-PX} y2={y} stroke="#1d2733" strokeWidth="1" strokeDasharray="3 3"/><text x={PX-4} y={y+3} textAnchor="end" fontSize="8" fill="#728aa2" fontFamily="JetBrains Mono">{Math.round(f*dm.maxAmt)}</text></g>);})}
                    {dm.series.map((s,si)=>{const line=s.pts.map((p,i)=>`${i===0?'M':'L'}${xf(p.d).toFixed(1)} ${yf(p.amt).toFixed(1)}`).join(' ');return <path key={si} d={line} fill="none" stroke={s.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>;})}
                    {dm.series.flatMap((s,si)=> s.evs.map((e,ei)=>{const d=(e.t-dm.t0)/86400000;return <circle key={si+'-'+ei} cx={xf(d)} cy={H-PY} r="1.6" fill={s.color} fillOpacity="0.6"/>;}))}
                    {/* Blood draws on the same axis: puts marker drift in protocol context. */}
                    {(bloodsLog||[]).map((p,pi)=>{
                      if(!p||!p.date) return null;
                      const t=new Date(p.date+'T12:00:00Z').getTime();
                      if(t<dm.t0||t>dm.tEnd) return null;
                      const d=(t-dm.t0)/86400000;
                      return (<g key={'bd'+pi}>
                        <line x1={xf(d)} y1={PY} x2={xf(d)} y2={H-PY} stroke="#a479e2" strokeWidth="1" strokeDasharray="3 3" opacity="0.55"/>
                        <text x={xf(d)} y={PY-4} textAnchor="middle" fontSize="7" fill="#a479e2" opacity="0.9" fontFamily="JetBrains Mono">bloods</text>
                      </g>);
                    })}
                    <text x={PX} y={H-2} textAnchor="start" fontSize="8" fill="#728aa2" fontFamily="JetBrains Mono">{fmtShort(new Date(dm.t0).toISOString())}</text>
                    <text x={W-PX} y={H-2} textAnchor="end" fontSize="8" fill="#728aa2" fontFamily="JetBrains Mono">today</text>
                    <text x={PX-4} y={PY-5} fontSize="7.5" fill="#728aa2" fontFamily="JetBrains Mono">mg-eq</text>
                  </svg>
                  <div style={{marginTop:8,display:'flex',flexDirection:'column',gap:5}}>
                    {dm.series.map((s,si)=>(
                      <div key={si} style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
                        <span style={{width:8,height:8,borderRadius:2,background:s.color,flexShrink:0}}/>
                        <span style={{fontSize:11,color:'var(--t)',fontWeight:600}}>{s.name}</span>
                        <span style={{fontSize:10,color:'var(--t2)',fontFamily:"'JetBrains Mono',monospace"}}>t&#189; ~{s.hl}d ({s.conf}) &#183; {s.n} logged &#183; now ~{Math.round(s.cur)} (peak ~{Math.round(s.peak)}) mg-eq</span>
                      </div>
                    ))}
                  </div>
                  <div className="av-note" style={{marginTop:8,marginBottom:0}}>
                    Modelled decline of the injections <b>you have logged</b>, using each ester&#8217;s published half-life. This is <b>relative modelled exposure, not your serum level</b>, and not advice. It sums repeated doses to show accumulation and decay, but ignores the slow oil-depot release phase, so the days just after an injection are approximate. Real levels depend on absorption and your own physiology.
                  </div>
                  <div className="av-note" style={{marginTop:6,marginBottom:0,color:'var(--t3)'}}>
                    Half-life sources: {dm.series.map(s=>`${s.name} ${s.src}`).join(' \u00b7 ')}. Log doses in mg with a date; iu/ml entries (e.g. HCG) are not modelled.
                  </div>
                </div>
              );
            })()}
            {!decayModel && protocolLog.length>0 && (
              <div className="av-note" style={{marginTop:10}}>Log an injection in <b>mg</b> with a recognised compound (Test enanthate, Test cypionate, Primobolan&#8230;) to see its modelled decline here.</div>
            )}
            </>}
          </div>
        </div>
      )}

      {restFlash && <div className="rest-flash"><div className="rest-flash-txt">REST OVER</div></div>}
      {view !== 'workout' && view !== 'complete' && (
        <div className="bnav">
          {[['today','&#128197;','Today'],['meals','&#127869;','Meals'],['home','&#127947;','Program'],['progress','&#128200;','Progress'],['history','&#128203;','History'],['body','&#9878;','Body'],['privacy','&#128274;','Privacy'],['tools','&#128295;','Tools']].map(([v,icon,label]) => (
            <div key={v} className={`bn${view===v?' on':''}`} onClick={() => setView(v)}>
              <span className="bn-ic" dangerouslySetInnerHTML={{__html:icon}}/>
              <span className="bn-lb">{label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export { App, RootBoundary };
