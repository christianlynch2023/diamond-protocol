// Sync: split out of useAppState. The statements below are moved unchanged, apart from names declared
// later in useAppState, which are read through `ctx` when a handler runs (live links). useAppState returns the
// same names to screens as before.
import { useMemo, useRef, useState } from 'react';
import { LS } from '../lib/storage';
import { adoptEquipment, equipmentForSync } from '../lib/equipment';
import { fmtShort } from '../lib/format';
import { bpCategory } from '../lib/health';
import { DLW } from '../data/programme';
import { ensureIds, mergeByKey, mergeLogs, pruneTombstones } from '../lib/sync';
import { mergeHistory } from '../lib/whoop';

export function useSync(ctx: any) {
  const { activeTarget, block, bloodsLog, bloodsLogRaw, bodyMetrics, bodyMetricsRaw, bpLog, bpLogRaw, cardioLog, cardioLogRaw, cfgUpdatedAt, checkins, contextLog, contextLogRaw, deloadSkips, glucoseLog, glucoseLogRaw, goalPhase, highVol, imgOf, logs, measurements, measurementsRaw, nutrition, nutritionRaw, protocolLog, protocolLogRaw, recovery, setActiveTarget, setBlock, setBloodsLog, setBodyMetrics, setBpLog, setCardioLog, setCfgUpdatedAt, setCheckins, setClearConfirm, setContextLog, setDeloadSkips, setGlucoseLog, setGoalPhase, setHighVol, setLogs, setMeasurements, setNutrition, setProtocolLog, setRecovery, setVitalsLog, setWeek, setWhoopData, setWhoopHistory, setWhoopWorkouts, setWipData, touchCfg, view, vitalsLog, vitalsLogRaw, week, whoopHistory, whoopWorkouts } = ctx;
  // Persistence-failure surface. usePersistentState and saveWip both dispatch 'dp-storage-fail'
  // on a failed write (quota / private mode); without a listener the failure was invisible and
  // the UI implied data was saved when it was not.
  const [storageFail, setStorageFail] = useState(null);
  const [syncCode, setSyncCode]       = useState(() => LS.get('sync_code') || '');
  const [syncCodeInput, setSyncCodeInput] = useState('');
  const [cloudStatus, setCloudStatus] = useState('idle');
  const [cloudErr, setCloudErr] = useState('');
  const syncTimer = useRef(null);
  const skipPush  = useRef(false);
  const syncMounted = useRef(false);
  const exportData = () => {
    const data={version:'2.4',exported:new Date().toISOString(),logs,config:{week,recovery,block,highVol,phase:goalPhase, equipment: equipmentForSync()},activeTarget,bodyMetrics,measurements,checkins:checkins.map(c=>({...c,img:imgOf(c)})),nutrition,cardioLog,bpLog,glucoseLog,protocolLog,contextLog,vitalsLog,bloodsLog,whoopHistory,whoopWorkouts,deloadSkips};
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
    if (bodyMetrics[0]) p('Latest weight: ' + bodyMetrics[0].weight + 'kg (' + fmtShort(bodyMetrics[0].date) + ')' + (ctx.bodyDash.avg7 != null ? ' · 7d avg ' + ctx.bodyDash.avg7.toFixed(1) + 'kg' : ''));
    if (ctx.bwRate) p('Weight trend (21d regression): ' + (ctx.bwRate.perWeek > 0 ? '+' : '') + ctx.bwRate.perWeek.toFixed(2) + ' kg/wk (' + (ctx.bwRate.pctWeek > 0 ? '+' : '') + ctx.bwRate.pctWeek.toFixed(2) + '%/wk)');
    if (ctx.latestBP) p('Latest BP: ' + ctx.latestBP.sys + '/' + ctx.latestBP.dia + ' (' + bpCategory(ctx.latestBP.sys, ctx.latestBP.dia).label + ')');
    p('');
    p('== NUTRITION ==');
    if (ctx.nutriCoach.ok) {
      p('Est. maintenance: ~' + ctx.nutriCoach.tdee + ' kcal/day (' + ctx.nutriCoach.conf + ' confidence, from intake vs weight over ' + ctx.nutriCoach.spanDays + 'd)');
      p('Logging: ~' + ctx.nutriCoach.avgIntake + ' kcal/day · trend ' + (ctx.nutriCoach.ratePerWk > 0 ? '+' : '') + ctx.nutriCoach.ratePerWk.toFixed(2) + ' kg/wk');
      // Round 1: tell the coach the same target the app uses: a lock, then the Meals plan, then the engine.
      const planT = ctx.effTargets && ctx.effTargets.source === 'plan' ? ctx.effTargets : null;
      if (activeTarget && Number.isFinite(activeTarget.cals)) p('Target (' + goalPhase + '): ' + activeTarget.cals + ' kcal (locked) · P' + ctx.nutriCoach.proteinG + ' C' + ctx.nutriCoach.carbG + ' F' + ctx.nutriCoach.fatG);
      else if (planT) p('Target (Meals plan): training days ' + planT.dayTargets.train.cals + ' kcal (P' + planT.dayTargets.train.protein + ' C' + planT.dayTargets.train.carb + ' F' + planT.dayTargets.train.fat + '), rest days ' + planT.dayTargets.rest.cals + ' kcal (P' + planT.dayTargets.rest.protein + ' C' + planT.dayTargets.rest.carb + ' F' + planT.dayTargets.rest.fat + '); weekly avg ' + planT.weekly + ' kcal');
      else p('Target (' + goalPhase + '): ' + ctx.nutriCoach.targetCals + ' kcal · P' + ctx.nutriCoach.proteinG + ' C' + ctx.nutriCoach.carbG + ' F' + ctx.nutriCoach.fatG);
    } else p('Smart targets: not ready (' + (ctx.nutriCoach.reason || 'insufficient data') + ')');
    if (ctx.burnCheck) p('WHOOP burn cross-check: ' + ctx.burnCheck.avg + ' vs empirical ' + ctx.burnCheck.tdee + ' (' + (ctx.burnCheck.agree ? 'agree' : 'gap ' + ctx.burnCheck.gap) + ', ' + ctx.burnCheck.days + 'd)');
    p('');
    p('== TRAINING ANALYTICS ==');
    if (ctx.strengthRet) { p('Strength retention (21d vs prior): ' + (ctx.strengthRet.avgPct > 0 ? '+' : '') + ctx.strengthRet.avgPct + '% avg e1RM'); ctx.strengthRet.lifts.forEach(l => p('  ' + l.name + ': ' + (l.pct > 0 ? '+' : '') + l.pct + '% (' + l.prior + '→' + l.recent + 'kg)')); }
    if (ctx.deloadRebound) p('Deload rebound: ' + (ctx.deloadRebound.avg > 0 ? '+' : '') + ctx.deloadRebound.avg + '% avg (week after vs before)');
    if (ctx.rirDrift) p('RIR drift (recent): ' + (ctx.rirDrift.avg > 0 ? '+' : '') + ctx.rirDrift.avg + ' vs prescribed');
    if (ctx.plateaus.length) p('Stalled lifts: ' + ctx.plateaus.map(x => x.name + ' (' + x.sessions + ' sessions)').join(', '));
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
  // Applies a parsed backup: a file the user picks, or a cloud restore point. Validates every record;
// arrays missing from the backup are left untouched; bloods merge rather than replace.
const applyBackup = (data: any) => {
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
          const clean = (name, arr, ok?) => {
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
          if (data.config) { if (data.config.equipment != null) adoptEquipment(data.config.equipment); if(data.config.week!=null)setWeek(data.config.week); if(data.config.recovery!=null)setRecovery(data.config.recovery); if(data.config.block!=null)setBlock(data.config.block); if(data.config.highVol!=null)setHighVol(data.config.highVol); if(data.config.phase!=null)setGoalPhase(data.config.phase); touchCfg(); }  // explicit user restore = a config edit
          if (data.activeTarget && Number.isFinite(data.activeTarget.cals)) setActiveTarget(data.activeTarget);   // restore the locked calorie target
          const rej = Object.entries(rejected).map(([k,v])=>`${v} ${k}`).join(', ');
          const onlyBloods = bloodsMerged != null && Object.keys(data).filter(k => KNOWN.includes(k)).every(k => k === 'bloodsLog');
          const bldMsg = bloodsMerged != null ? `${bloodsMerged} blood panel${bloodsMerged===1?'':'s'} imported. Existing panels were kept.` : '';
          alert((onlyBloods ? bldMsg : `Restored ${importedLogs} sessions plus body, nutrition, BP, cardio and protocol history.` + (bldMsg ? '\n\n' + bldMsg : '')) + (rej ? `\n\nSkipped invalid or duplicate records: ${rej}.` : ''));
};
const importData = () => {
    const input=document.createElement('input'); input.type='file'; input.accept='.json';
    input.onchange = e => {
      const file=(e.target as HTMLInputElement).files[0]; if(!file)return;
      const reader=new FileReader();
      reader.onload = ev => {
        try {
          const data=JSON.parse(ev.target.result as string);
          applyBackup(data);
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
  const pullFromCloud = async (code?) => {
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
          if (data.config.equipment != null) adoptEquipment(data.config.equipment);
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
        const snapshot = JSON.stringify({ logs: mergedLogs, config: cloudCfgNewer ? { week: data.config.week, recovery: data.config.recovery, block: data.config.block, highVol: data.config.highVol, phase: data.config.phase, updatedAt: cloudCfgAt, equipment: equipmentForSync() } : { week, recovery, block, highVol, phase: goalPhase, updatedAt: (cfgUpdatedAt||Date.now()), equipment: equipmentForSync() }, activeTarget: mergedTarget, bodyMetrics: pruneTombstones(mergedBody), protocolLog: pruneTombstones(mergedProt), measurements: pruneTombstones(mergedMeas), nutrition: pruneTombstones(mergedNutri), cardioLog: pruneTombstones(mergedCardio), bpLog: pruneTombstones(mergedBP), glucoseLog: pruneTombstones(mergedGl), contextLog: pruneTombstones(mergedCtx), vitalsLog: pruneTombstones(mergedVit), bloodsLog: pruneTombstones(mergedBld), whoopHistory: mergedWhoop, deloadSkips: mergedSkips, updatedAt: Date.now() });
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
  const syncNow = async (codeArg?) => {
    const c = codeArg || syncCode || LS.get('sync_code');
    if (!c) return;
    setCloudStatus('syncing');
    try {
      const snapshot = JSON.stringify({ logs, config: { week, recovery, block, highVol, phase: goalPhase, updatedAt: (cfgUpdatedAt || 0), equipment: equipmentForSync() }, activeTarget, bodyMetrics: pruneTombstones(bodyMetricsRaw), protocolLog: pruneTombstones(protocolLogRaw), measurements: pruneTombstones(measurementsRaw), nutrition: pruneTombstones(nutritionRaw), cardioLog: pruneTombstones(cardioLogRaw), bpLog: pruneTombstones(bpLogRaw), glucoseLog: pruneTombstones(glucoseLogRaw), contextLog: pruneTombstones(contextLogRaw), vitalsLog: pruneTombstones(vitalsLogRaw), bloodsLog: pruneTombstones(bloodsLogRaw), whoopHistory, deloadSkips, updatedAt: Date.now() });
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
        'App settings': ['meal_slot','body_sec_closed','prog_grp_closed','prog_grp_closed_v2','meal_day','meal_time'],
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

  return { storageFail, setStorageFail, syncCode, setSyncCode, syncCodeInput, setSyncCodeInput, cloudStatus, setCloudStatus, cloudErr, setCloudErr, syncTimer, skipPush, syncMounted, exportData, exportSummary, applyBackup, importData, clearAllData, pullFromCloud, syncNow, connectSync, disconnectSync, genSyncCode, storageBreakdown };
}
