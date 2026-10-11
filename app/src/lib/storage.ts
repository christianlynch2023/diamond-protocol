// Split out of App.jsx in Phase 2. Behaviour unchanged.



export const LS = {
  get: (k: string): string | null => { try { return localStorage.getItem(k); } catch(e) { return null; } },
  // Returns true on success. Does NOT swallow the error silently — callers that care
  // (usePersistentState, photo saving) need to know when a write actually failed.
  set: (k: string, v: string): boolean => { try { localStorage.setItem(k, v); return true; } catch(e) { return false; } },
  del: (k: string): void => { try { localStorage.removeItem(k); } catch(e) {} },
  // Safe JSON read. A corrupt/truncated value must NOT throw here — these run inside useState
  // initialisers, and a throw during first render white-screens the whole app (the error
  // boundary cannot catch it). Nor should it be silently discarded. Instead quarantine the bad
  // value under `${k}__corrupt` (recoverable for diagnosis) and return the fallback, so one
  // damaged key degrades to a default rather than taking everything down.
  getJSON: <T,>(k: string, fallback: T): T => {
    let raw: string | null = null;
    try { raw = localStorage.getItem(k); } catch(e) { return fallback; }
    if (raw == null) return fallback;
    try { return JSON.parse(raw); }
    catch(e) {
      try { localStorage.setItem(k + '__corrupt', raw); localStorage.removeItem(k); } catch(_) {}
      return fallback;
    }
  },
};


// Photo store (IndexedDB). Check-in photos are base64 and were exhausting the ~5MB localStorage
// quota; IndexedDB holds far more. All ops are promise-based and fail soft. Crucially, a photo is
// never removed from localStorage until its IDB write is confirmed (see the hydration effect), so
// a failed IDB can never lose an image — the base64 remains as a fallback.
export const IDB = (() => {
  let dbP: Promise<IDBDatabase> | null = null;
  const open = () => {
    if (dbP) return dbP;
    dbP = new Promise<IDBDatabase>((res, rej) => {
      try {
        const r = indexedDB.open('diamond-photos', 1);
        r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('photos')) r.result.createObjectStore('photos'); };
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      } catch(e) { rej(e); }
    });
    return dbP;
  };
  const run = (mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest | undefined) => open().then((db: IDBDatabase) => new Promise<any>((res, rej) => {
    let out: any; const t = db.transaction('photos', mode); const st = t.objectStore('photos');
    const rq = fn(st); if (rq) rq.onsuccess = () => { out = rq.result; };
    t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
  }));
  return {
    get: (k: IDBValidKey) => run('readonly',  s => s.get(k)),
    put: (k: IDBValidKey, v: unknown) => run('readwrite', s => s.put(v, k)),
    del: (k: IDBValidKey) => run('readwrite', s => s.delete(k)),
  };
})();
