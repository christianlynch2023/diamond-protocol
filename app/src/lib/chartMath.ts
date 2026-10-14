// Small chart helpers shared by the round 2 screens: sparklines, range bars and personal normal ranges.
// Pure functions only, so they are tested directly (tests/ui.test.ts).

export interface SparkPath { d: string; cx: number; cy: number; }

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const r1 = (k: number): number => Math.round(k * 10) / 10;

/** SVG path for a sparkline. Gaps (null, undefined, NaN) are skipped but keep their place on the x axis.
 *  Returns null when there are fewer than two real points, so callers show nothing rather than a dot. */
export function sparkPath(values: ReadonlyArray<number | null | undefined>, width: number, height: number, pad = 3): SparkPath | null {
  const pts: { i: number; v: number }[] = [];
  values.forEach((v, i) => { if (isNum(v)) pts.push({ i, v }); });
  const last = pts[pts.length - 1];
  if (pts.length < 2 || !last) return null;
  let lo = Infinity, hi = -Infinity;
  for (const p of pts) { if (p.v < lo) lo = p.v; if (p.v > hi) hi = p.v; }
  const n = values.length;
  const x = (i: number): number => pad + i * (width - 2 * pad) / (n - 1);
  const y = (v: number): number => hi === lo ? height / 2 : height - pad - (v - lo) / (hi - lo) * (height - 2 * pad);
  const d = pts.map((p, k) => `${k ? 'L' : 'M'}${r1(x(p.i))} ${r1(y(p.v))}`).join(' ');
  return { d, cx: r1(x(last.i)), cy: r1(y(last.v)) };
}

/** Position of a value along a min..max scale, as a percentage clamped to 0..100. */
export function pctOf(value: number, min: number, max: number): number {
  if (!(max > min) || !isNum(value)) return 50;
  return Math.max(0, Math.min(100, (value - min) / (max - min) * 100));
}

/** Linear-interpolated percentile (q from 0 to 1). Null when there is no usable value. */
export function percentile(values: ReadonlyArray<number | null | undefined>, q: number): number | null {
  const s = values.filter(isNum).slice().sort((a, b) => a - b);
  if (!s.length) return null;
  const pos = (s.length - 1) * Math.max(0, Math.min(1, q));
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  const a = s[lo], b = s[hi];
  if (a === undefined || b === undefined) return null;
  return a + (b - a) * (pos - lo);
}

/** A personal "normal" band: the middle half (25th to 75th percentile) of recent readings.
 *  Needs at least minCount readings, otherwise null so the screen can say there isn't enough data yet. */
export function normalRange(values: ReadonlyArray<number | null | undefined>, minCount = 7): { lo: number; hi: number } | null {
  const v = values.filter(isNum);
  if (v.length < minCount) return null;
  const lo = percentile(v, 0.25), hi = percentile(v, 0.75);
  return lo === null || hi === null ? null : { lo, hi };
}

/** Axis label precision that matches the span on screen: a 6 kg bodyweight axis reads 85.4 / 88.4 / 91.4
 *  (rounding to 85 / 88 / 91 hid real tenths), while a 2,000 kcal axis stays in whole numbers. */
export function tickLabel(v: number, span: number): string {
  if (!isNum(v)) return '';
  const a = Math.abs(span);
  const dp = a >= 20 ? 0 : a >= 2 ? 1 : 2;
  return (Math.round(v * 10 ** dp) / 10 ** dp).toFixed(dp);
}
