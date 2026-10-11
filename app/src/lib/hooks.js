// React hooks used by App. Kept as JavaScript until the screens move to TypeScript (Phase 3b),
// because they need React's type definitions. Behaviour unchanged.
import { useState, useEffect } from 'react';
import { LS } from './storage';

// ---------------------------------------------------------------------------
// LAYER 2: Persistence abstraction.
// Replaces the hand-written `useState(() => JSON.parse(LS.get(k)))` + write-through
// `useEffect` boilerplate (previously duplicated ~19 times). One choke point for
// JSON (de)serialisation, error handling, and quota failures — and the single place
// to add IndexedDB migration or schema versioning later without touching call sites.
// ---------------------------------------------------------------------------
export function usePersistentState(key, initial) {
  const [value, setValue] = useState(() => LS.getJSON(key, initial));
  useEffect(() => {
    // LS.set returns false on failure (quota, private mode). Previously the error was
    // swallowed inside LS.set so this could never be detected — writes silently no-op'd
    // and data vanished on reload with no warning.
    const ok = LS.set(key, JSON.stringify(value));
    if (!ok) {
      console.warn('Persistence FAILED for "' + key + '" — storage full or blocked.');
      try { window.dispatchEvent(new CustomEvent('dp-storage-fail', { detail: { key } })); } catch(_) {}
    }
  }, [key, value]);
  return [value, setValue];
}
