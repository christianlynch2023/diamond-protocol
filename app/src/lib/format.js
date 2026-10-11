// Split out of App.jsx in Phase 2. Behaviour unchanged.

export const fmt = s => { const m=Math.floor(s/60), sc=s%60; return m>0 ? `${m}:${String(sc).padStart(2,'0')}` : `${s}s`; };

export const fmtDate = iso => new Date(iso).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'}) + ' ' + new Date(iso).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});

export const fmtShort = iso => new Date(iso).toLocaleDateString('en-GB',{day:'numeric',month:'short'});

// Freshness of a dated reading, for the Today tiles: how old it is, and whether it's stale
// enough that it shouldn't be treated as "current". Prevents old weight/BP/glucose values
// being presented as if they were measured today.
export const freshInfo = (iso, staleDays) => {
  const t = iso ? new Date(iso).getTime() : NaN;
  if (isNaN(t)) return null;
  const d = Math.floor((Date.now() - t) / 86400000);
  return { d, label: d <= 0 ? 'today' : d === 1 ? 'yesterday' : d + 'd ago', stale: d > staleDays };
};


// Strict numeric parser for user input at write boundaries.
// Returns a finite number, or null if the input is empty/blank/non-numeric/non-finite.
// Guards against: "." "-" "  " "1.2.3" "Infinity" "5e" and comma-decimal locales ("5,5").
// Returns null (not 0) so callers reject the entry rather than silently store a wrong value.
export const parseNum = (raw) => {
  if (raw == null) return null;
  const s = String(raw).trim().replace(',', '.');
  if (s === '') return null;
  const n = Number(s);              // Number() is stricter than parseFloat: "1.2.3"->NaN, "5-"->NaN
  return Number.isFinite(n) ? n : null;
};

export const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
