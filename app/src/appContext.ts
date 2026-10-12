// App owns all state (via useAppState) and shares it with the screens through this context.
// AppState is inferred from useAppState's return value, so every screen gets exact types for
// everything it reads with useApp(), with no hand-maintained type list.
import { createContext, useContext } from 'react';
import type { AppState } from './state/useAppState';

export const AppCtx = createContext<AppState | null>(null);
export const useApp = (): AppState => useContext(AppCtx) as AppState;
