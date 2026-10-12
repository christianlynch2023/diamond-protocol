// Shapes of the data Diamond Protocol stores and passes around.
// Optional fields are optional on purpose: older records can lack fields added later,
// and the code is written to cope with that. Types only; nothing here runs.

/** Anything that cloud sync merges: id for matching, updatedAt to pick the newer copy,
 *  deletedAt marks a tombstone so a delete propagates instead of being resurrected. */
export interface Synced {
  id?: string;
  updatedAt?: number;
  deletedAt?: number | null;
}

export interface SetEntry {
  weight: number;
  reps: number;
  rir?: number | string | null;   // a number, or the text '4+' from the RIR picker
  [extra: string]: any;
}

export interface ExerciseLog {
  id: string;
  origId?: string;          // set when the exercise was swapped for an alternative
  name: string;
  sets: SetEntry[];
  pain?: number;
  [extra: string]: any;
}

export interface SessionLog extends Synced {
  date: string;             // ISO timestamp of when the session was saved
  sessionId: string;        // 'upperA' | 'lowerA' | 'upperB' | 'lowerB'
  sessionName?: string;
  week: number;
  block?: number;
  duration?: number;        // minutes, wall clock
  restMin?: number;
  activeMin?: number;
  deload?: boolean;
  hv?: boolean;
  exercises: ExerciseLog[];
  [extra: string]: any;
}

export interface BodyMetric extends Synced {
  date: string;
  weight?: number | null;
  bodyFat?: number | null;
  [extra: string]: any;
}

export type BloodFlag = 'ok' | 'high' | 'low' | 'watch';

export interface BloodMarker {
  k: string;                // marker name as the lab wrote it
  disp: string;             // value as text, e.g. "47.9" or "<0.3"
  unit?: string;
  ref?: string;             // reference range as text, e.g. "8.6-29.0", "<5.0", ">1.0"
  flag?: BloodFlag | string;
}

export interface BloodGroup { g: string; m: BloodMarker[]; }

export interface BloodPanel extends Synced {
  date: string;             // draw date, YYYY-MM-DD
  label?: string;
  groups: BloodGroup[];
  note?: string;
  gaps?: string[];
}

/** One day of WHOOP data, merged field by field from recovery, sleep and cycle feeds. */
export interface WhoopDay {
  date: string;             // local YYYY-MM-DD
  recovery?: number | null;
  hrv?: number | null;
  rhr?: number | null;
  spo2?: number | null;
  skinTemp?: number | null;
  sleepHrs?: number | null;
  deepHrs?: number | null;
  remHrs?: number | null;
  sleepPerf?: number | null;
  sleepEff?: number | null;
  sleepConsistency?: number | null;
  respRate?: number | null;
  sleepDebt?: number | null;
  strain?: number | null;
  dayCal?: number | null;
  [extra: string]: any;
}

export interface WhoopWorkout {
  id?: string | number;     // present on workouts stored by older versions
  start: string;            // workouts without a start are filtered out by the parser
  end: string;              // falls back to start when WHOOP gives no end
  strain: number | null;
  avgHr: number | null;
  maxHr: number | null;
  kcal: number | null;
  z2Min: number | null;
  zoneMin: { z1: number; z2: number; z3: number; z4: number; z5: number } | null;
  sport: string | null;
  distanceKm: number | null;
  altitudeGainM: number | null;
}

/** Returns the user's bodyweight nearest to a date. */
export type BwResolver = (dateStr?: string) => number;

// ---- Programme definitions (data/programme.ts) ----
export interface WeekRule { rir: string; rirN: number; i: boolean; }
export interface Phase { weeks: number[]; name: string; color: string; }
export interface SetPlanStep { label: string; sets: number; rMin: number; rMax: number; pct: number; }
export interface IntensifierDef { kind: string; label: string; desc: string; }

export interface ExerciseDef {
  id: string;
  name: string;
  sets: number;
  tempo: string;
  struct?: string;
  setPlan?: SetPlanStep[] | null;
  rMin: number;
  rMax: number;
  rirMin: number;
  rirMax: number;
  rest: number;
  handle: string;
  cues: string[];
  avoidFail: boolean;
  int: IntensifierDef | null;
  orm: boolean;
  avoidReason?: string;
  origId?: string;          // set on a swapped-in alternative
  opt?: boolean;            // optional exercise: not counted as unfinished at session end (none set it today)
}

export interface SessionDef {
  id: string; name: string; focus: string; day: string; time: string; maxInt: number;
  exercises: ExerciseDef[];
}

export interface MuscleDef { name: string; min: number; max: number; optional?: boolean; }
/** Primary muscle and secondary muscle(s) an exercise trains. */
export interface MuscleMap { p: string; s?: string | string[]; }
export interface AltExercise { name: string; rMin: number; rMax: number; rirMin?: number; }

/** An intensifier recorded on a set. */
export interface Intensifier {
  kind: 'partials' | 'failure' | 'myo';
  partialReps?: number;
  failure?: boolean;
  myoReps?: number[];
}

/** The progression engine's verdict for an exercise. */
export interface ProgRec { type: 'inc' | 'beat' | 'keep' | 'first'; msg: string; wt?: number; }

/** The subset of today's parsed WHOOP data that readiness reads. */
export interface WhoopToday {
  cachedAt?: number;
  recovery?: number | null;
  respRate?: number | null;
  sleep?: number | null;
  sleepDebt?: number | null;
  [extra: string]: any;
}

export interface DeloadReadiness {
  level: string;
  msg: string;
  rRec?: number | null;
  bRec?: number | null;
  rHrv?: number | null;
  bHrv?: number | null;
  [extra: string]: any;
}

export interface BPReading extends Synced { date: string; sys: number; dia: number; pulse?: number | null; [extra: string]: any; }

/** One exercise from one session, tagged with a bucket (recovery band, time of day, alcohol). */
export interface PerfRow { pid: string; e1rm: number; bucket: string; sid: string; date: string; }

export interface ContextEntry extends Synced { date: string; units?: number; tags?: string[]; [extra: string]: any; }

// ---- Stored records, as created by the app (state/useAppState.tsx) ----
// Known fields are typed; anything older or rarer passes through the index signature.
export interface GlucoseReading extends Synced { date: string; value: number; [extra: string]: any; }
export interface CardioEntry extends Synced { date: string; modality: string; minutes: number; note?: string; [extra: string]: any; }
export interface Measurement extends Synced { date: string; site: string; value: number; [extra: string]: any; }
export interface ProtocolEntry extends Synced { date: string; compound: string; dose: number; unit: string; notes?: string; [extra: string]: any; }
export interface NutritionEntry extends Synced { date: string; calories?: number; protein?: number; carbs?: number; fat?: number; [extra: string]: any; }
export interface VitalsEntry extends Synced { date: string; temp?: number | null; wood?: any; [extra: string]: any; }
export interface CheckinPhoto { id: number; date: string; pose: string; week?: number; phase?: string; weight?: number | null; waist?: number | null; img?: any; [extra: string]: any; }
export interface ActiveTarget { cals: number; protein: number; fat: number; carb: number; tdee?: number; manual?: boolean; setAt?: number; [extra: string]: any; }
export interface BloodFormRow { k: string; v: string; unit: string; ref: string; g: string; flag: string; }
export interface BloodForm { editId: string | null; date: string; provider: string; note: string; rows: BloodFormRow[]; err: string; gaps?: string[] | null; }
/** A swapped-in exercise, keyed by the id of the exercise it replaces. */
export interface SubstituteEntry { id: string; name: string; rMin?: number; rMax?: number; setPlan?: null; rirMin?: number; }
