# Diamond Protocol: code map

`src/main.jsx` starts the app. `src/boot.js` handles icon, manifest, build stamp and service worker.

| File | What lives there |
|---|---|
| `src/App.jsx` | Owns all state, effects and the live workout flow (session, workout, complete). Shares state with the screens via `AppCtx` |
| `src/appContext.js` | `AppCtx` and `useApp()`: how screens read App's state |
| `src/views/TodayView.jsx` | Today tab |
| `src/views/ProgramView.jsx` | Program tab |
| `src/views/ProgressView.jsx` | Progress tab |
| `src/views/HistoryView.jsx` | History tab |
| `src/views/BodyView.jsx` | Body tab (weight, measurements, bloods, BP, glucose, photos) |
| `src/views/MealsView.jsx` | Meals tab |
| `src/views/PrivacyView.jsx` | Privacy tab |
| `src/views/ToolsView.jsx` | Tools tab |
| `src/components/charts.jsx` | SVGChart, SVGBars, SVGScatter, Sparkline, RecoveryFuelStrip |
| `src/components/RootBoundary.jsx` | Crash screen shown if the app errors |
| `src/data/programme.js` | Sessions, exercises, weekly RIR plan, deload weeks, muscle map, phases |
| `src/data/mealPlan.js` | The cut meal plan |
| `src/lib/storage.js` | localStorage helpers, IndexedDB photo store, usePersistentState |
| `src/lib/sync.js` | IDs, tombstones and merge rules used by cloud sync and import |
| `src/lib/training.js` | e1RM, bodyweight, volume, plates, warm-ups, progression targets |
| `src/lib/sessions.js` | Session analytics: volume, stalls, pain, durations, retention, deload rebound |
| `src/lib/associations.js` | Recovery, time-of-day and alcohol associations (detrended) |
| `src/lib/readiness.js` | Readiness and deload-readiness |
| `src/lib/whoop.js` | WHOOP parsing and history merge |
| `src/lib/health.js` | BP and glucose categories, measurement sites, exposure model |
| `src/lib/bloods.js` | Blood marker names, ranges and flags |
| `src/lib/format.js` | Dates and number formatting |
| `src/lib/audio.js` | Rest-timer chime and vibration |

Modules only import "downwards" (no cycles). `data/programme.js` exports `setDeloadNow`,
which App calls each render; imported variables are read-only, so never assign `_deloadNow` directly.

Screens get state from `useApp()`. To give a screen something new, add it to `__appCtx` just above
App's `return`. Screens must never assign to App variables; they call the setters instead.
