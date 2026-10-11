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
  rir?: number | null;
  [extra: string]: unknown;
}

export interface ExerciseLog {
  id: string;
  origId?: string;          // set when the exercise was swapped for an alternative
  name: string;
  sets: SetEntry[];
  pain?: number;
  [extra: string]: unknown;
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
  [extra: string]: unknown;
}

export interface BodyMetric extends Synced {
  date: string;
  weight?: number | null;
  bodyFat?: number | null;
  [extra: string]: unknown;
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
  [extra: string]: unknown;
}

export interface WhoopWorkout {
  start: string | null;
  end: string | null;
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
