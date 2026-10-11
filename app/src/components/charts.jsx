// Split out of App.jsx in Phase 2. Behaviour unchanged.
import React from 'react';

export function RecoveryFuelStrip({ rows, height=150 }) {
  // rows: [{date, recovery, kcal, carbs, sleepH}] oldest->newest
  if (!rows || rows.length < 3) return <div style={{height,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--t3)',fontSize:12,textAlign:'center'}}>Need 3+ days with both WHOOP and logged nutrition to show the overlay</div>;
  const W=Math.max(rows.length*30, 300), barH=height-46, pad=4;
  const kcals=rows.map(r=>r.kcal).filter(v=>v!=null);
  // §8.6: scale calorie bars from an absolute ZERO baseline (rounded ceiling), not min->max.
  // Min-max scaling stretched the lowest day to ~0px and the highest to full height, making a
  // trivial 2200-vs-2400 difference look dramatic. Zero-based bars show true magnitude; the exact
  // figure is labelled under each bar and the recovery line carries the day-to-day signal.
  const kcalTop=kcals.length?Math.max(Math.ceil(Math.max(...kcals)/500)*500,500):500;
  const colW=(W-pad*2)/rows.length;
  // recovery line points (0-100 mapped to barH)
  const pts=rows.map((r,i)=>{
    const x=pad+colW*i+colW/2;
    const y=r.recovery!=null ? (barH - (r.recovery/100)*barH) : null;
    return {x,y,r};
  });
  const line=pts.filter(p=>p.y!=null).map((p,i)=>`${i===0?'M':'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const recColor=r=>r>=67?'#00e87a':r>=34?'#f0c020':'#ff6b6b';
  return (
    <div style={{overflowX:'auto'}}>
      <svg width={W} height={height} style={{display:'block'}}>
        {rows.map((r,i)=>{
          const x=pad+colW*i;
          const kh=r.kcal!=null ? Math.max((r.kcal/kcalTop)*(barH*0.8), 3) : 0;
          return (
            <g key={i}>
              {r.kcal!=null && <rect x={x+colW*0.2} y={barH-kh} width={colW*0.6} height={kh} rx={2} fill="rgba(74,158,255,.32)"/>}
              <text x={x+colW/2} y={height-26} fontSize="8" fill="var(--t3)" textAnchor="middle">{r.kcal!=null?Math.round(r.kcal/100)/10+'k':''}</text>
              <text x={x+colW/2} y={height-14} fontSize="8" fill="var(--t3)" textAnchor="middle">{r.date.slice(5)}</text>
              {r.sleepH!=null && <text x={x+colW/2} y={height-2} fontSize="7.5" fill="var(--t3)" textAnchor="middle">{r.sleepH}h</text>}
            </g>
          );
        })}
        {line && <path d={line} fill="none" stroke="#00e87a" strokeWidth="2"/>}
        {pts.filter(p=>p.y!=null).map((p,i)=>(<circle key={i} cx={p.x} cy={p.y} r="3.5" fill={recColor(p.r.recovery)}/>))}
      </svg>
    </div>
  );
}


export function Sparkline({ vals, color='#4a9eff', w=54, h=18 }) {
  const nums = (vals||[]).filter(v=>typeof v==='number'&&isFinite(v));
  if (nums.length < 2) return <svg width={w} height={h}/>;
  const min=Math.min(...nums), max=Math.max(...nums), rng=(max-min)||1;
  const pts=nums.map((v,i)=>`${(i/(nums.length-1))*w},${h-((v-min)/rng)*h}`).join(' ');
  return <svg width={w} height={h} style={{display:'block'}}><polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round"/></svg>;
}

// Scatter for RELATIONSHIP questions. Bucketed means answer "is A associated with B?" by
// hiding the very thing that decides it: the spread. Three rows of averages look identical
// whether the points are tightly clustered or all over the chart. A scatter shows the
// spread, any single outlier carrying the result, and whether a line through it is honest.
export function SVGScatter({ points, color='#c4ff00', height=150, xLabel='', yLabel='', xMin=null, xMax=null, bands=null }) {
  const pts = (points||[]).filter(p => p && Number.isFinite(p.x) && Number.isFinite(p.y));
  if (pts.length < 3) return <div style={{height,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--t3)',fontSize:12}}>Need at least 3 sessions to plot</div>;
  const W = 320, H = height, PX = 30, PY = 14;
  const iW = W - PX*2, iH = H - PY*2;
  const xs = pts.map(p=>p.x), ys = pts.map(p=>p.y);
  const x0 = Number.isFinite(xMin) ? xMin : Math.min(...xs);
  const x1 = Number.isFinite(xMax) ? xMax : Math.max(...xs);
  const xr = (x1 - x0) || 1;
  const yPad = Math.max(2, (Math.max(...ys) - Math.min(...ys)) * 0.15);
  const y0 = Math.min(...ys) - yPad, y1 = Math.max(...ys) + yPad;
  const yr = (y1 - y0) || 1;
  const tx = v => PX + ((v - x0)/xr) * iW;
  const ty = v => PY + iH - ((v - y0)/yr) * iH;
  // Least-squares fit, drawn only with enough points to be worth showing.
  let fit = null;
  if (pts.length >= 6) {
    const n = pts.length;
    const mx = xs.reduce((a,b)=>a+b,0)/n, my = ys.reduce((a,b)=>a+b,0)/n;
    let num=0, den=0;
    for (const p of pts) { num += (p.x-mx)*(p.y-my); den += (p.x-mx)*(p.x-mx); }
    if (den > 0) {
      const m = num/den, c = my - m*mx;
      fit = { x1:tx(x0), y1:ty(m*x0+c), x2:tx(x1), y2:ty(m*x1+c) };
    }
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{width:'100%',height:'auto',display:'block'}}>
      {bands && bands.map((b,i) => (
        <rect key={'b'+i} x={tx(Math.max(x0,b.from))} y={PY}
              width={Math.max(1, tx(Math.min(x1,b.to)) - tx(Math.max(x0,b.from)))}
              height={iH} fill={b.color} opacity="0.08"/>
      ))}
      <line x1={PX} y1={ty(0)} x2={W-PX} y2={ty(0)} stroke="var(--bdr)" strokeWidth="1" strokeDasharray="3 3"/>
      <text x={PX-4} y={ty(0)+3} textAnchor="end" fontSize="8" fill="var(--t3)" fontFamily="JetBrains Mono">0%</text>
      {fit && <line x1={fit.x1} y1={fit.y1} x2={fit.x2} y2={fit.y2} stroke={color} strokeWidth="1.5" strokeOpacity="0.55" strokeDasharray="5 4"/>}
      {pts.map((p,i) => (
        <circle key={i} cx={tx(p.x)} cy={ty(p.y)} r="3.5" fill={color} fillOpacity="0.75" stroke={color} strokeWidth="0.5"/>
      ))}
      <text x={PX} y={H-2} fontSize="8" fill="var(--t3)" fontFamily="JetBrains Mono">{Math.round(x0)}</text>
      <text x={W-PX} y={H-2} textAnchor="end" fontSize="8" fill="var(--t3)" fontFamily="JetBrains Mono">{Math.round(x1)}</text>
      <text x={W/2} y={H-2} textAnchor="middle" fontSize="8" fill="var(--t3)" fontFamily="JetBrains Mono">{xLabel}</text>
      <text x={2} y={PY+6} fontSize="8" fill="var(--t3)" fontFamily="JetBrains Mono">{yLabel}</text>
    </svg>
  );
}


// Bars for CATEGORICAL comparison. Session types alternate rather than progress, so a line
// joining them implies a continuity that does not exist: Upper 3 at 72 min followed by Lower
// at 95 min is not a downward trend, it is two different sessions.
export function SVGBars({ items, color='#4a9eff', height=130, unit='' }) {
  const rows = (items||[]).filter(i => i && Number.isFinite(i.value));
  if (!rows.length) return <div style={{height,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--t3)',fontSize:12}}>No data yet</div>;
  const W = 320, H = height, PX = 8, PT = 12, PB = 26;
  const iW = W - PX*2, iH = H - PT - PB;
  const max = Math.max(...rows.map(r => Number.isFinite(r.hi) ? r.hi : r.value)) * 1.12 || 1;
  const bw = iW / rows.length;
  const hasRange = rows.some(r => Number.isFinite(r.lo) && Number.isFinite(r.hi));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{width:'100%',height:'auto',display:'block'}}>
      {rows.map((r,i) => {
        const h = Math.max(1, (r.value/max) * iH);
        const x = PX + i*bw + bw*0.18, w = bw*0.64;
        const y = PT + iH - h;
        return (
          <g key={i}>
            {Number.isFinite(r.lo) && Number.isFinite(r.hi) && (
              <line x1={x+w/2} y1={PT+iH-(r.hi/max)*iH} x2={x+w/2} y2={PT+iH-(r.lo/max)*iH}
                    stroke="var(--t3)" strokeWidth="1" opacity="0.7"/>
            )}
            <rect x={x} y={y} width={w} height={h} rx="3" fill={color} fillOpacity="0.85"/>
            <text x={x+w/2} y={y-3} textAnchor="middle" fontSize="9" fill={color} fontFamily="JetBrains Mono" fontWeight="700">{r.value}</text>
            <text x={x+w/2} y={H-14} textAnchor="middle" fontSize="8" fill="var(--t2)">{r.label}</text>
            {r.sub && <text x={x+w/2} y={H-4} textAnchor="middle" fontSize="7.5" fill="var(--t3)" fontFamily="JetBrains Mono">{r.sub}</text>}
          </g>
        );
      })}
      {hasRange && <text x={PX} y={PT-3} textAnchor="start" fontSize="8" fill="var(--t3)" fontFamily="JetBrains Mono">bar = avg &#183; line = min&ndash;max range</text>}
      {unit && <text x={W-2} y={PT-3} textAnchor="end" fontSize="8" fill="var(--t3)" fontFamily="JetBrains Mono">{unit}</text>}
    </svg>
  );
}


export function SVGChart({ data, color='#c4ff00', height=130, band=null, bandColor='#00e87a', bandLabel=null,
                    trend=false, trendAlpha=0.25, anchor=null, events=null }) {
  // Gradient id derived from the colour. Previously every instance emitted id="cg", so with
  // several charts on one page all area fills resolved to whichever gradient rendered first
  // and charts silently displayed the wrong colour. Deriving from colour is stable across
  // re-renders, and two charts sharing a colour share an identical gradient, so any
  // remaining duplicate is harmless.
  const gid = 'cg' + String(color).replace(/[^a-zA-Z0-9]/g, '');
  // Defense-in-depth: drop any points with non-finite y (NaN/Infinity) before plotting.
  // Protects against legacy localStorage data corrupted before input validation existed,
  // so a single bad value can never produce a broken "M NaN,NaN" path or blank chart.
  data = (data || []).filter(d => d && Number.isFinite(d.y));
  if (!data || data.length < 2) return <div style={{height,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--t3)',fontSize:12}}>Need more sessions to show chart</div>;
  const vals = data.map(d => d.y);
  // A reference band should be visible even when every reading sits outside it, so widen the
  // scale to include the band — otherwise the shading clips to an edge and tells you nothing.
  const hasBand = band && Number.isFinite(band.lo) && Number.isFinite(band.hi) && band.hi > band.lo;
  let maxV = Math.max(...vals, hasBand ? band.hi : -Infinity);
  let minV = Math.min(...vals, hasBand ? band.lo : Infinity);
  // AXIS ANCHORING. Auto-scaling to the data means a 0.4kg water fluctuation fills a third
  // of the chart and reads as a crisis. `anchor` sets a minimum visible span (e.g. 6kg on
  // bodyweight) centred on the data, so ordinary noise looks like ordinary noise. The axis
  // still expands when real movement exceeds the anchor, so nothing is ever clipped.
  if (Number.isFinite(anchor) && anchor > 0) {
    const span = maxV - minV;
    if (span < anchor) {
      const mid = (maxV + minV) / 2;
      maxV = mid + anchor / 2;
      minV = mid - anchor / 2;
    }
  }
  const range = maxV - minV || 1;
  const W=320, H=height, PX=36, PY=14, iW=W-PX*2, iH=H-PY*2;
  // Points were previously spaced purely by index, so a three-day gap between weigh-ins
  // rendered identically to consecutive days and visually distorted the slope. When every
  // point carries a real timestamp (t), space by elapsed time instead. Falls back to even
  // spacing for series that have no dates, so charts without t are unaffected.
  const ts = data.map(d => d.t).filter(v => Number.isFinite(v));
  const timeScaled = ts.length === data.length && data.length > 1;
  const tMin = timeScaled ? Math.min(...ts) : 0;
  const tMax = timeScaled ? Math.max(...ts) : 1;
  const tSpan = tMax - tMin;
  const tx = i => timeScaled && tSpan > 0
    ? PX + ((data[i].t - tMin) / tSpan) * iW
    : PX + (i/(data.length-1))*iW;
  const ty = v => H-PY-((v-minV)/range)*iH;
  const pts = data.map((d,i) => [tx(i), ty(d.y)]);
  // SMOOTHED TREND over raw scatter. A line joining every raw weigh-in makes a water spike
  // look identical to real tissue change - which is exactly how a flat three weeks read as
  // "-1.63 kg/wk". Drawing the raw values as faint dots and the EWMA as the bold line makes
  // the distinction visible without needing a paragraph underneath to explain it.
  // Map events onto the same x scale as the data. Only possible when points carry real
  // timestamps; on index-spaced charts an event has no meaningful position, so it is dropped
  // rather than placed somewhere misleading.
  const annos = [];
  if (events && events.length && timeScaled && tSpan > 0) {
    const xAt = t => PX + ((t - tMin) / tSpan) * iW;
    for (const ev of events) {
      if (!ev || !Number.isFinite(ev.t)) continue;
      if (Number.isFinite(ev.tEnd)) {
        const a = Math.max(tMin, ev.t), b = Math.min(tMax, ev.tEnd);
        if (b < tMin || a > tMax) continue;
        annos.push({ span:true, x1:xAt(a), x2:xAt(b), color:ev.color||'#7b90a8' });
      } else {
        if (ev.t < tMin || ev.t > tMax) continue;
        annos.push({ span:false, x1:xAt(ev.t), color:ev.color||'#7b90a8', label:ev.label||'' });
      }
    }
  }
  let trendPath = null;
  if (trend && data.length >= 4) {
    let e = data[0].y;
    const tp = data.map((d,i) => { e = e + trendAlpha * (d.y - e); return [tx(i), ty(e)]; });
    trendPath = tp.map((p,i) => `${i===0?'M':'L'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  }
  const line = pts.map((p,i) => `${i===0?'M':'L'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const area = line + ` L${pts[pts.length-1][0].toFixed(1)} ${H-PY} L${PX} ${H-PY} Z`;
  const yTicks = [0,0.5,1].map(t => ({v: minV+t*range, y: ty(minV+t*range)}));
  const step = Math.max(1, Math.ceil(data.length/4));
  // Build label indices explicitly (not by value — data.indexOf mis-resolves duplicate date
  // labels). Drop the final stepped label when it would crowd the true last point, then always
  // show the last: this removes the "22 A26 Aug" overlap at the right edge of dense series.
  const xIdx = [];
  for (let i=0;i<data.length;i+=step) xIdx.push(i);
  const lastI = data.length-1;
  if (xIdx.length && lastI - xIdx[xIdx.length-1] < Math.ceil(step*0.6)) xIdx.pop();
  if (lastI >= 0 && xIdx[xIdx.length-1] !== lastI) xIdx.push(lastI);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{width:'100%',display:'block'}}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      {hasBand && (() => {
        const yHi = ty(band.hi), yLo = ty(band.lo);
        const top = Math.min(yHi, yLo), h = Math.abs(yLo - yHi);
        return (
          <g>
            <rect x={PX} y={top} width={iW} height={h} fill={bandColor} opacity="0.10"/>
            <line x1={PX} y1={top} x2={W-PX} y2={top} stroke={bandColor} strokeWidth="1" strokeDasharray="4 3" opacity="0.45"/>
            <line x1={PX} y1={top+h} x2={W-PX} y2={top+h} stroke={bandColor} strokeWidth="1" strokeDasharray="4 3" opacity="0.45"/>
            {bandLabel && <text x={W-PX-2} y={top-3} textAnchor="end" fontSize="8" fill={bandColor} opacity="0.75" fontFamily="JetBrains Mono">{bandLabel}</text>}
          </g>
        );
      })()}
      {yTicks.map((t,i) => (
        <g key={i}>
          <line x1={PX} y1={t.y} x2={W-PX} y2={t.y} stroke="#1d2733" strokeWidth="1" strokeDasharray="3 3"/>
          <text x={PX-5} y={t.y+3} textAnchor="end" fontSize="9" fill="#728aa2" fontFamily="JetBrains Mono">{Math.round(t.v)}</text>
        </g>
      ))}
      {xIdx.map((idx,i) => (
        <text key={i} x={tx(idx)} y={H-2} textAnchor="middle" fontSize="9" fill="#728aa2" fontFamily="JetBrains Mono">{data[idx].x}</text>
      ))}
      {/* EVENT ANNOTATIONS. The app already records deloads, alcohol, illness, travel and
          protocol doses, but none of it reached the charts, so every wobble needed
          interpreting from memory. Markers are positioned on the same time scale as the
          data and drawn beneath it, so they add context without obscuring the line. */}
      {annos.map((a,i) => a.span ? (
        <rect key={'a'+i} x={a.x1} y={PY} width={Math.max(1, a.x2-a.x1)} height={H-PY*2}
              fill={a.color} opacity="0.10"/>
      ) : (
        <g key={'a'+i}>
          <line x1={a.x1} y1={PY} x2={a.x1} y2={H-PY} stroke={a.color} strokeWidth="1"
                strokeDasharray="3 3" opacity="0.5"/>
          <text x={a.x1} y={PY-1} textAnchor="middle" fontSize="7.5" fill={a.color}
                opacity="0.85" fontFamily="JetBrains Mono">{a.label}</text>
        </g>
      ))}
      <path d={area} fill={`url(#${gid})`}/>
      <path d={line} fill="none" stroke={color} strokeWidth={trendPath ? 1 : 2}
            strokeOpacity={trendPath ? 0.28 : 1} strokeLinecap="round" strokeLinejoin="round"/>
      {pts.map((p,i) => <circle key={i} cx={p[0]} cy={p[1]} r={trendPath ? 2 : 3}
                                fill={color} fillOpacity={trendPath ? 0.4 : 1}/>)}
      {trendPath && <path d={trendPath} fill="none" stroke={color} strokeWidth="2.5"
                          strokeLinecap="round" strokeLinejoin="round"/>}
    </svg>
  );
}
