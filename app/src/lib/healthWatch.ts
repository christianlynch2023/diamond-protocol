// Health watch (pure, tested). Tracks the markers that matter most on a TRT protocol with growth hormone
// and a past trenbolone course, across every blood panel you've stored, with a watch level and an act
// level (the point to speak to your GP or prescriber) for each, a trend against the previous panel, and
// a retest date. Information only: thresholds follow mainstream clinical guidance, and nothing here gives
// or changes any dosing.

export type Status = 'ok' | 'watch' | 'act';
export interface PanelMarker { k: string; disp: string; unit?: string; ref?: string; }
export interface Panel { date: string; groups: { g: string; m: PanelMarker[] }[]; deletedAt?: number | null; }

export interface WatchDef {
  id: string; name: string; unit: string;
  match: RegExp;                       // against the normalised marker name (lowercase letters and digits)
  exclude?: RegExp;
  high: boolean;                       // true: higher is worse; false: lower is worse
  watch: number; act: number;
  convert?: (v: number, unit: string) => number;   // to `unit`, from what the lab reported
  why: string; actNote: string;
}

const per = (u: string) => u.toLowerCase().replace(/\s/g, '');
export const WATCH: readonly WatchDef[] = [
  { id: 'hct', name: 'Haematocrit', unit: '%', match: /^(haematocrit|hematocrit|hct|pcv|packedcellvolume)$/, high: true, watch: 52, act: 54,
    convert: (v, u) => (v < 1 || per(u) === 'l/l' ? v * 100 : v),
    why: 'TRT raises red cell mass; thicker blood raises clot and blood pressure risk.', actNote: '54% is the level at which TRT is usually reviewed. Contact your prescriber promptly.' },
  { id: 'hb', name: 'Haemoglobin', unit: 'g/l', match: /^(haemoglobin|hemoglobin|hb|hgb)$/, high: true, watch: 175, act: 185,
    convert: (v, u) => (per(u) === 'g/dl' || v < 30 ? v * 10 : v),
    why: 'Moves with haematocrit.', actNote: 'Raise it with your prescriber alongside haematocrit.' },
  { id: 'ldl', name: 'LDL cholesterol', unit: 'mmol/l', match: /^(ldl|ldlc|ldlcholesterol|calculatedldl|ldlcalculated)$/, high: true, watch: 3.0, act: 4.1,
    convert: (v, u) => (per(u) === 'mg/dl' || v > 30 ? v / 38.67 : v),
    why: 'Androgens, trenbolone especially, push LDL up.', actNote: 'Discuss cardiovascular risk and options with your GP.' },
  { id: 'hdl', name: 'HDL cholesterol', unit: 'mmol/l', match: /^(hdl|hdlc|hdlcholesterol)$/, high: false, watch: 1.2, act: 0.9,
    convert: (v, u) => (per(u) === 'mg/dl' || v > 10 ? v / 38.67 : v),
    why: 'Anabolic compounds can drop protective HDL sharply.', actNote: 'Very low HDL raises cardiovascular risk; discuss with your GP.' },
  { id: 'apob', name: 'ApoB', unit: 'mg/dl', match: /^(apob|apolipoproteinb|apolipoproteinb100)$/, high: true, watch: 100, act: 130,
    convert: (v, u) => (per(u) === 'g/l' || v < 5 ? v * 100 : v),
    why: 'The best single measure of atherogenic particles.', actNote: 'Discuss cardiovascular risk with your GP.' },
  { id: 'glu', name: 'Fasting glucose', unit: 'mmol/l', match: /^(glucose|fastingglucose|glucosefasting|plasmaglucose|fastingplasmaglucose)$/, high: true, watch: 6.1, act: 7.0,
    convert: (v, u) => (per(u) === 'mg/dl' || v > 30 ? v / 18 : v),
    why: 'Growth hormone raises fasting glucose.', actNote: '7.0 or above needs a repeat test and a GP review.' },
  { id: 'a1c', name: 'HbA1c', unit: 'mmol/mol', match: /^(hba1c|haemoglobina1c|glycatedhaemoglobin)/, high: true, watch: 42, act: 48,
    convert: (v, u) => (per(u) === '%' || v < 15 ? (v - 2.15) * 10.929 : v),
    why: 'Average glucose over 2 to 3 months; the steadier read on growth hormone.', actNote: '48 or above is the diabetes threshold; see your GP.' },
  { id: 'cys', name: 'Cystatin C', unit: 'mg/l', match: /^cystatinc$/, high: true, watch: 1.05, act: 1.25,
    why: 'Kidney filtration without the muscle-mass bias of creatinine.', actNote: 'Ask your GP for a cystatin-based eGFR and review.' },
  { id: 'egfr', name: 'eGFR', unit: 'ml/min', match: /^(egfr|estimatedglomerularfiltrationrate)/, high: false, watch: 75, act: 60,
    why: 'Creatinine-based, so it reads low in muscular people; cystatin C is the cross-check.', actNote: 'Below 60 needs a GP review, ideally with cystatin C.' },
  { id: 'alt', name: 'ALT', unit: 'U/l', match: /^(alt|alanineaminotransferase)/, high: true, watch: 45, act: 120,
    why: 'Liver strain marker.', actNote: 'Three times the upper limit needs a GP review.' },
  { id: 'ast', name: 'AST', unit: 'U/l', match: /^(ast|aspartateaminotransferase)/, high: true, watch: 40, act: 120,
    why: 'Liver and muscle; heavy training in the 48 hours before a draw raises it.', actNote: 'Repeat after 3 rest days; if still high, see your GP.' },
  { id: 'ggt', name: 'GGT', unit: 'U/l', match: /^(ggt|gammagt|gammaglutamyltransferase|gammaglutamyltranspeptidase)/, high: true, watch: 60, act: 100,
    why: 'Liver marker that training does not raise, so a cleaner signal than AST.', actNote: 'Discuss with your GP.' },
  { id: 'prl', name: 'Prolactin', unit: 'mIU/l', match: /^prolactin$/, high: true, watch: 325, act: 700,
    why: 'Trenbolone can raise prolactin.', actNote: 'Raise it with your prescriber.' },
  { id: 'e2', name: 'Oestradiol', unit: 'pmol/l', match: /^(oestradiol|estradiol|e2)$/, exclude: /sensitive/, high: true, watch: 160, act: 250,
    convert: (v, u) => (per(u) === 'pg/ml' ? v * 3.671 : v),
    why: 'Testosterone converts to oestradiol.', actNote: 'Raise it with your prescriber.' },
  { id: 'psa', name: 'PSA', unit: 'µg/l', match: /(^psa$|^totalpsa|prostatespecificantigen)/, exclude: /free|fpsa|ratio/, high: true, watch: 2.0, act: 3.0,
    why: 'Routine TRT monitoring.', actNote: '3.0 or above at your age warrants a GP review.' },
];

const norm = (k: string): string => String(k || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const readNum = (disp: string): number | null => {
  const m = String(disp || '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
};

export interface Reading { date: string; value: number; disp: string; unit: string; }
export interface WatchRow { def: WatchDef; latest: Reading | null; prev: Reading | null; status: Status | null; trend: 'up' | 'down' | 'flat' | null; }

export function statusOf(def: WatchDef, v: number): Status {
  if (def.high) return v >= def.act ? 'act' : v >= def.watch ? 'watch' : 'ok';
  return v <= def.act ? 'act' : v <= def.watch ? 'watch' : 'ok';
}

/** One row per watched marker, from every stored panel, newest reading first. */
export function healthWatch(panels: readonly Panel[] | null | undefined): WatchRow[] {
  const live = (panels || []).filter(p => p && !p.deletedAt && typeof p.date === 'string').slice().sort((a, b) => (a.date < b.date ? 1 : -1));
  return WATCH.map(def => {
    const readings: Reading[] = [];
    for (const p of live) {
      for (const g of p.groups || []) for (const m of g.m || []) {
        const k = norm(m.k);
        if (!def.match.test(k) || (def.exclude && def.exclude.test(k))) continue;
        const raw = readNum(m.disp);
        if (raw === null) continue;
        const value = def.convert ? def.convert(raw, m.unit || '') : raw;
        if (!readings.some(r => r.date === p.date)) readings.push({ date: p.date, value: Math.round(value * 100) / 100, disp: m.disp, unit: m.unit || '' });
      }
    }
    const latest = readings[0] ?? null, prev = readings[1] ?? null;
    let trend: WatchRow['trend'] = null;
    if (latest && prev) { const d = (latest.value - prev.value) / (Math.abs(prev.value) || 1); trend = Math.abs(d) < 0.03 ? 'flat' : d > 0 ? 'up' : 'down'; }
    return { def, latest, prev, status: latest ? statusOf(def, latest.value) : null, trend };
  });
}

/** Blood pressure from your logged readings (7-day average): watch from 130/85, act from 140/90. */
export function bpStatus(avgSys: number | null | undefined, avgDia: number | null | undefined): Status | null {
  if (!Number.isFinite(avgSys as number) || !Number.isFinite(avgDia as number)) return null;
  const s = avgSys as number, d = avgDia as number;
  return s >= 140 || d >= 90 ? 'act' : s >= 130 || d >= 85 ? 'watch' : 'ok';
}

/** When the next panel is due: 6 months after the last, or 3 months if anything is at watch or act. */
export function retestDue(rows: readonly WatchRow[], panels: readonly Panel[] | null | undefined, today: string): { last: string | null; due: string | null; overdue: boolean; reason: string; include: string[] } {
  const dates = (panels || []).filter(p => p && !p.deletedAt && typeof p.date === 'string').map(p => p.date).sort();
  const last = dates[dates.length - 1] ?? null;
  const flagged = rows.filter(r => r.status === 'watch' || r.status === 'act');
  const include = [...new Set(['Haematocrit', 'Haemoglobin', 'PSA', 'Lipids incl. ApoB', 'Fasting glucose', 'HbA1c', 'Liver (ALT, AST, GGT)', 'Kidney (creatinine, eGFR, cystatin C)', 'Prolactin', 'Oestradiol'])];
  if (!last) return { last: null, due: null, overdue: true, reason: 'No blood panel stored yet.', include };
  const months = flagged.length ? 3 : 6;
  const d = new Date(last + 'T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + months);
  const due = d.toISOString().slice(0, 10);
  return {
    last, due, overdue: due <= today, include,
    reason: flagged.length ? `${flagged.length} marker${flagged.length > 1 ? 's' : ''} at watch or act on your last panel, so retest within 3 months.` : 'Routine TRT monitoring: every 6 months.',
  };
}
