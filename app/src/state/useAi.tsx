// AI coach: briefing, session review and check-ins. Split out of useAppState (stage 1 of splitting
// the app-state file). The statements below are moved unchanged; everything they use from the rest of the
// app arrives in `ctx`, and useAppState returns the same names to screens as before.
import { useState } from 'react';
import { DLW, EX_DEF_BY_ID, MUSCLES, SESSIONS, effWR, getPhase } from '../data/programme';
import { exMuscle, getPrevHist, getProgRec, getTarget, weekMuscleVolume } from '../lib/training';
import { fmtShort } from '../lib/format';
import { bpCategory, glucoseCategory } from '../lib/health';
import { COACH_RULES, targetsText, trendsText } from '../lib/coach';

export function useAi(ctx: any) {
  const { activeTarget, avg7, block, bodyMetrics, cardioLog, cardioMins, cardioSessions, deloadInfo, effPhase, goalPhase, latestBP, latestGl, logs, nutriCoach, phaseLine, plateaus, readiness, stalls, week, whoopData } = ctx;
  const [briefing, setBriefing]       = useState(null);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [review, setReview]           = useState(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [periodReview, setPeriodReview] = useState(null);
  const [periodLoading, setPeriodLoading] = useState(false);
  const [periodScope, setPeriodScope] = useState(null);
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
    const prompt=`You are a personal strength coach for a 48-year-old male on an optimised hormonal protocol with enhanced recovery capacity. He follows the Diamond Protocol 12-week hypertrophy programme. ${phaseLine}\n\nTODAY: ${sess.name} - ${sess.focus}\nPhase: ${ph.name} (Week ${week}/12) | Target: ${wr.rir} | Intensifiers: ${wr.i?'ACTIVE - max '+sess.maxInt+' this session':'Off - straight sets only'}\nWHOOP: ${whStr}\nBody: ${bodyStr}\nFuel: ${fuelStr}\nBlood pressure: ${bpStr}\nFasting glucose: ${glStr}\nRecent joint/tendon pain: ${painStr}\nToday's readiness call: ${readiness.title} - ${readiness.action}\n\nEXERCISE PROGRESSION:\n${progLines}\n\nENGINE TARGETS (the app's prescriptions for today; quote them exactly):\n${targetsText(sess.exercises.map(ex => ({ name: ex.name, t: getTarget(ex, logs, week, effPhase) })))}\n\nSTRENGTH TRENDS (effort-adjusted e1RM, last 4-6 sessions):\n${trendsText(stalls, sess.exercises.map(ex => ex.name))}\n\nRECENT SESSIONS:\n${recent}\n\nWrite a concise pre-session briefing in 3-4 short paragraphs. Be specific with weights and reps. Cover: (1) readiness based on recovery data - and if low recovery lines up with low fuel/protein or poor sleep, say so plainly. If BP is Stage 1+, hold intensifiers/grinders today. If fasting glucose is in the watch/high band, note it briefly as a stack signal to monitor (do not alarm or diagnose). Anchor nutrition comments to the 7-day trend not single days, (2) the exact targets for the main lifts as listed in ENGINE TARGETS: explain why each is what it is (increase, hold, reset or deload) and never give different weights or reps, (3) ${wr.i?'which '+sess.maxInt+' intensifiers to use today and why':'key execution focus for straight sets today'}, (4) one sharp technical or mindset cue. If sharp joint or tendon pain is flagged on any lift, recommend a machine or cable alternative for it today. Keep your guidance consistent with today's readiness call above and explain its reasoning in your own words. Direct, no fluff. ${COACH_RULES}`;
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
    const prompt = `You are a personal strength coach reviewing a just-completed session for a 48-year-old male on an optimised hormonal protocol with enhanced recovery capacity, following the Diamond Protocol 12-week hypertrophy programme. ${phaseLine}\n\nSESSION JUST COMPLETED: ${last.sessionName} - Week ${last.week} (${ph.name}, target ${wr2.rir})\nDuration: ${last.duration} min | Recovery context: ${whStr}\n\nEXERCISE RESULTS (today vs last time):\n${lines}\n\nSTRENGTH TRENDS (effort-adjusted e1RM, last 4-6 sessions):\n${trendsText(stalls, (last.exercises || []).map(ex => ex.name))}\n\nNEXT TIME (the app's prescriptions for these lifts):\n${targetsText((last.exercises || []).map(ex => { const def = EX_DEF_BY_ID[ex.origId || ex.id] || EX_DEF_BY_ID[ex.id]; return def ? { name: ex.name, t: getTarget(def, logs, week, effPhase, ex.id) } : null; }))}\n\nWrite a concise post-session review in 2-3 short paragraphs. Cover: (1) what clearly progressed today (specific lifts that added weight or reps), (2) anything that stalled or regressed and the likely reason, (3) 2-3 specific, actionable adjustments for next time this session comes around - using the NEXT TIME prescriptions above for the exact weights and reps. If any lift has sharp pain flagged, recommend swapping it for a joint-friendly alternative next time. Be direct and encouraging but honest. Talk like a coach who tracks every set. ${COACH_RULES}`;
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
  const getPeriodReview = async (scope) => {
    setPeriodScope(scope); setPeriodReview(null); setPeriodLoading(true);
    const ph = getPhase(week);
    const fmtVol = (v: Record<string, number>) => Object.keys(v).length ? Object.entries(v).map(([m,s]) => `${MUSCLES[m]?.name||m} ${Math.round(s*10)/10}`).join(', ') : 'none';
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
Stalled lifts: ${platLine}\nStrength trends (effort-adjusted, last 4-6 sessions): ${trendsText(stalls)}
Bodyweight: ${bw}\nBlood pressure: ${bpLine}\nEnergy balance (empirical, 7-21d): ${ebLine}

Write a concise weekly check-in in 2-3 short paragraphs. Cover: (1) how the week went - volume hit, whether recovery is holding, (2) anything to watch (stalls, under-trained muscles, fatigue, low protein), (3) 2-3 specific things to focus on next week. Where the data allows, connect the dots - e.g. flag if low protein lines up with stalls, if sleep debt or low recovery tracks with how sessions felt, or if blood pressure is drifting up with training load. Reference the adaptive nutrition numbers above: say whether current intake and the suggested target line up with the ${goalPhase} goal and whether the weight trend supports it. Direct and practical, like a coach reviewing the week. ${COACH_RULES}`;
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
Stalled lifts: ${platLine}\nStrength trends (effort-adjusted, last 4-6 sessions): ${trendsText(stalls)}
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

  return { briefing, setBriefing, briefingLoading, setBriefingLoading, review, setReview, reviewLoading, setReviewLoading, periodReview, setPeriodReview, periodLoading, setPeriodLoading, periodScope, setPeriodScope, getBriefing, getReview, getPeriodReview };
}
