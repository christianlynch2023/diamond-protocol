// Netlify function: starts WHOOP login. Logic: ../lib/whoop.ts
import { createWhoopAuth } from '../lib/whoop';
export const handler = createWhoopAuth({ env: process.env });
