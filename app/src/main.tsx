// Entry point. boot.js runs first (icon, manifest, build stamp, service worker), then the app.
import './boot.js';
// Fonts are bundled with the app (not loaded from Google) so they work offline.
import '@fontsource/barlow/400.css';
import '@fontsource/barlow/500.css';
import '@fontsource/barlow/600.css';
import '@fontsource/barlow/700.css';
import '@fontsource/barlow/800.css';
import '@fontsource/barlow-semi-condensed/500.css';
import '@fontsource/barlow-semi-condensed/600.css';
import '@fontsource/barlow-semi-condensed/700.css';
import './styles.css';
import './theme.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App, RootBoundary } from './App';
import { installErrorReporting } from './lib/errorReport';
import { loadEquipment } from './lib/equipment';

// Report crashes outside the screen boundaries too (event handlers, timers, failed promises).
installErrorReporting();
// Your weight jumps per exercise, before any target is worked out.
loadEquipment();

createRoot(document.getElementById('root')).render(
  <RootBoundary>
    <App />
  </RootBoundary>
);
