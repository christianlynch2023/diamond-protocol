// Entry point. boot.js runs first (icon, manifest, build stamp, service worker), then the app.
import './boot.js';
import './styles.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App, RootBoundary } from './App.jsx';

createRoot(document.getElementById('root')).render(
  <RootBoundary>
    <App />
  </RootBoundary>
);
