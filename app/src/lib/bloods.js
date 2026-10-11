// Split out of App.jsx in Phase 2. Behaviour unchanged.

// Blood panel entry helpers. Names are normalised so a marker typed as "Total Testosterone"
// or "HCT" picks up the unit, range and group already used for it in earlier panels.
export const BLOOD_GROUPS = ['Hormones','Thyroid','Lipids','Liver','Kidney','Metabolic','Iron','Prostate & vitamins','Full blood count','Other'];

export const BLOOD_ALIAS_KEYS = {
  totaltestosterone:'testosterone', estradiol:'oestradiol', ft4:'freet4', ft3:'freet3',
  estimatedglomerularfiltrationrate:'egfr', totalcholesterolhdlratio:'tchdlratio', cholesterolhdlratio:'tchdlratio',
  rbc:'redbloodcells', wbc:'whitebloodcells', meancellvolume:'mcv', meancellhaemoglobin:'mch',
  meancorpuscularhaemoglobin:'mch', totalbilirubin:'bilirubin', ldlcholesterol:'ldl', hct:'haematocrit',
  hgb:'haemoglobin', prostatespecificantigenpsa:'psa', thyroidfunctiontsh:'tsh',
  sexhormonebindingglobulinshbg:'shbg', folliclestimulatinghormone:'fsh', luteinisinghormone:'lh',
  totaltriglycerides:'triglycerides', redcelldistribution:'rdw',
};

export function bloodNormKey(k) { const s = String(k || '').toLowerCase().replace(/[^a-z0-9]/g, ''); return BLOOD_ALIAS_KEYS[s] || s; }

// Parses "8.6-29.0", "8.6–29.0", "<5.0", "≤42", ">1.0", ">1.55 (Randox)". Returns {lo, hi} or null.
export function bloodParseRef(ref) {
  const r = String(ref || '').replace(/,/g, '');
  let m = r.match(/(-?\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)/);
  if (m) return { lo: +m[1], hi: +m[2] };
  m = r.match(/[<≤]\s*(\d+(?:\.\d+)?)/); if (m) return { lo: null, hi: +m[1] };
  m = r.match(/[>≥]\s*(\d+(?:\.\d+)?)/); if (m) return { lo: +m[1], hi: null };
  return null;
}

export function bloodAutoFlag(value, ref) {
  const v = parseFloat(String(value || '').replace(/[<>≤≥\s]/g, ''));
  const rr = bloodParseRef(ref);
  if (!Number.isFinite(v) || !rr) return 'ok';
  if (rr.lo != null && v < rr.lo) return 'low';
  if (rr.hi != null && v > rr.hi) return 'high';
  return 'ok';
}
