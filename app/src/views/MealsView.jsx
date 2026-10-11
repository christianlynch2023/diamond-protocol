// MealsView: moved out of App.jsx in Phase 2b. Behaviour unchanged.
import React from 'react';
import { useApp } from '../appContext.js';
import { MEAL_PLAN } from '../data/mealPlan.js';

export default function MealsView() {
  const {
    bodyMetrics, bwRate, mealDay, mealTime, setMealDay, setMealTime
  } = useApp();
  return (() => {
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
      })();
}
