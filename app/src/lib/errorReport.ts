// Error reporting (client). Sends a short crash summary to the log-error function so failures are seen
// rather than silently swallowed. At most MAX_PER_SESSION reports per app session, duplicates skipped,
// and it can never throw or block the app. Only message, stack, screen, build file and page path are sent.
export const MAX_PER_SESSION = 5;

export interface ErrorContext { view?: string; kind?: string; }

const messageOf = (err: unknown): string => {
  if (err instanceof Error) return err.message || err.name || 'Error';
  if (typeof err === 'string') return err;
  try { return JSON.stringify(err).slice(0, 300); } catch { return 'Unknown error'; }
};

/** Build a reporter around a sender. Returns true when a report was sent. */
export function makeReporter(send: (payload: string) => void, env: { build?: () => string; page?: () => string } = {}) {
  const seen = new Set<string>();
  let count = 0;
  return (err: unknown, ctx: ErrorContext = {}): boolean => {
    try {
      const message = messageOf(err).slice(0, 300);
      if (!message) return false;
      const key = (ctx.view || '') + '|' + message;
      if (seen.has(key) || count >= MAX_PER_SESSION) return false;
      seen.add(key); count++;
      const stack = err instanceof Error && typeof err.stack === 'string' ? err.stack.slice(0, 2000) : '';
      send(JSON.stringify({ message, stack, view: ctx.view || '', kind: ctx.kind || 'render', build: env.build ? env.build() : '', page: env.page ? env.page() : '' }));
      return true;
    } catch { return false; }
  };
}

const ENDPOINT = '/.netlify/functions/log-error';
const buildFile = (): string => {
  try { const src = Array.from(document.scripts).map(s => s.src).find(u => /\/assets\/index-[\w-]+\.js/.test(u)); return src ? (src.split('/').pop() || '') : ''; } catch { return ''; }
};
export const reportError = makeReporter((payload) => {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function' && navigator.sendBeacon(ENDPOINT, new Blob([payload], { type: 'application/json' }))) return;
    void fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(() => {});
  } catch { /* never let reporting break the app */ }
}, { build: buildFile, page: () => { try { return location.pathname; } catch { return ''; } } });

/** Catch errors outside React's boundaries too (event handlers, timers, failed promises). */
export function installErrorReporting(): void {
  try {
    window.addEventListener('error', e => { reportError(e.error || e.message, { kind: 'window' }); });
    window.addEventListener('unhandledrejection', e => { reportError(e.reason, { kind: 'promise' }); });
  } catch { /* ignore */ }
}
