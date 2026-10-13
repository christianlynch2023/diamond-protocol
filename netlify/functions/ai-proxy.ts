// Netlify function: wires the AI proxy to the real fetch and environment. Logic: ../lib/ai.ts
import { createAiProxy } from '../lib/ai';
export const handler = createAiProxy({ fetch: (u, i) => fetch(u, i), env: process.env });
