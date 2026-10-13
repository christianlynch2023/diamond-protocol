// Netlify function: refreshes WHOOP tokens. Logic: ../lib/whoop.ts
import { createWhoopRefresh } from '../lib/whoop';
export const handler = createWhoopRefresh({ fetch: (u, i) => fetch(u, i), env: process.env });
