// Just the Node.js pieces the functions use, so the functions type-check without installing @types/node.
declare const process: { env: Record<string, string | undefined> };
declare module 'crypto' {
  export function createHash(algorithm: string): { update(data: string): { digest(encoding: 'hex'): string } };
  export function randomBytes(size: number): { toString(encoding: 'hex'): string };
}
