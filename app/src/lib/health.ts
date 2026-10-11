// Split out of App.jsx in Phase 2. Behaviour unchanged.

export const MEAS_SITES = ['Waist','Chest','Shoulders','Neck','Hips','Left Arm','Right Arm','Left Forearm','Right Forearm','Left Thigh','Right Thigh','Left Calf','Right Calf'];


export function bpCategory(sys, dia) {
  if (sys >= 180 || dia >= 120) return { label: 'Crisis - seek care', cls: 'red' };
  if (sys >= 140 || dia >= 90) return { label: 'High (Stage 2)', cls: 'red' };
  if (sys >= 130 || dia >= 80) return { label: 'High (Stage 1)', cls: 'amber' };
  if (sys >= 120) return { label: 'Elevated', cls: 'amber' };
  return { label: 'Normal', cls: 'green' };
}


export function glucoseCategory(g) {
  // Fasting glucose in mmol/L. Thresholds: normal <5.6, impaired/watch 5.6-6.9, high >=7.0
  if (g >= 7.0) return { label: 'High - review', cls: 'red' };
  if (g >= 5.6) return { label: 'Watch (impaired fasting)', cls: 'amber' };
  if (g < 3.9) return { label: 'Low', cls: 'amber' };
  return { label: 'Normal', cls: 'green' };
}


// P0.7: Personal blood panels removed from source (were VOY_AUG_2026 / MAY_2026_BLOODS).
// They are user data, not code — kept in localStorage/backup, imported via Tools → Import.
// Extracted copy: bloods-backup.json. Nothing here recreates them (see bloods_log default = []).

// ---------------------------------------------------------------------------------------------
// RETROSPECTIVE INJECTION-DECAY MODEL (descriptive only).
// This models the decline of injections the user has ALREADY LOGGED in the Protocol Log. It is
// NOT a dosing tool: there is no scenario input, no ester/frequency picker, no comparison, and no
// recommendation. It reads logged events and draws each ester's first-order decay using a
// published release half-life. Half-lives are approximate literature figures for the ester's
// release-limited (flip-flop) kinetics; real serum levels depend on absorption and the individual.
// Every ester carries a source + confidence; unknown compounds are skipped, never fabricated.
export const PK_ESTERS = [
  // label = picker/display name · match = substrings resolved from the logged compound · hl in days.
  // conf: moderate = human PK exists; low = sparse/cited; v.low = no compound-specific human PK,
  // half-life INFERRED from the ester class only. Nothing here is a target or a recommendation.
  { label:'Test enanthate',      match:['test enanth','test e'],                    name:'Testosterone enanthate',              hl:4.5, conf:'moderate', src:'~4.5 d terminal (lit. 4.5\u20137 d)' },
  { label:'Test cypionate',      match:['test cyp'],                                name:'Testosterone cypionate',              hl:5.0, conf:'moderate', src:'~5 d (lit. 5\u20138 d)' },
  { label:'Test propionate',     match:['test prop'],                               name:'Testosterone propionate',             hl:0.8, conf:'moderate', src:'~0.8 d' },
  { label:'Test undecanoate',    match:['test undec','nebido'],                     name:'Testosterone undecanoate',            hl:20,  conf:'moderate', src:'~20\u201334 d (oil depot)' },
  { label:'Primobolan',          match:['primobolan','methenolone','primo'],        name:'Methenolone enanthate (Primobolan)',  hl:6.0, conf:'low',      src:'sparse; ~5\u20137 d cited' },
  { label:'Masteron enanthate',  match:['masteron enanth','drostanolone enanth','mast e'], name:'Drostanolone enanthate',       hl:5.0, conf:'low',      src:'~5 d cited (sparse)' },
  { label:'Masteron propionate', match:['masteron prop','drostanolone prop','mast p'],     name:'Drostanolone propionate',      hl:1.5, conf:'low',      src:'~1\u20132 d cited' },
  { label:'NPP',                 match:['npp','nandrolone phenyl'],                 name:'Nandrolone phenylpropionate (NPP)',   hl:2.7, conf:'low',      src:'~2.7 d cited' },
  { label:'Deca',                match:['deca','nandrolone dec'],                   name:'Nandrolone decanoate (Deca)',         hl:7.0, conf:'low',      src:'~6\u201312 d cited' },
  { label:'Tren acetate',        match:['tren acet','tren a'],                      name:'Trenbolone acetate',                  hl:1.0, conf:'low',      src:'~1 d (short ester)' },
  { label:'Tren enanthate',      match:['tren enanth','tren e'],                    name:'Trenbolone enanthate',                hl:5.0, conf:'low',      src:'~5 d cited (sparse)' },
  { label:'Tren hex',            match:['tren hex','parabolan','hexahydro'],        name:'Trenbolone hexahydrobenzylcarbonate', hl:7.0, conf:'v.low',    src:'sparse/anecdotal; long ester' },
  { label:'EQ (boldenone)',      match:['boldenone','equipoise','eq '],             name:'Boldenone undecylenate (EQ)',         hl:14,  conf:'low',      src:'~14 d (long undecylenate ester)' },
  { label:'DHB cypionate',       match:['dhb cyp','1-test cyp','dihydroboldenone cyp'], name:'DHB / 1-testosterone cypionate',   hl:5.0, conf:'v.low',    src:'NO human PK \u2014 inferred from cypionate ester' },
  { label:'DHB propionate',      match:['dhb prop','1-test prop','dihydroboldenone prop'], name:'DHB / 1-testosterone propionate', hl:1.5, conf:'v.low',    src:'NO human PK \u2014 inferred from propionate ester' },
];

export function pkFor(compound){ const c=String(compound||'').toLowerCase(); return PK_ESTERS.find(p=>p.match.some(m=>c.includes(m)))||null; }

export const DECAY_COLORS = ['#c4ff00','#4a9eff','#ff8c00','#00e87a','#ff4444','#a479e2','#f691b2','#43d692'];
