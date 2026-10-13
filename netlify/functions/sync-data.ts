// Netlify function: wires cloud sync to Netlify Blobs. Logic: ../lib/sync.ts
import { getStore } from '@netlify/blobs';
import { createSyncHandler, type BlobStore } from '../lib/sync';
export const handler = createSyncHandler({ getStore: (o) => getStore(o) as unknown as BlobStore, env: process.env });
