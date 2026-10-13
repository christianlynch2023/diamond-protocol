// Netlify function: WHOOP recovery, sleep, cycles and workouts, with back-fill. Logic: ../lib/whoop.ts
import { createWhoopData } from '../lib/whoop';
export const handler = createWhoopData({ fetch: (u, i) => fetch(u, i) });
