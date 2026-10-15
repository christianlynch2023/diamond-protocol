// Equipment settings and plate maths (pure, tested). Your real weight jump per exercise, what kind of
// kit it is, and for plate-loaded lifts the bar or sled weight already counted in the weight you log.
export type Kind = 'stack' | 'plates' | 'dumbbells' | 'bodyweight';
export interface EquipSetting { inc?: number; kind?: Kind; base?: number; }
export type EquipMap = Record<string, EquipSetting>;
export const KINDS: readonly Kind[] = ['stack', 'plates', 'dumbbells', 'bodyweight'];
export const PLATES: readonly number[] = [25, 20, 15, 10, 5, 2.5, 1.25];

const num = (v: unknown, lo: number, hi: number): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? Math.round(v * 100) / 100 : undefined;

/** Keeps only sensible values: a jump of 0.25 to 50 kg, a known kind, a base of 0 to 200 kg. */
export function sanitize(raw: unknown): EquipMap {
  const out: EquipMap = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!id || !v || typeof v !== 'object' || Array.isArray(v)) continue;
    const s = v as Record<string, unknown>;
    const e: EquipSetting = {};
    const inc = num(s.inc, 0.25, 50); if (inc !== undefined) e.inc = inc;
    if (typeof s.kind === 'string' && (KINDS as readonly string[]).includes(s.kind)) e.kind = s.kind as Kind;
    const base = num(s.base, 0, 200); if (base !== undefined) e.base = base;
    if (Object.keys(e).length) out[id] = e;
  }
  return out;
}

/** The jumps the progression engine should use, by exercise id. */
export function incOverrides(m: EquipMap): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, e] of Object.entries(m)) if (e.inc !== undefined) out[id] = e.inc;
  return out;
}

/** A starting guess for the kind of kit, from the exercise name. */
export function guessKind(name: string): Kind {
  const n = name.toLowerCase();
  if (/\bdb\b|dumbbell/.test(n)) return 'dumbbells';
  if (/pull-up|chin|\bdip|hanging|push-up/.test(n)) return 'bodyweight';
  if (/leg press|hack|t-bar|smith|barbell|\brdl\b|squat|plate|ro-t8|deadlift|hip thrust|bench press/.test(n)) return 'plates';
  return 'stack';
}

/** Plates for each side: (total - base) / 2, heaviest first. `leftover` is any weight per side the
 *  plate set can't make. Null when the total is below the base or not a usable number. */
export function platesPerSide(total: number, base = 0, plates: readonly number[] = PLATES): { side: number[]; leftover: number } | null {
  if (!Number.isFinite(total) || !Number.isFinite(base) || total < base || total <= 0) return null;
  let left = Math.round(((total - base) / 2) * 1000) / 1000;
  const side: number[] = [];
  for (const p of [...plates].sort((a, b) => b - a)) {
    while (left + 1e-9 >= p) { side.push(p); left = Math.round((left - p) * 1000) / 1000; }
  }
  return { side, leftover: Math.round(left * 100) / 100 };
}
