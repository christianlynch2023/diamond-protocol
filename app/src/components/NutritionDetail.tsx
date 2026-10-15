// Nutrition detail for Fuel, in four pieces Fuel places where they belong (Fuel tidy).
// The JSX in each piece is the former Body nutrition code, carried over unchanged.
import React from 'react';
import { useApp } from '../appContext';
import { SVGChart } from '../components/charts';
import { fmtShort } from '../lib/format';

export function FuelTargets() {
  const { activeTarget, effTargets, goalPhase, hydration, mealPlan, mealSlot, nutriCoach, nutriDayType, setMealSlot, setNutriDayType } = useApp();
  return (
    <>
      <div className="nc">
              <div className="nc-hd"><span className="nc-ttl">Daily targets and hydration</span>{nutriCoach.ok && <span className={'nc-conf '+nutriCoach.conf}>{nutriCoach.conf} confidence</span>}</div>
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
                  
                  {nutriCoach.adjust && nutriCoach.adjust.dir==='gap' && <div className="nc-adj down">You are averaging <b>{nutriCoach.adjust.over} kcal/day over target</b>. That gap explains the stall &#8212; the target itself is fine. Close it before changing anything.</div>}
                  {nutriCoach.adjust && nutriCoach.adjust.dir==='down' && <div className="nc-adj down">Intake is on target but loss has stalled. Drop ~{nutriCoach.adjust.kcal} kcal/day: -{nutriCoach.adjust.carb}g carb and -{nutriCoach.adjust.fat}g fat, protein held.</div>}
                  {nutriCoach.adjust && nutriCoach.adjust.dir==='up' && <div className="nc-adj up">Dropping faster than 1%/wk. Add ~{nutriCoach.adjust.kcal} kcal/day (+{nutriCoach.adjust.carb}g carb) to protect muscle.</div>}
                  {nutriCoach.adjust && nutriCoach.adjust.dir==='hold' && <div className="nc-adj hold">On track. Loss rate is in the target range, hold these numbers.</div>}
                  
                </div>
              )}
            </div>
    </>
  );
}

export function FuelEnergy() {
  const { nutriCoach } = useApp();
  return (
    <>
      {(nutriCoach.ok && nutriCoach.avgIntake!=null) ? (
              <div className="energy-bal">
                <div className="eb-item"><div className="eb-v">{nutriCoach.avgIntake}</div><div className="eb-l">avg in</div></div>
                <div className="eb-op">&#8722;</div>
                <div className="eb-item"><div className="eb-v">{nutriCoach.tdee}</div><div className="eb-l">maintenance</div></div>
                <div className="eb-op">=</div>
                <div className="eb-item"><div className="eb-v" style={{color: (nutriCoach.avgIntake-nutriCoach.tdee)>=0?'var(--acc)':'var(--warn)'}}>{(nutriCoach.avgIntake-nutriCoach.tdee)>=0?'+':''}{nutriCoach.avgIntake-nutriCoach.tdee}</div><div className="eb-l">daily net</div></div>
              </div>
            ) : null}
    </>
  );
}

export function FuelProtein() {
  const { nutrition, protSeries } = useApp();
  return (
    <>
      {protSeries.length > 1 && (
              <div style={{marginBottom:10}}>
                <div className="chart-lbl">Protein — last {Math.min(nutrition.length,21)} days (g)</div>
                <SVGChart data={protSeries} height={110} color="#c4ff00"/>
              </div>
            )}
    </>
  );
}

export function FuelLog() {
  const { nutrition, openBodyEdit, setNutrition, setShowCalLog, showCalLog, tombstone } = useApp();
  return (
    <>
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
    </>
  );
}
