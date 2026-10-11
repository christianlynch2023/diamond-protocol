import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Strict Content Security Policy for the BUILT app. With Babel and the CDN gone, scripts can
// only come from this site and the app can only talk to this site. It is added at build time
// only, because the dev server needs an inline script for hot reload.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "connect-src 'self'",
  "manifest-src 'self' blob:",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const cspPlugin = () => ({
  name: 'diamond-csp',
  apply: 'build',
  transformIndexHtml(html) {
    return html.replace('<meta charset="UTF-8">',
      `<meta charset="UTF-8">\n  <meta http-equiv="Content-Security-Policy" content="${CSP}">`);
  },
});

// Build stamp, e.g. 2026-10-09T1432. Set automatically on every build, so the Tools screen and
// the cache-bust in boot.js can never show a stale value again.
const BUILD_ID = new Date().toISOString().slice(0, 16).replace(':', '');

export default defineConfig({
  plugins: [react(), cspPlugin()],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  build: { sourcemap: true },
});
