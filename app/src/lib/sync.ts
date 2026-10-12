// Split out of App.jsx in Phase 2. Behaviour unchanged.
import type { SessionLog, Synced } from '../types';

export function mergeLogs(a: SessionLog[] | null | undefined, b: SessionLog[] | null | undefined): SessionLog[] {
  const map = new Map(); const order = [];
  // Key on the immutable id (falling back to a deterministic legacy id). Keying on
  // date|sessionId meant an edit that changed either field created a phantom second
  // workout instead of being recognised as the same record.
  for (const l of [...(a || []), ...(b || [])]) {
    if (!l || !l.date) continue;
    const key = l.id || legacyId(l, 'wk');
    if (map.has(key)) { map.set(key, pickNewer(map.get(key), l)); }
    else { map.set(key, l); order.push(key); }
  }
  const out = order.map(k => map.get(k));
  out.sort((x, y) => x.date < y.date ? 1 : -1);
  return out.slice(0, 600);   // must match the setLogs cap, or a sync would silently truncate history back to 200
}

// LAST-WRITE-WINS merge. The old implementation was first-wins over [...local, ...cloud],
// so the LOCAL copy always beat the cloud copy even when the cloud held a newer edit —
// the newer edit was discarded and then overwritten on the next push. Records now carry
// updatedAt (stamped on save); when both sides hold the same key we keep the newer one.
// ---- Record identity & sync schema ----
// Records need an IMMUTABLE id. Merge keys previously embedded the mutable value
// (date|weight, date|sys|dia ...), so editing a value produced a DIFFERENT key,
// pickNewer() never fired, and both the old and edited record survived as duplicates.
export function newId(): string {
  try { if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID(); } catch(e){}
  return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// Deterministic legacy id so the SAME pre-migration record gets the SAME id on every
// device — otherwise migration itself would create cross-device duplicates.
export function legacyId(e: Record<string, any>, kind: string, index?: number): string {
  // Must distinguish MULTIPLE same-day records (two BP readings on one date previously
  // hashed identically and mergeByKey then discarded one as a duplicate version).
  const parts = [kind, e.date||'', e.site||'', e.compound||'', e.modality||'', e.sessionId||'',
                 e.sys ?? '', e.dia ?? '', e.pulse ?? '', e.value ?? '', e.weight ?? '',
                 e.dose ?? '', e.minutes ?? '', e.calories ?? '', index != null ? index : ''];
  const s = parts.join('|');
  let hh = 5381;
  for (let i = 0; i < s.length; i++) { hh = ((hh << 5) + hh + s.charCodeAt(i)) >>> 0; }
  return 'lg_' + kind + '_' + hh.toString(36);
}

/** Ids for records saved before the app had ids, built from CONTENT, not list position.
 *  Position differs between devices, so one record could get two ids: duplicates after a merge,
 *  and deletes that didn't carry across. Identical records (two equal BP readings on one day) are
 *  numbered in order, so they stay separate: the first gets the plain content id, later ones #1, #2...
 *  Records that already have an id are left alone. */
export function contentIds(arr: any[], kind: string): (string | null)[] {
  const seen = new Map<string, number>();
  return arr.map(e => {
    if (!e || e.id) return null;
    const base = legacyId(e, kind);
    const n = seen.get(base) || 0; seen.set(base, n + 1);
    return n === 0 ? base : legacyId(e, kind, n);
  });
}

export function ensureIds<T extends Synced>(arr: T[] | null | undefined, kind: string): T[] | null | undefined {
  if (!Array.isArray(arr)) return arr;
  let changed = false;
  const ids = contentIds(arr, kind);
  const out = arr.map((e, i) => {
    if (!e || e.id) return e;
    changed = true;
    return { ...e, id: ids[i] as string, updatedAt: e.updatedAt != null ? e.updatedAt : 0 };
  });
  return changed ? out : arr;
}

export function live<T extends Synced>(arr: T[] | null | undefined): T[] { return (arr || []).filter(e => e && !e.deletedAt); }

export function pruneTombstones<T extends Synced>(arr: T[] | null | undefined, days?: number): T[] {   // default 90 days
  const cut = Date.now() - (days || 90) * 86400000;
  return (arr || []).filter(e => !e.deletedAt || e.deletedAt > cut);
}

export function pickNewer<T extends Synced>(x: T, y: T): T {
  const tx = x && x.updatedAt != null ? x.updatedAt : 0;
  const ty = y && y.updatedAt != null ? y.updatedAt : 0;
  return ty > tx ? y : x;   // ties keep the incumbent (local) — deterministic
}

export function mergeByKey<T extends Synced>(a: T[] | null | undefined, b: T[] | null | undefined, keyFn: (e: T) => string): T[] {
  const map = new Map(); const order = [];
  for (const e of [...(a || []), ...(b || [])]) {
    if (!e) continue;
    const k = keyFn(e);
    if (map.has(k)) { map.set(k, pickNewer(map.get(k), e)); }
    else { map.set(k, e); order.push(k); }
  }
  // Tombstones (deletedAt) are RETAINED here so they propagate to other devices via the
  // synced snapshot; the UI filters them out via live(). A newer tombstone beats an older
  // live record through pickNewer(), which is what stops a delete being resurrected.
  const out = order.map(k => map.get(k));
  out.sort((x, y) => (x.date || '') < (y.date || '') ? 1 : -1);
  return out;
}

/** Marks matching records deleted (a tombstone the cloud merge can see) instead of removing them. */
export function tombstoneWhere<T extends Synced>(arr: T[], kind: string, predicate: (e: T) => boolean, now: number = Date.now()): T[] {
  const ids = contentIds(arr, kind);   // same ids ensureIds would give, so the delete matches across devices
  return arr.map((e, i) => {
    if (!predicate(e)) return e;
    const id = e.id || (ids[i] as string);
    return { ...e, id, deletedAt: now, updatedAt: now };
  });
}
