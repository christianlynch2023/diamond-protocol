// Phase 2b: App owns all state and shares it with the screens through this context.
// Screens read what they need with useApp(); behaviour is unchanged from when they were inline.
import { createContext, useContext } from 'react';

export const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);
