// Nutrition: split out of useAppState. The statements below are moved unchanged, apart from names declared
// later in useAppState, which are read through `ctx` when a handler runs (live links). useAppState returns the
// same names to screens as before.
import { usePersistentState } from '../hooks';
import type { ActiveTarget, NutritionEntry } from '../types';
import { useMemo, useState } from 'react';
import { live, newId } from '../lib/sync';
import { fmtShort, localToday } from '../lib/format';
import { SESSIONS } from '../data/programme';
import { MEAL_PLAN } from '../data/mealPlan';

export function useNutrition(ctx: any) {
  const { bodyMetrics, goalPhase, logs } = ctx;
  const [mealDay, setMealDay]   = usePersistentState('meal_day', 'train');
   // 'train' | 'rest' (remembered)
  const [mealTime, setMealTime] = usePersistentState('meal_time', 'am');
  // Locked weekly calorie target. Declared here (early) rather than beside targetLock/effTargets
  // because the cloud-sync effect and Clear/export/import all reference it, and the sync effect's
  // dependency array — which is evaluated during render — sits above those definitions.
  const [activeTarget, setActiveTarget] = usePersistentState<ActiveTarget | null>('active_target', null);
  const [showCalLog, setShowCalLog] = useState(false);
  const [nutriDayType, setNutriDayType] = useState(() => { const d=new Date().getDay(); return [2,4,6,0].includes(d)?'train':'rest'; });
 // Tue/Thu/Sat/Sun train
  const [nutritionRaw, setNutrition] = usePersistentState<NutritionEntry[]>('nutrition_log', []);
  const nutrition = useMemo(()=>live(nutritionRaw),[nutritionRaw]);
  const [nP, setNP] = useState('');
  const [nC, setNC] = useState('');
  const [nF, setNF] = useState('');
  const [showAddNutri, setShowAddNutri] = useState(false);
  const [nDate, setNDate] = useState(localToday());
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
      ? Math.max(0, Math.round(((new Date(_todayStr+'T12:00:00') as any) - (new Date(_lwDateStr+'T12:00:00') as any)) / dayMs))
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
    const locked = activeTarget && Number.isFinite(activeTarget.cals) ? activeTarget : null;
    // Round 1: the Meals plan is the target the whole app uses (Today, Week in review, meal timing),
    // so the numbers never disagree. A target you've deliberately locked still wins; the live engine
    // is only used when there is no plan.
    if (!locked && MEAL_PLAN && MEAL_PLAN.targets) {
      const tr = MEAL_PLAN.targets.train, rs = MEAL_PLAN.targets.rest;
      const trainDays = Object.keys(SESSIONS).length || 4, restDays = 7 - trainDays;
      const avg = (a: number, b: number) => Math.round((a * trainDays + b * restDays) / 7);
      return {
        source: 'plan', weekly: avg(tr.kcal, rs.kcal), protein: avg(tr.p, rs.p), fat: avg(tr.f, rs.f), carb: avg(tr.c, rs.c),
        cycle: { trainDays, restDays, lowCarb: rs.c, highCarb: tr.c },
        dayTargets: { train: { cals: tr.kcal, carb: tr.c, protein: tr.p, fat: tr.f }, rest: { cals: rs.kcal, carb: rs.c, protein: rs.p, fat: rs.f } },
      };
    }
    if (!nutriCoach) return null;
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
      const layout: [string, number, number, number][] = !isTrain
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
  const protSeries=useMemo(()=>nutrition.slice(0,21).reverse().map(n=>({x:fmtShort(n.date),y:n.protein,t:new Date(n.date).getTime()})),[nutrition]);
  const calStats = useMemo(() => {
    const _now=Date.now(); const _by: Record<string, any>={};
    (nutrition||[]).forEach(n=>{ const d=(n.date||'').slice(0,10); if(!d) return; const a=(_now-new Date(d+'T12:00:00').getTime())/86400000; if(a>=0&&a<=7&&!(d in _by)) _by[d]=n; });
    const l7 = Object.values(_by); if (!l7.length) return null;
    const avgCal = Math.round(l7.reduce((a,n)=>a+(n.calories||0),0)/l7.length);
    const avgP = Math.round(l7.reduce((a,n)=>a+(n.protein||0),0)/l7.length);
    // Compare the 7-day average (which blends training + rest days) against the BLENDED weekly
    // target from Smart targets (~1990), NOT the training-day-only 2250 — otherwise it always
    // reads ~250 under even when eating exactly to plan. Fall back to 1990 if Smart isn't ready.
    // Single source of truth: a committed lock is what the athlete is eating to, so the delta is
    // measured against it. Only fall back to the live engine / suggestion when nothing is locked.
    // Round 1: same rule as everywhere else: a lock, then your Meals plan (weekly blend), then the engine.
    const planT = effTargets && effTargets.source === 'plan' ? effTargets : null;
    const calTgt = (activeTarget && Number.isFinite(activeTarget.cals)) ? activeTarget.cals
                 : planT ? planT.weekly
                 : (nutriCoach && nutriCoach.ok && nutriCoach.targetCals) ? nutriCoach.targetCals
                 : (nutriCoach && nutriCoach.suggested) ? nutriCoach.suggested
                 : 1990;
    const lockedT = activeTarget && Number.isFinite(activeTarget.cals) ? activeTarget : null;
    const pTgt = lockedT && lockedT.protein != null ? lockedT.protein : planT ? planT.protein : (nutriCoach && nutriCoach.proteinG) ? nutriCoach.proteinG : 210;
    return { avgCal, avgP, calTgt, pTgt, calDelta: avgCal-calTgt, pDelta: avgP-pTgt, n:l7.length };
  }, [nutrition, nutriCoach, activeTarget, effTargets]);

  return { mealDay, setMealDay, mealTime, setMealTime, activeTarget, setActiveTarget, showCalLog, setShowCalLog, nutriDayType, setNutriDayType, nutritionRaw, setNutrition, nutrition, nP, setNP, nC, setNC, nF, setNF, showAddNutri, setShowAddNutri, nDate, setNDate, addNutrition, nutriCoach, targetLock, lockCals, setLockCals, acceptTarget, effTargets, mealSlot, setMealSlot, mealPlan, hydration, protSeries, calStats };
}
