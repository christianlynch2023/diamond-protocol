# Diamond Protocol: Vite rebuild, Phase 1

Same app, now built by Vite. Nothing about how it behaves should change.

- `src/App.jsx` the whole app (was the text/babel script in index.html). React is imported, not loaded from a CDN.
- `src/main.jsx` renders the app.
- `src/boot.js` icon, manifest, build stamp, service worker registration (was the plain script in index.html).
- `src/styles.css` all styles (was the style block).
- `public/sw.js` service worker, cache bumped to diamond-v3, CDN entries removed.
- `vite.config.js` adds the strict security policy to the built app and stamps the build id automatically.
- `../netlify.toml` tells Netlify to build this folder and publish app/dist.

Commands (run inside /app): `npm install`, `npm run build`, `npm run dev` (preview while editing).
Netlify functions are unchanged and are not called by `npm run dev`; test them on the branch deploy.
