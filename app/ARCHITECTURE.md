# Diamond Protocol: code map

`src/main.jsx` starts the app. `src/boot.js` handles icon, manifest, build stamp and service worker.

| File | What lives there |
|---|---|
| `src/App.jsx` | Owns all state, effects, timers, modals and overlays. Shares state with every screen via `AppCtx` |
| `src/appContext.js` | `AppCtx` and `useApp()`: how screens read App's state |
| `src/views/TodayView.jsx` | Today tab |
| `src/views/ProgramView.jsx` | Program tab |
| `src/views/ProgressView.jsx` | Progress tab |
| `src/views/HistoryView.jsx` | History tab |
| `src/views/BodyView.jsx` | Body tab (weight, measurements, bloods, BP, glucose, photos) |
| `src/views/MealsView.jsx` | Meals tab |
| `src/views/PrivacyView.jsx` | Privacy tab |
| `src/views/ToolsView.jsx` | Tools tab |
| `src/views/SessionView.jsx` | Session preview before you start |
| `src/views/WorkoutView.jsx` | The live workout: logging sets, swap, skip, end |
| `src/views/CompleteView.jsx` | Session complete screen |
| `src/components/charts.jsx` | SVGChart, SVGBars, SVGScatter, Sparkline, RecoveryFuelStrip |
| `src/components/RootBoundary.jsx` | Crash screen shown if the app errors |
| `src/data/programme.ts` | Sessions, exercises, weekly RIR plan, deload weeks, muscle map, phases |
| `src/data/mealPlan.ts` | The cut meal plan |
| `src/lib/storage.ts` | localStorage helpers and the IndexedDB photo store |
| `src/lib/hooks.js` | `usePersistentState` (stays JavaScript until the screens get React types) |
| `src/types.ts` | Shapes of stored data: SessionLog, SetEntry, BloodPanel, WhoopDay, BodyMetric |
| `src/lib/sync.ts` | IDs, tombstones and merge rules used by cloud sync and import |
| `src/lib/training.ts` | e1RM, bodyweight, volume, plates, warm-ups, progression targets |
| `src/lib/sessions.ts` | Session analytics: volume, stalls, pain, durations, retention, deload rebound |
| `src/lib/associations.ts` | Recovery, time-of-day and alcohol associations (detrended) |
| `src/lib/readiness.ts` | Readiness and deload-readiness |
| `src/lib/whoop.ts` | WHOOP parsing and history merge |
| `src/lib/health.ts` | BP and glucose categories, measurement sites, exposure model |
| `src/lib/bloods.ts` | Blood marker names, ranges and flags |
| `src/lib/format.ts` | Dates and number formatting |
| `src/lib/audio.ts` | Rest-timer chime and vibration |

Modules only import "downwards" (no cycles). `data/programme.js` exports `setDeloadNow`,
which App calls each render; imported variables are read-only, so never assign `_deloadNow` directly.

Screens get state from `useApp()`. To give a screen something new, add it to `__appCtx` just above
App's `return`. Screens must never assign to App variables; they call the setters instead.

## TypeScript
`lib/` and `data/` are TypeScript under **full strict mode** (Phase 3b); screens are still JavaScript.
`npm run build` runs the type check first (`tsc -p .`), so a type error stops the build and nothing
broken reaches Netlify. `npm run typecheck` runs the check on its own.

Domain types live in `src/types.ts`. Raw WHOOP API data is deliberately typed `any` at the parsing
boundary; everything after parsing is typed.

Phase 3b changed types only, with one exception: a one-word fix in `lib/associations.ts`
(`x.sdate` -> `x.date`). Strict mode found that the recovery-vs-performance scatter read a field that
was never set, so it had always received zero points and never rendered.
