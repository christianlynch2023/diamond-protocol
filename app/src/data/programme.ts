// Split out of App.jsx in Phase 2. Behaviour unchanged.
import type { AltExercise, ExerciseDef, Intensifier, MuscleDef, MuscleMap, Phase, SessionDef, WeekRule } from '../types';

export const PHASES: Phase[] = [
  {weeks:[1,2,3],name:"Accumulation 1",color:"normal"},
  {weeks:[4],name:"Deload",color:"deload"},
  {weeks:[5,6,7],name:"Accumulation 2",color:"normal"},
  {weeks:[8],name:"Deload",color:"deload"},
  {weeks:[9,10,11],name:"Peak Hypertrophy",color:"peak"},
  {weeks:[12],name:"Resensitise",color:"deload"},
];

export const WR: Record<number, WeekRule> = {
  1:{rir:"2 RIR",rirN:2,i:false},2:{rir:"1-2 RIR",rirN:2,i:false},3:{rir:"1 RIR",rirN:1,i:false},
  4:{rir:"3-4 RIR",rirN:4,i:false},5:{rir:"2 RIR",rirN:2,i:false},6:{rir:"1-2 RIR",rirN:2,i:false},
  7:{rir:"1 RIR",rirN:1,i:false},8:{rir:"3-4 RIR",rirN:4,i:false},9:{rir:"0-1 RIR",rirN:1,i:true},
  10:{rir:"0-1 RIR",rirN:0,i:true},11:{rir:"0-1 RIR",rirN:0,i:true},12:{rir:"3-4 RIR",rirN:4,i:false},
};

export const DLW = new Set([4,8,12]);

export let _deloadNow: boolean | null = null;
// App sets this each render. Imported bindings are read-only, so writes go through a setter.
export function setDeloadNow(v: boolean | null) { _deloadNow = v; }
 // resolved deload state for the current week; App writes it each render
// Single resolver for the week's RIR prescription. WR is keyed by week number alone, so a
// scheduled deload week trained through would still hand back "3-4 RIR" and default every
// logged set to an easy value. When a deload week is trained through, mirror the block's own
// logic (week 2 / week 6) at 1-2 RIR rather than inventing a new intensity peak at 1 RIR —
// four escalating weeks with no let-up is a fatigue trap, especially in a deficit.
export const TRAINED_THROUGH_WR: WeekRule = { rir: "1-2 RIR", rirN: 2, i: false };


// Default logged RIR for a specific exercise. The week schedule sets the session-wide
// target, but an exercise's own rirMin is a floor, not a suggestion: avoidFail lifts
// declare 1-2 RIR because failure there is a tendon risk, and the global 0 RIR of weeks
// 10-11 must not override it. Taking the max respects both (deload's 3-4 RIR still wins).
export const rirDefaultFor = (ex: { rirMin?: number } | null | undefined, weekRirN: number): number => {
  const floor = (ex && typeof ex.rirMin === 'number') ? ex.rirMin : 0;
  return Math.max(weekRirN, floor);
};

export const effWR = (week: number, dl: boolean = (_deloadNow == null ? DLW.has(week) : _deloadNow)): WeekRule => {
  const base = WR[week] || WR[1];
  return (DLW.has(week) && !dl) ? TRAINED_THROUGH_WR : base;
};

export const SESSIONS: Record<string, SessionDef> = {
  upperA:{id:"upperA",name:"Upper 1",focus:"Horizontal Push & Back Thickness",day:"Saturday",time:"80-90 min",maxInt:2,exercises:[
    {id:"ua1",name:"RO-T8 Flat Press",sets:4,tempo:"3-1-1",struct:"1 top set 6-8, then back-offs 8-10",setPlan:[{label:"Top set",sets:1,rMin:6,rMax:8,pct:1.0},{label:"Back-off",sets:3,rMin:8,rMax:10,pct:0.90}],rMin:6,rMax:10,rirMin:1,rirMax:2,rest:180,handle:"RO-T8",cues:["Flat bench, handles at mid-chest","Neutral/semi-pronated grip","Elbows 30-45 not flared","Deep stretch, press to just short of lockout"],avoidFail:false,int:null,orm:true},
    {id:"ua2",name:"Kaz Chest-Supported Row",sets:4,tempo:"3-1-1",struct:"1 top set 8-10, then back-offs 10-12",setPlan:[{label:"Top set",sets:1,rMin:8,rMax:10,pct:1.0},{label:"Back-off",sets:3,rMin:10,rMax:12,pct:0.90}],rMin:8,rMax:12,rirMin:1,rirMax:2,rest:150,handle:"Small KAZ",cues:["Chest firmly on pad","Drive elbows back and slightly out","Pull to lower ribs, squeeze","Stop 1 RIR - no jerking"],avoidFail:true,avoidReason:"Stop at 1 RIR - no form breakdown",int:null,orm:false},
    {id:"ua3",name:"RO-T8 Incline Press",sets:2,tempo:"3-1-1",rMin:8,rMax:12,rirMin:1,rirMax:1,rest:150,handle:"RO-T8",cues:["Bench 30 deg","Elbows 30-45","Controlled, second chest angle"],avoidFail:false,int:null,orm:true},
    {id:"ua4",name:"Short Bar Row (wide)",sets:3,tempo:"3-0-1",rMin:10,rMax:12,rirMin:1,rirMax:1,rest:120,handle:"RO-T8 short bar",cues:["Wide grip short bar","Elbows flared 60-70","Pull to sternum","Chest-supported if possible"],avoidFail:false,int:null,orm:false},
    {id:"ua5",name:"Cable Lateral Raise",sets:4,tempo:"2-1-2",rMin:12,rMax:20,rirMin:0,rirMax:2,rest:90,handle:"Small KAZ",cues:["Cable behind body, lean away","Lead with elbow, hand below elbow","Scapular plane, no shrug"],avoidFail:false,int:{label:"PARTIALS",desc:"+10-15 lengthened partials on final set",kind:'partials'},orm:false},
    {id:"ua8",name:"Rear Delt Cable Flye",sets:3,tempo:"2-0-1",rMin:15,rMax:25,rirMin:0,rirMax:1,rest:90,handle:"Small KAZ",cues:["Cables crossed, arms near-straight","Sweep to inverted V","Lead with pinky, no traps"],avoidFail:false,int:null,orm:false},
    {id:"ua6",name:"Cable Pushdown",sets:2,tempo:"2-1-2",rMin:10,rMax:15,rirMin:1,rirMax:1,rest:90,handle:"Rope/bar",cues:["Elbows pinned to sides","Full lockout, controlled return","No leaning over bar"],avoidFail:false,int:null,orm:false},
    {id:"ua9",name:"Incline DB Curl",sets:3,tempo:"3-1-1",rMin:10,rMax:12,rirMin:1,rirMax:2,rest:90,handle:"DB",cues:["Bench 60, arms hang behind torso","Elbow stays back — lengthened biceps","Slow eccentric, no swing"],avoidFail:false,int:null,orm:false},
    {id:"ua7",name:"Standing Calf Raise",sets:3,tempo:"3-1-1",rMin:10,rMax:15,rirMin:1,rirMax:1,rest:90,handle:"Machine",cues:["Full stretch, heel below platform","Hard 1-sec pause","Full contraction, no bounce"],avoidFail:false,int:null,orm:false}
  ]},
  lowerA:{id:"lowerA",name:"Lower",focus:"Complete Legs",day:"Sunday",time:"80-90 min",maxInt:2,exercises:[
    {id:"la1",name:"Leg Press",sets:4,tempo:"3-0-1",struct:"1 top set 6-8, back-offs 8-10, final 10-15",setPlan:[{label:"Top set",sets:1,rMin:6,rMax:8,pct:1.0},{label:"Back-off",sets:2,rMin:8,rMax:10,pct:0.90},{label:"Final",sets:1,rMin:10,rMax:15,pct:0.80}],rMin:6,rMax:10,rirMin:1,rirMax:1,rest:180,handle:"Machine",cues:["Feet mid-platform, shoulder-width, toes out 20","Knees track over toes","Descend to just before pelvic tuck","No true failure - knees complain -> feet higher"],avoidFail:true,avoidReason:"No true failure - stable but heavy",int:null,orm:true},
    {id:"la3",name:"Romanian Deadlift",sets:3,tempo:"3-1-1",rMin:8,rMax:10,rirMin:1,rirMax:1,rest:180,handle:"Short bar",cues:["Soft knees, hips travel back not down","Bar drags close to legs","Spine dead neutral","Never to failure"],avoidFail:true,avoidReason:"Connective tissue - stay 1-2 RIR",int:null,orm:true},
    {id:"la5",name:"Leg Extension",sets:3,tempo:"2-1-2",rMin:12,rMax:20,rirMin:0,rirMax:1,rest:90,handle:"Machine",cues:["Back pad upright, quad at length","1-sec pause at full extension","Failure/partials OK"],avoidFail:false,int:{label:"FAILURE",desc:"Final set to failure or partials - spine safe",kind:'failure'},orm:false},
    {id:"la6",name:"Seated Leg Curl",sets:3,tempo:"2-1-2",rMin:10,rMax:15,rirMin:0,rirMax:1,rest:90,handle:"Machine",cues:["Seated for lengthened ham bias","Full stretch at top","Controlled curl, squeeze"],avoidFail:false,int:{label:"PARTIALS",desc:"+10 stretch partials final set",kind:'partials'},orm:false},
    {id:"la8",name:"Bulgarian Split Squat",sets:2,tempo:"3-0-1",rMin:8,rMax:12,rirMin:1,rirMax:2,rest:120,handle:"DB/bodyweight",cues:["Rear foot elevated, long stride","Slight forward torso lean","No failure - balance degrades"],avoidFail:true,avoidReason:"Balance under fatigue",int:null,orm:false},
    {id:"la10",name:"Hip Thrust",sets:2,tempo:"3-1-1",rMin:8,rMax:12,rirMin:1,rirMax:2,rest:120,handle:"Barbell/machine",cues:["Full hip extension","Squeeze at top","Chin tucked"],avoidFail:false,int:null,orm:false},
    {id:"la7",name:"Standing Calf Raise",sets:5,tempo:"3-1-1",rMin:8,rMax:15,rirMin:1,rirMax:1,rest:90,handle:"Machine",cues:["Full stretch, hard pause","Full plantarflexion top"],avoidFail:false,int:null,orm:false},
    {id:"la9",name:"Cable Crunch",sets:3,tempo:"2-1-2",rMin:12,rMax:20,rirMin:1,rirMax:1,rest:60,handle:"Rope",cues:["Kneel, rope by ears","Flex spine - ribs to pelvis","Not a hip hinge"],avoidFail:false,int:null,orm:false},
    {id:"laob",name:"Cable Oblique Crunch",sets:3,tempo:"2-1-2",rMin:12,rMax:20,rirMin:0,rirMax:1,rest:60,handle:"Rope",cues:["Kneel side-on to the stack, rope in both hands","Crunch DOWN and ACROSS toward the opposite hip","Lateral flexion - drive the rib toward the pelvis, no twisting through the spine","Full set one side, then switch"],avoidFail:false,int:null,orm:false}
  ]},
  upperB:{id:"upperB",name:"Upper 2",focus:"Incline / Vertical & Lat Width",day:"Tuesday",time:"80-90 min",maxInt:2,exercises:[
    {id:"ub2",name:"RO-T8 Incline Press",sets:4,tempo:"3-1-1",struct:"1 top set 6-8, then back-offs 8-10",setPlan:[{label:"Top set",sets:1,rMin:6,rMax:8,pct:1.0},{label:"Back-off",sets:3,rMin:8,rMax:10,pct:0.90}],rMin:6,rMax:10,rirMin:1,rirMax:2,rest:180,handle:"RO-T8",cues:["Bench 30-45","Handles at lower-chest line","Elbows tucked 30-45","Drive up and slightly back"],avoidFail:false,int:null,orm:true},
    {id:"ub1",name:"Weighted Pull-Up",sets:4,tempo:"3-1-1",struct:"1 top set 6-8, then back-offs 8-10",setPlan:[{label:"Top set",sets:1,rMin:6,rMax:8,pct:1.0},{label:"Back-off",sets:3,rMin:8,rMax:10,pct:0.90}],rMin:6,rMax:10,rirMin:1,rirMax:2,rest:180,handle:"Belt/bodyweight",cues:["Grip just outside shoulder-width","Dead hang, depress scapula first","Lead with chest to bar","Full stretch bottom"],avoidFail:true,avoidReason:"Elbow/biceps tendon fatigue",int:null,orm:true},
    {id:"ub3",name:"Seated Cable Press",sets:3,tempo:"3-1-1",rMin:8,rMax:12,rirMin:0,rirMax:1,rest:150,handle:"RO-T8",cues:["Bench upright 70-80","Press forward and converge at top","Controlled stretch, no rest-pause"],avoidFail:false,int:null,orm:false},
    {id:"ub9",name:"Single-Arm Lat Pulldown",sets:4,tempo:"3-0-1",rMin:8,rMax:12,rirMin:1,rirMax:2,rest:120,handle:"Small KAZ",cues:["Half-kneel, slight lean back","Reach tall at top","Drive elbow down and into hip","Feel lat not biceps"],avoidFail:false,int:{label:"PARTIALS",desc:"+8-10 lengthened partials final set",kind:'partials'},orm:false},
    {id:"ub8",name:"Chest-Supported Row",sets:3,tempo:"3-1-1",rMin:8,rMax:12,rirMin:1,rirMax:2,rest:150,handle:"RO-T8",cues:["Chest on pad whole set","Elbows back at 45","Pull to lower ribs, no heaving"],avoidFail:true,avoidReason:"Stop at 1 RIR",int:null,orm:false},
    {id:"ub4",name:"Cable Lateral Raise",sets:5,tempo:"2-1-2",rMin:12,rMax:20,rirMin:0,rirMax:2,rest:90,handle:"Small KAZ",cues:["Cable behind, lean away","Lead with elbow","Scapular plane, no shrug"],avoidFail:false,int:{label:"MYO-REPS",desc:"Activation set, then 3-5 mini-sets",kind:'myo'},orm:false},
    {id:"ub5",name:"Rear Delt Cable Flye",sets:3,tempo:"2-0-1",rMin:15,rMax:20,rirMin:0,rirMax:1,rest:90,handle:"Small KAZ",cues:["Sweep out and slightly back","Lead with pinky, no traps"],avoidFail:false,int:null,orm:false},
    {id:"ub7",name:"Incline DB Curl",sets:3,tempo:"3-1-1",rMin:10,rMax:12,rirMin:1,rirMax:2,rest:90,handle:"DB",cues:["Bench 60, arms hang behind torso","Elbow stays back","Slow eccentric, lengthened stretch"],avoidFail:false,int:null,orm:false},
    {id:"ubpal",name:"Pallof Press",sets:3,tempo:"2-1-2",rMin:10,rMax:15,rirMin:1,rirMax:2,rest:60,handle:"D-handle",cues:["Stand side-on to the cable at mid-chest height","Press the handle straight out from the sternum and RESIST the pull toward the stack","This is anti-rotation - the core stops you twisting, no reps through the spine","Hold 1-2s at full extension; full set each side"],avoidFail:false,int:null,orm:false}
  ]},
  lowerB:{id:"lowerB",name:"Upper 3",focus:"Delt-Led, Lengthened Chest & Arms",day:"Thursday",time:"75-85 min",maxInt:2,exercises:[
    {id:"lb2",name:"Cable Lateral Raise",sets:5,tempo:"2-1-2",rMin:12,rMax:20,rirMin:0,rirMax:2,rest:90,handle:"Small KAZ",cues:["Done first fresh - priority set","Cable behind, lean away","Lead with elbow, scapular plane","Strict, full range"],avoidFail:false,int:{label:"PARTIALS",desc:"+10-15 lengthened partials final set",kind:'partials'},orm:false},
    {id:"lb5",name:"Seated Cable Flye",sets:3,tempo:"2-1-2",rMin:12,rMax:15,rirMin:0,rirMax:1,rest:90,handle:"Small KAZ",cues:["Bench upright, handles wide","Constant slight elbow bend","Deep stretch, hands to chin line","Partials/failure last set"],avoidFail:false,int:{label:"PARTIALS / FAILURE",desc:"Lengthened partials or controlled failure final set",kind:'partials_failure'},orm:false},
    {id:"lb3",name:"Lat Cross Extension",sets:4,tempo:"2-1-2",rMin:15,rMax:20,rirMin:0,rirMax:1,rest:90,handle:"Small KAZ",cues:["High cable, arm across body","Arm fairly straight","Drive hand to opposite hip","Low fatigue, high stretch"],avoidFail:false,int:{label:"PARTIALS",desc:"+10 short partials",kind:'partials'},orm:false},
    {id:"lb4",name:"Rear Delt Cable Flye",sets:4,tempo:"2-0-1",rMin:15,rMax:20,rirMin:0,rirMax:1,rest:90,handle:"Small KAZ",cues:["Fast turnaround at stretch","No pause bleeding tension","Lead with pinky, no traps"],avoidFail:false,int:null,orm:false},
    {id:"lb6",name:"Overhead Cable Triceps Ext",sets:3,tempo:"3-1-1",rMin:10,rMax:15,rirMin:1,rirMax:1,rest:90,handle:"Rope/single",cues:["Face away, rope overhead","Elbows forward and pinned","Full stretch behind head, long-head bias"],avoidFail:false,int:null,orm:false},
    {id:"lb7",name:"Cable Curl",sets:3,tempo:"3-1-1",rMin:10,rMax:14,rirMin:1,rirMax:1,rest:90,handle:"Small KAZ",cues:["Cable low, elbows pinned","Full stretch bottom, no swing","3-sec eccentric"],avoidFail:false,int:null,orm:false},
    {id:"lbquad",name:"Leg Press",sets:3,tempo:"3-0-1",rMin:10,rMax:15,rirMin:1,rirMax:1,rest:120,handle:"Machine",cues:["Second weekly quad exposure — frequency, not more sets on one day","Feet slightly higher and narrower than Lower A for a quad bias","Lighter than Lower A: this is a repeat stimulus, not a second heavy day","Spine supported throughout — stop short of pelvic tuck"],avoidFail:true,avoidReason:"Second exposure — leave it short of failure so Lower A stays the heavy day",int:null,orm:false},
    {id:"lbham",name:"Seated Leg Curl",sets:3,tempo:"2-1-2",rMin:10,rMax:15,rirMin:0,rirMax:1,rest:90,handle:"Machine",cues:["Seated for lengthened hamstring bias","Full stretch at top, no bouncing out","Controlled curl, hard squeeze","Second weekly hamstring exposure — frequency, not just volume"],avoidFail:false,int:{label:"PARTIALS",desc:"+10 stretch partials final set",kind:'partials'},orm:false},
    {id:"lbglt",name:"Hip Thrust",sets:3,tempo:"3-1-1",rMin:8,rMax:12,rirMin:1,rirMax:2,rest:120,handle:"Barbell/machine",cues:["Full hip extension, squeeze hard at top","Chin tucked, ribs down","Posterior pelvic tilt at lockout","Second weekly glute exposure"],avoidFail:false,int:null,orm:false},
    {id:"lbtri",name:"Cable Pushdown",sets:2,tempo:"2-1-2",rMin:10,rMax:15,rirMin:0,rirMax:1,rest:90,handle:"Rope/bar",cues:["Elbows pinned to sides","Full lockout, controlled return","Lateral/medial head bias to pair with the overhead work"],avoidFail:false,int:{label:"PARTIALS",desc:"+8-10 short partials final set",kind:'partials'},orm:false},
    {id:"lb8",name:"Cable Crunch",sets:3,tempo:"2-1-2",rMin:12,rMax:20,rirMin:1,rirMax:1,rest:60,handle:"Rope",cues:["Kneel, rope by ears","Flex spine deliberately","Ribs to pelvis, not hip hinge"],avoidFail:false,int:null,orm:false},
    {id:"lbleg",name:"Hanging Leg Raise",sets:3,tempo:"2-1-2",rMin:8,rMax:15,rirMin:1,rirMax:2,rest:75,handle:"Bar/straps",cues:["Dead hang, shoulders active (depress scapula)","Raise knees/legs by CURLING the pelvis up - not just hip flexion","Control the descent, no swinging","Knees bent = easier, straight legs = harder"],avoidFail:false,int:null,orm:false}
  ]}
};
;

export const ALL_EX = Object.values(SESSIONS).flatMap(s => s.exercises.map(e => ({id:e.id,name:e.name,session:s.name})));

// Map every slot id to its full exercise definition (carries rirMin / avoidFail).
// Logged exercises only store {id,name,sets}, so anything needing an exercise's RIR floor
// after the fact (e.g. RIR-drift analysis, P0.3) resolves it through here.
export const EX_DEF_BY_ID = Object.values(SESSIONS).reduce<Record<string, ExerciseDef>>((m, s) => { for (const e of s.exercises) m[e.id] = e; return m; }, {});

export const DEF_INTS: Record<string, Set<string>> = {
  upperA: new Set(["ua5"]),
  lowerA: new Set(["la5","la6"]),
  upperB: new Set(["ub9","ub4"]),
  lowerB: new Set(["lb2","lb5"]),
};


// Build the intensifier result object from the capture inputs, per the exercise's kind.
// Returns null if nothing meaningful was entered. partialReps / myoReps live OUTSIDE set.reps
// so every rep-based analytic (epley, tonnage, getProgRec) ignores them automatically.
export function buildIntensifier(kind: string | null | undefined, { partials, myoStr, fail }: { partials?: string; myoStr?: string; fail?: boolean }): Intensifier | null {
  if (!kind) return null;
  if (kind === 'partials') { const v = parseInt(partials as string) || 0; return v > 0 ? { kind:'partials', partialReps:v } : null; }
  if (kind === 'failure')  { return fail ? { kind:'failure' } : null; }
  if (kind === 'myo')      {
    // Split on commas/whitespace (NOT every non-digit — that turned "-3" into "3"). Reject
    // negatives, zero and implausible clusters so junk input can't be stored as reps.
    const a = String(myoStr||'').split(/[,\s]+/).map(t=>parseInt(t,10)).filter(n=>Number.isFinite(n) && n>0 && n<=30);
    return a.length ? { kind:'myo', myoReps:a } : null;
  }
  if (kind === 'partials_failure') {
    // If BOTH were entered, keep both — partials as its own field, failure as a flag on the
    // same event — instead of silently dropping the failure.
    const v = parseInt(partials as string) || 0;
    if (v > 0) return fail ? { kind:'partials', partialReps:v, failure:true } : { kind:'partials', partialReps:v };
    return fail ? { kind:'failure' } : null;
  }
  return null;
}

export function intBadge(it: Intensifier | null | undefined): string | null {
  if (!it) return null;
  if (it.kind === 'partials') return '+' + it.partialReps + 'p' + (it.failure ? '\u00b7F' : '');
  if (it.kind === 'failure')  return 'F';
  if (it.kind === 'myo')      return 'myo ' + (it.myoReps||[]).join('/');
  return '\u00b7';
}


export const MUSCLES: Record<string, MuscleDef> = {
  chest:    {name:'Chest',      min:10, max:18},
  lats:     {name:'Lats',min:10, max:18},
  midBack:  {name:'Mid/Upper Back',min:8, max:16},
  sideDelt: {name:'Side Delts', min:12, max:20},
  rearDelt: {name:'Rear Delts', min:8,  max:16},
  biceps:   {name:'Biceps',     min:8,  max:16},
  triceps:  {name:'Triceps',    min:8,  max:16},
  quads:    {name:'Quads',      min:8,  max:16},
  hams:     {name:'Hamstrings', min:6,  max:14},
  glutes:   {name:'Glutes',     min:6,  max:14},
  calves:   {name:'Calves',     min:8,  max:16},
  abs:      {name:'Abs / Core', min:6,  max:16, optional:true},
  obliques: {name:'Obliques', min:4,  max:12, optional:true},
  adductors:{name:'Adductors',  min:4,  max:12, optional:true},
};

export const EX_MUSCLE: Record<string, MuscleMap> = {
  ua1:{p:'chest',s:'triceps'}, ua2:{p:'midBack',s:'biceps'}, ua3:{p:'chest',s:'triceps'},
  ua4:{p:'midBack',s:['rearDelt','biceps']}, ua5:{p:'sideDelt'}, ua6:{p:'triceps'}, ua7:{p:'calves'}, ua8:{p:'rearDelt'},
  la1:{p:'quads',s:['glutes','adductors']},
  la2:{p:'quads',s:['glutes','adductors']}, // la2 retired from the programme but kept here so historical logs keep their muscle attribution
  la3:{p:'hams',s:'glutes'}, la4:{p:'quads',s:['glutes','adductors']},
  la5:{p:'quads'}, la6:{p:'hams'},
  la10:{p:'glutes',s:'hams'}, la7:{p:'calves'},
  ub1:{p:'lats',s:'biceps'}, ub2:{p:'chest',s:['sideDelt','triceps']}, ub3:{p:'chest'},
  ub4:{p:'sideDelt'}, ub5:{p:'rearDelt'}, ub6:{p:'lats'}, ub7:{p:'biceps'},
  lb1:{p:'glutes',s:['quads','adductors']}, lb2:{p:'sideDelt'}, lb3:{p:'lats'},
  lb4:{p:'rearDelt'}, lb5:{p:'chest'}, lb6:{p:'triceps'}, lb7:{p:'biceps'},

  ua9:{p:'biceps'}, ub9:{p:'lats',s:'biceps'},
  lbquad:{p:'quads',s:['glutes','adductors']}, lbham:{p:'hams'}, lbglt:{p:'glutes',s:'hams'}, lbtri:{p:'triceps'},
  ub8:{p:'midBack',s:'biceps'}, la8:{p:'quads',s:['glutes']}, la9:{p:'abs'}, laob:{p:'obliques',s:'abs'}, ubpal:{p:'obliques',s:'abs'}, lb8:{p:'abs'}, lbleg:{p:'abs'}, lb9:{p:'rearDelt'},
};


// INVARIANT: every programmed slot must resolve to at least one muscle in EX_MUSCLE.
// This is the guard that would have caught the RDL/la4 mapping being commented out —
// a slot with no mapping contributes zero volume silently, with no error. Fail loud instead.
// Runs here, AFTER both SESSIONS/ALL_EX and EX_MUSCLE are defined (const TDZ).
(() => {
  try {
    const unmapped = ALL_EX.filter(e => { const m = EX_MUSCLE[e.id]; return !m || !m.p; });
    if (unmapped.length) {
      const msg = 'Diamond volume invariant FAILED — unmapped slot(s): ' +
        unmapped.map(e => e.id + ' (' + e.name + ' / ' + e.session + ')').join(', ');
      try { console.error(msg); } catch(_) {}
      // Surface it in dev without bricking a live session: a red banner, not a thrown error.
      if (typeof document !== 'undefined') {
        const paint = () => {
          const b = document.createElement('div');
          b.textContent = msg;
          b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#ff4444;color:#000;font:700 12px/1.4 monospace;padding:8px 12px;text-align:center';
          document.body && document.body.appendChild(b);
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', paint);
        else paint();
      }
    }
  } catch(_) { /* never let the guard itself brick the app */ }
})();


export const getPhase = (w: number): Phase => PHASES.find(p => p.weeks.includes(w)) || PHASES[0];

export const RAMP_EX = new Set(['ua3','ua4','ua5','ub3','ub4','ub5']);
   // accessories only — ub1 (weighted pull-up) removed: ramping a heavy compound contradicts the ramp's purpose and stacks elbow/biceps tendon load
export const RAMP_P1 = new Set([2,6]);

export const RAMP_P2 = new Set([3,7]);

export const HIGHVOL_EX = new Set(['ua5','ub4','ua8','ub5','ub7','ua6','ub8','la6','lb5','la7','lb7','ua7','lb6']);

export const getEffSets = (ex: { id: string; sets: number }, week: number, hv: boolean, dl: boolean = (_deloadNow == null ? DLW.has(week) : _deloadNow)): number => {
  let s = ex.sets;
  // floor, not round: rounding 3->2 and 5->3 made the advertised 50% deload land nearer 60%.
  if (dl) return Math.max(1, Math.floor(s * 0.5));
  if (hv && HIGHVOL_EX.has(ex.id)) s += 1;
  if (RAMP_EX.has(ex.id)) { if (RAMP_P2.has(week)) s += 2; else if (RAMP_P1.has(week)) s += 1; }
  return s;
};


export const ORM_IDS = (() => { const s=new Set<string>(); for(const k in SESSIONS) for(const e of SESSIONS[k].exercises) if(e.orm) s.add(e.id); return s; })();


export const ALT_BY_MUSCLE: Record<string, AltExercise[]> = {
  // Each alternative carries its OWN rep range so a swap no longer inherits the base lift's
  // scheme (e.g. a leg extension inheriting a heavy 6-8 press top-set). rirMin marks connective-
  // tissue lifts that should stay shy of failure regardless of the week's target.
  chest:[{name:'Machine Chest Press',rMin:8,rMax:12},{name:'Pec Deck',rMin:12,rMax:15},{name:'Dumbbell Press',rMin:8,rMax:12},{name:'Cable Press',rMin:10,rMax:15}],
  lats:[{name:'Lat Pulldown',rMin:8,rMax:12},{name:'Pull-Up',rMin:6,rMax:10},{name:'Straight-Arm Pulldown',rMin:12,rMax:15}],
  midBack:[{name:'Chest-Supported Row',rMin:8,rMax:12},{name:'Cable Row',rMin:10,rMax:12},{name:'Machine Row',rMin:10,rMax:12}],
  sideDelt:[{name:'DB Lateral Raise',rMin:12,rMax:20},{name:'Machine Lateral Raise',rMin:12,rMax:20},{name:'Cable Y-Raise',rMin:12,rMax:20}],
  rearDelt:[{name:'Reverse Pec Deck',rMin:12,rMax:20},{name:'Face Pull',rMin:12,rMax:20},{name:'DB Rear Delt Flye',rMin:12,rMax:20}],
  biceps:[{name:'Cable Curl',rMin:10,rMax:15},{name:'DB Curl',rMin:8,rMax:12},{name:'Preacher Curl',rMin:8,rMax:12},{name:'Hammer Curl',rMin:8,rMax:12}],
  triceps:[{name:'Cable Pushdown',rMin:10,rMax:15},{name:'Overhead Cable Ext',rMin:10,rMax:15},{name:'Dip Machine',rMin:8,rMax:12},{name:'Skull Crusher',rMin:8,rMax:12,rirMin:1}],
  quads:[{name:'Leg Press',rMin:10,rMax:15},{name:'Hack Squat',rMin:8,rMax:12},{name:'Leg Extension',rMin:12,rMax:20},{name:'Smith Squat',rMin:8,rMax:12}],
  hams:[{name:'Lying Leg Curl',rMin:10,rMax:15},{name:'Seated Leg Curl',rMin:10,rMax:15},{name:'Romanian Deadlift',rMin:6,rMax:10,rirMin:1},{name:'Nordic Curl',rMin:5,rMax:10,rirMin:1}],
  glutes:[{name:'Hip Thrust',rMin:8,rMax:15},{name:'Glute Leg Press',rMin:10,rMax:15},{name:'Cable Kickback',rMin:12,rMax:20},{name:'Bulgarian Split Squat',rMin:8,rMax:12}],
  calves:[{name:'Standing Calf Raise',rMin:10,rMax:15},{name:'Seated Calf Raise',rMin:12,rMax:20},{name:'Leg Press Calf Raise',rMin:12,rMax:20}],
  abs:[{name:'Cable Crunch',rMin:12,rMax:20},{name:'Hanging Leg Raise',rMin:8,rMax:15},{name:'Ab Machine',rMin:12,rMax:20}],
  adductors:[{name:'Adductor Machine',rMin:12,rMax:20},{name:'Copenhagen Plank',rMin:8,rMax:12,rirMin:1}],
};

export const CORE_EX: Record<string, Set<string>> = {
  upperA: new Set(['ua1','ua2','ua3']),
  lowerA: new Set(['la1','la3']),
  upperB: new Set(['ub2','ub1','ub9']),
  lowerB: new Set(['lb2','lb5']),
};
