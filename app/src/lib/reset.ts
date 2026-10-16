// Reset after repeated misses (Oct 2026, agreed). If your first working set (the top set, where there's a
// set plan) misses the bottom of its rep range at the same load in two sessions running, the engine stops
// saying "keep weight" and prescribes a lower load to rebuild from: 5% lower if you missed by one rep,
// 10% lower otherwise, rounded down to your weight jump and always at least one jump lower.
// Rep counts only; reps in reserve never gate progression. Deloads are handled before this is reached.

export interface HistSet { weight: number; reps: number; }
export interface HistSession { sets: readonly HistSet[]; }
export interface ResetTarget { weight: number; reps: number; note: string; reset: true; first?: undefined; }

export function resetFromHistory(
  hist: readonly HistSession[] | null | undefined,
  ex: { rMin: number; setPlan?: readonly { rMin: number }[] | null },
  incr: number,
): ResetTarget | null {
  if (!hist || hist.length < 2) return null;
  const [a, b] = hist;                       // newest first
  if (!a || !b || !a.sets.length || !b.sets.length) return null;
  const rMin = ex.setPlan && ex.setPlan[0] ? ex.setPlan[0].rMin : ex.rMin;
  if (!(rMin > 0)) return null;
  const top = (s: HistSession) => Math.max(...s.sets.map(x => x.weight));
  const topA = top(a), topB = top(b);
  if (!(topA > 0) || Math.abs(topA - topB) > 1e-9) return null;              // same load both times
  const fa = a.sets[0], fb = b.sets[0];
  if (!fa || !fb || fa.weight !== topA || fb.weight !== topB) return null;     // first set is the top set
  if (!(fa.reps < rMin && fb.reps < rMin)) return null;                        // missed both times
  const shortBy = Math.max(rMin - fa.reps, rMin - fb.reps);
  const pct = shortBy <= 1 ? 0.05 : 0.10;
  const step = incr > 0 ? incr : 2.5;
  // Rounding the cut down to your jump always lands at least one jump below the old load.
  const w = Math.round(Math.floor((topA * (1 - pct)) / step + 1e-9) * step * 100) / 100;
  if (!(w > 0)) return null;
  return {
    weight: w, reps: rMin, reset: true,
    note: `Reset: ${fb.reps} and ${fa.reps} reps at ${topA} kg, under ${rMin} twice. Drop ${Math.round(pct * 100)}% to ${w} kg and rebuild.`,
  };
}
