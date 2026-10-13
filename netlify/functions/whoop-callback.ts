// Netlify function: finishes WHOOP login. Logic: ../lib/whoop.ts
import { createWhoopCallback } from '../lib/whoop';
export const handler = createWhoopCallback({ fetch: (u, i) => fetch(u, i), env: process.env });
