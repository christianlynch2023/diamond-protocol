// BodyView: moved out of App.jsx in Phase 2b. Behaviour unchanged.
import React from 'react';
import { useApp } from '../appContext';
import { SVGChart, Sparkline } from '../components/charts';
import { CTX_TAGS } from '../lib/associations';
import { BLOOD_GROUPS, bloodAutoFlag } from '../lib/bloods';
import { fmtShort, localToday } from '../lib/format';
import { MEAS_SITES, PK_ESTERS, bpCategory, glucoseCategory } from '../lib/health';

export default function BodyView() {
  const {
    KEY_SITES, acceptTarget, activeTarget, addBP, addBldRow, addBodyMetric, addCardio, addCheckin,
    addContext, addGlucose, addMeasurement, addNutrition, addProtocol, analyseProgress, biomarkers,
    bldForm, bloodCompare, bloodMarkerIndex, bloodsLog, bodyDash, bodyMetrics, bpDate, bpDia, bpLog,
    bpPulse, bpSeries, bpStats, bpSys, bwRate, cDate, cMin, cNote, cType, calStats, cancelBloodPanel,
    cardioLog, cardioMins, cardioSessions, cardioTrend, chartEvents, checkins, ciAddPose, ciAnalysing,
    ciAnalysis, ciCompareA, ciCompareB, ciPose, clearVitalField, contextLog, ctxDate, ctxNote,
    ctxReasons, ctxTags, ctxUnits, decayModel, delBldRow, delCheckin, deleteBloodPanel, editBloodPanel,
    effTargets, expandedSite, glDate, glSeries, glStats, glVal, glucoseLog, goalPhase, hydration, imgOf,
    latestBP, latestBySite, latestGl, lockCals, mDate, mSite, mVal, mViewSite, mealPlan, mealSlot,
    measSeries, measurements, nC, nDate, nF, nP, newWt, newWtNote, nutriCoach, nutriDayType, nutrition,
    openBodyEdit, pCmp, pDate, pDose, pNote, pUnit, protSeries, protocolLog, saveBloodPanel,
    saveTempBody, secOpen, setBldForm, setBodyMetrics, setBpDate, setBpDia, setBpLog, setBpPulse,
    setBpSys, setCDate, setCMin, setCNote, setCType, setCardioLog, setCiAddPose, setCiCompareA,
    setCiCompareB, setCiPose, setContextLog, setCtxDate, setCtxNote, setCtxTags, setCtxUnits,
    setExpandedSite, setGlDate, setGlVal, setGlucoseLog, setLockCals, setMDate, setMSite, setMVal,
    setMViewSite, setMealSlot, setMeasurements, setNC, setNDate, setNF, setNP, setNewWt, setNewWtNote,
    setNutriDayType, setNutrition, setPCmp, setPDate, setPDose, setPNote, setPUnit, setProtocolLog,
    setShowAddBP, setShowAddBody, setShowAddCardio, setShowAddCtx, setShowAddGl, setShowAddMeas,
    setShowAddNutri, setShowAddProt, setShowAddTemp, setShowBpLog, setShowCalLog, setShowCtxLog,
    setShowGlLog, setShowTempLog, setShowWoodLog, setShowWtLog, setTDate, setTVal, setWDate, setWtDate,
    showAddBP, showAddBody, showAddCardio, showAddCtx, showAddGl, showAddMeas, showAddNutri, showAddProt,
    showAddTemp, showBpLog, showCalLog, showCtxLog, showGlLog, showTempLog, showWoodLog, showWtLog,
    startBloodPanel, tDate, tVal, targetLock, tempBand, tempChartSeries, tempLogList, toggleSec,
    tombstone, updBldRow, upsertVitalsDated, vitalsLog, wDate, whoopCardio, woodLogList, wtDate
  } = useApp();
  return (
        <div className="screen">
          <div className="topbar"><span className="logo">Body</span></div>

          <div className="body-sec">
            <div className="sec-head" onClick={()=>toggleSec('weight')}><div className="body-ttl">Body Weight</div><span className={'sec-chev'+(secOpen('weight')?' op':'')}>▾</span></div>
            {secOpen('weight') && <>
            <div className="body-sub">Weekly weigh-in — track alongside your training block</div>
            <button className="add-toggle add-primary" onClick={()=>setShowAddBody(v=>!v)}>
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
            {(bodyDash.curW!=null) && (
              <div className="dash-cards">
                <div className="dash-card">
                  <div className="dc-lbl">Weight</div>
                  <div className="dc-val">{bodyDash.curW}<span className="dc-u">kg</span></div>
                  <div className="dc-sub">{bodyDash.avg7!=null?`7-day avg ${bodyDash.avg7.toFixed(1)}kg`:''}</div>
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
                        <span className="site-spark">{d.spark && d.spark.length>1 && <Sparkline vals={d.spark} color={key?'#b8c2cf':'#5a6b7a'}/>}</span>
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
                <SVGChart data={measSeries} height={120} color="#b8c2cf"/>
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
              <span style={{fontSize:11,color:'var(--t2)',letterSpacing:'.1em',textTransform:'uppercase'}}>Add as</span>
              {['front','side','back'].map(p=>(
                <button key={p} onClick={()=>setCiAddPose(p)} style={{padding:'5px 11px',fontSize:11,borderRadius:6,border:'1px solid var(--bdr)',background:ciAddPose===p?'var(--acc)':'var(--sur)',color:ciAddPose===p?'#000':'var(--t2)',fontWeight:ciAddPose===p?700:500,textTransform:'capitalize'}}>{p}</button>
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
                                <div style={{position:'absolute',top:0,left:0,right:0,padding:'3px 5px',background:'rgba(0,0,0,.65)',fontSize:11,color:'#fff',display:'flex',justifyContent:'space-between'}}>
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
              {(nutriCoach.ok || (effTargets && (effTargets.source==='locked' || effTargets.source==='plan'))) && (
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
                  <div className="nc-tgt-avg">Weekly avg {effTargets.weekly} kcal{effTargets.source==='locked'?' (locked)':effTargets.source==='plan'?' (your Meals plan)':''} &#183; C {effTargets.carb}g/day ({effTargets.cycle.trainDays} train / {effTargets.cycle.restDays} rest) &#183; {nutriCoach.ok?(nutriCoach.phase==="cut"?(nutriCoach.floorLimited?("floor-limited \u2212"+nutriCoach.impliedRatePct+"%/wk"):("cut \u2212"+nutriCoach.targetRatePct+"%/wk")):nutriCoach.phase==="bulk"?("lean gain +"+nutriCoach.targetRatePct+"%/wk"):"maintenance"):(goalPhase==='cut'?"cut \u2014 held":goalPhase==='bulk'?"lean gain \u2014 held":"maintenance \u2014 held")}</div>
                          {nutriCoach.floorLimited && effTargets.source==='engine' && <div className="nc-tgt-avg" style={{color:"var(--warn)"}}>Held at the {nutriCoach.kcalFloor} kcal minimum ({Math.round(nutriCoach.trendW)}kg &#215; 22), so this prescribes about &#8722;{nutriCoach.impliedRatePct}%/wk rather than the &#8722;{nutriCoach.targetRatePct}%/wk selected. Losing faster would mean going below the floor.</div>}
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
                  <span style={{flex:1,margin:'0 8px',fontFamily:"'Barlow Semi Condensed',monospace",fontSize:11,color:'var(--t2)'}}>P{n.protein} C{n.carbs} F{n.fat}</span>
                  <span className="bl-val">{n.calories}<span style={{fontSize:11,color:'var(--t3)',marginLeft:2}}>kcal</span></span>
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
                        <text x={W-PX} y={yf(cardioTrend.target)-3} textAnchor="end" fontSize="8" fill="#3fe0c5" opacity="0.8" fontFamily="Barlow Semi Condensed">150 min guide</text>
                        {rows.map((r,i)=>{
                          const x=PX+i*bw+bw*0.18, w=bw*0.64;
                          const segs=[['manual','#b8c2cf',r.manual],['z2','#c4ff00',r.z2],['z3','#ffb020',r.z3]];
                          let acc=0;
                          return (<g key={i}>
                            {segs.map(([k,c,v],si)=>{ if(!v) return null; const y0=yf(acc), y1=yf(acc+v); acc+=v;
                              return <rect key={si} x={x} y={y1} width={w} height={Math.max(0,y0-y1)} fill={c} opacity={i===rows.length-1?1:0.75}/>; })}
                            <text x={x+w/2} y={H-2} textAnchor="middle" fontSize="7.5" fill="#728aa2" fontFamily="Barlow Semi Condensed">{i===rows.length-1?'now':fmtShort(new Date(r.t).toISOString()).split(' ')[0]}</text>
                          </g>);
                        })}
                        <text x={PX-4} y={yf(maxV)+4} textAnchor="end" fontSize="8" fill="#728aa2" fontFamily="Barlow Semi Condensed">{Math.round(maxV)}</text>
                      </svg>
                      <div style={{display:'flex',gap:12,marginTop:6,flexWrap:'wrap'}}>
                        {[['Logged','#b8c2cf'],['Zone 2','#c4ff00'],['Zone 3','#ffb020']].map(([l,c],i)=>(
                          <span key={i} style={{display:'flex',alignItems:'center',gap:4,fontSize:11,color:'var(--t2)'}}>
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
                  <span style={{flex:1,margin:'0 8px',color:'var(--t)',fontWeight:600,fontSize:12}}>{c.modality}{c.note ? <span style={{color:'var(--t3)',fontWeight:400,fontSize:11}}> &#183; {c.note}</span> : null}</span>
                  <span className="bl-val">{c.minutes}<span style={{fontSize:11,color:'var(--t3)',marginLeft:2}}>min</span></span>
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
                <SVGChart data={bpSeries} height={110} color="#ff6b6b" trend={true} anchor={40} events={chartEvents} band={{lo:90,hi:120}} bandColor="#3fe0c5" bandLabel="normal systolic"/>
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
                  <span style={{flex:1,margin:'0 8px',color:'var(--t)',fontWeight:600,fontSize:12}}>{b.sys}/{b.dia}{b.pulse ? <span style={{color:'var(--t3)',fontWeight:400,fontSize:11}}> &#183; {b.pulse}bpm</span> : null}</span>
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
                    {c.note?<span style={{color:'var(--t3)',fontWeight:400,fontSize:11}}> · {c.note}</span>:null}
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
                <SVGChart data={glSeries} height={110} color="#ffb020" trend={true} anchor={3} band={{lo:4.0,hi:5.5}} bandColor="#3fe0c5" bandLabel="fasting in-range"/>
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
                  <span style={{flex:1,margin:'0 8px',color:'var(--t)',fontWeight:600,fontSize:12}}>{g.value}<span style={{color:'var(--t3)',fontWeight:400,fontSize:11}}> mmol/L</span></span>
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
                <SVGChart data={tempChartSeries} height={110} color="#ff9f43" trend={true} anchor={1.5} events={chartEvents} band={tempBand} bandColor="#3fe0c5" bandLabel="your baseline"/>
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
                  <span style={{flex:1,margin:'0 8px',color:'var(--t)',fontWeight:600,fontSize:12}}>{v.temp}<span style={{color:'var(--t3)',fontWeight:400,fontSize:11}}> &deg;</span></span>
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
                    <datalist id="bld-markers">{(Object.values(bloodMarkerIndex) as any[]).map(m => <option key={m.k} value={m.k} />)}</datalist>
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
                        {bloodCompare.dates.map(d=><th key={d} style={{padding:'4px 8px 6px',color:'var(--t2)',fontFamily:"'Barlow Semi Condensed',monospace",fontWeight:700,whiteSpace:'nowrap',textAlign:'center'}}>{fmtShort(d)}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {bloodCompare.rows.map((r,i)=>(
                        <tr key={i} style={{borderTop:'1px solid var(--bdr)'}}>
                          <td style={{textAlign:'left',padding:'6px 8px 6px 0',color:'var(--t)',position:'sticky',left:0,background:'var(--crd)',whiteSpace:'nowrap'}}>{r.label}{r.unitMismatch && <span title="Units differ between panels" aria-label="Units differ between panels" style={{color:'#e0b020',marginLeft:4}}>&#9888;</span>}</td>
                          {bloodCompare.dates.map(d=>{
                            const c = r.cells[d];
                            const col = !c ? 'var(--t3)' : (c.flag==='high'||c.flag==='low') ? '#ff6b6b' : c.flag==='watch' ? '#e0b020' : 'var(--t)';
                            return <td key={d} style={{padding:'6px 8px',textAlign:'center',fontFamily:"'Barlow Semi Condensed',monospace",color:col,whiteSpace:'nowrap'}}>{c ? `${c.flag==='high'?'\u25b2 ':c.flag==='low'?'\u25bc ':''}${c.disp}` : '\u2014'}</td>;
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
                    {[0,0.5,1].map((f,i)=>{const y=(H-PY)-f*(H-2*PY);return(<g key={i}><line x1={PX} y1={y} x2={W-PX} y2={y} stroke="#1d2733" strokeWidth="1" strokeDasharray="3 3"/><text x={PX-4} y={y+3} textAnchor="end" fontSize="8" fill="#728aa2" fontFamily="Barlow Semi Condensed">{Math.round(f*dm.maxAmt)}</text></g>);})}
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
                        <text x={xf(d)} y={PY-4} textAnchor="middle" fontSize="7" fill="#a479e2" opacity="0.9" fontFamily="Barlow Semi Condensed">bloods</text>
                      </g>);
                    })}
                    <text x={PX} y={H-2} textAnchor="start" fontSize="8" fill="#728aa2" fontFamily="Barlow Semi Condensed">{fmtShort(new Date(dm.t0).toISOString())}</text>
                    <text x={W-PX} y={H-2} textAnchor="end" fontSize="8" fill="#728aa2" fontFamily="Barlow Semi Condensed">today</text>
                    <text x={PX-4} y={PY-5} fontSize="7.5" fill="#728aa2" fontFamily="Barlow Semi Condensed">mg-eq</text>
                  </svg>
                  <div style={{marginTop:8,display:'flex',flexDirection:'column',gap:5}}>
                    {dm.series.map((s,si)=>(
                      <div key={si} style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
                        <span style={{width:8,height:8,borderRadius:2,background:s.color,flexShrink:0}}/>
                        <span style={{fontSize:11,color:'var(--t)',fontWeight:600}}>{s.name}</span>
                        <span style={{fontSize:11,color:'var(--t2)',fontFamily:"'Barlow Semi Condensed',monospace"}}>t&#189; ~{s.hl}d ({s.conf}) &#183; {s.n} logged &#183; now ~{Math.round(s.cur)} (peak ~{Math.round(s.peak)}) mg-eq</span>
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
      );
}
