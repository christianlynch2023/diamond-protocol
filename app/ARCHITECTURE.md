# Diamond Protocol: code map

`src/main.tsx` starts the app. `src/boot.js` handles icon, manifest, build stamp and service worker.

| File | What lives there |
|---|---|
| `src/App.tsx` | Thin shell: calls `useAppState()`, renders the current screen, modals, overlays and nav |
| `src/state/useAppState.tsx` | All of the app's state, effects, timers and handlers, as one hook. Its return type *is* `AppState` |
| `src/appContext.ts` | `AppCtx` and `useApp()`: how screens read the app's state, fully typed as `AppState` |
| `src/views/TodayView.tsx` | Today tab |
| `src/views/ProgramView.tsx` | Program tab |
| `src/views/ProgressView.tsx` | Progress tab |
| `src/views/HistoryView.tsx` | History tab |
| `src/views/BodyView.tsx` | Body tab (weight, measurements, bloods, BP, glucose, photos) |
| `src/views/MealsView.tsx` | Meals tab |
| `src/views/PrivacyView.tsx` | Privacy tab |
| `src/views/ToolsView.tsx` | Tools tab |
| `src/views/SessionView.tsx` | Session preview before you start |
| `src/views/WorkoutView.tsx` | The live workout: logging sets, swap, skip, end |
| `src/views/CompleteView.tsx` | Session complete screen |
| `src/components/charts.tsx` | SVGChart, SVGBars, SVGScatter, Sparkline, RecoveryFuelStrip |
| `src/components/RootBoundary.tsx` | Crash screen shown if the app errors |
| `src/data/programme.ts` | Sessions, exercises, weekly RIR plan, deload weeks, muscle map, phases |
| `src/data/mealPlan.ts` | The cut meal plan |
| `src/lib/storage.ts` | localStorage helpers and the IndexedDB photo store |
| `src/hooks.ts` | `usePersistentState`: React state that saves itself to localStorage |
| `src/globals.d.ts`, `src/assets.d.ts` | Declarations for the build stamp on `window` and for CSS imports |
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
Everything is TypeScript except `boot.js`. Two checks run before every build:

| Check | Covers | Level |
|---|---|---|
| `tsconfig.json` | `lib/`, `data/`, `types.ts` (pure logic, no React) | full strict |
| `tsconfig.app.json` | everything, including the state hook and the screens | loose for now |

`npm run build` runs both, then `vite build`; a type error stops the build. `npm run typecheck`
runs the checks alone.

**How the screens are typed (Phase 3d).** `useAppState()` returns every value the screens use, and
`AppState = ReturnType<typeof useAppState>`, so each screen's `useApp()` values are typed from their
declarations automatically. Stored lists are declared with their record types (`usePersistentState<BPReading[]>`
etc., see `types.ts`). Number inputs that also hold typed text (weight, reps, RIR incl. '4+') are `any`.

**Fixes found by typing.** 3b: the recovery-vs-performance scatter read a field that was never set and
never rendered (`x.sdate` -> `x.date`). 3d: deload rebound rows printed "+x% · →kg" because the per-lift
method has no single before/after weight; they now read "+x% · N lifts".

## Tests (Phase 4)
`tests/` holds the automated tests (Node's built-in test runner, run with `tsx`). `npm test` runs them;
`npm run build` runs them after the type checks and before `vite build`, so a failing test stops the
deploy. 61 tests cover the server functions (WHOOP login, refresh and back-fill, cloud sync, AI proxy), sync merges and deletes, ids for records saved before ids existed, blood flags and ranges, WHOOP parsing (naps, local dates,
merging feeds), the progression engine (per-slot caps, deload sessions ignored), bodyweight helpers,
the per-lift detrend, the recovery scatter, alcohol split and deload rebound.

Each fixed bug has a test named after it. The suite was checked by putting 8 known bugs back one at a
time; every one made the suite fail. It also passes in timezones from UTC-11 to UTC+14.

To add a test: write `tests/<area>.test.ts` using `describe`/`it` from `node:test` and
`assert` from `node:assert/strict`, then import it in `tests/all.test.ts`.

## Record ids
New records get a random id (`newId`). Records saved before ids existed get one from `contentIds()` in
`lib/sync.ts`: built from the record's content (never its position in a list, which differs between
devices), with identical records on the same day numbered so they stay separate. `ensureIds` (load and
sync) and `tombstoneWhere` (deletes) both use it, so a record has the same id everywhere and a delete
on one device carries across.

## Progress screen layout (Phase 5)
Always shown: Needs attention, On track, Week in review.
**Strength** (open by default): lift progress chart, Progressing, Stalled lifts, Strength retention,
Lifetime movement PRs, Autoregulation.
**Explore** (closed by default): Training & volume (heat map, volume, session length, load, RIR drift,
deload rebound) | Recovery & lifestyle (WHOOP recovery and sleep trends, recovery vs performance,
time of day, alcohol, joint pain, burn cross-check) | Coach review.
Open/closed state is remembered in `prog_grp_closed_v2`.

## Server functions (netlify/)
Six Netlify functions, all TypeScript under strict checking (`netlify/tsconfig.json`):

| Function | Does | Logic |
|---|---|---|
| `ai-proxy` | Adds the Anthropic key server-side and forwards allow-listed Messages API fields | `lib/ai.ts` |
| `sync-data` | Cloud copy in Netlify Blobs: GET reads, POST writes, DELETE erases (key = hash of the sync code) | `lib/sync.ts` |
| `whoop-auth` | Starts WHOOP login with a random state + httpOnly cookie | `lib/whoop.ts` |
| `whoop-callback` | Checks the state (CSRF), swaps the code for tokens, hands them to the app in the URL fragment; never logs tokens | `lib/whoop.ts` |
| `whoop-refresh` | Swaps a refresh token for new tokens | `lib/whoop.ts` |
| `whoop-data` | Cycles, sleep, recovery, workouts; `?since=` back-fill with paging (max 4 pages, 60 days); 401 on any feed = refresh | `lib/whoop.ts` |

Each function file only wires real `fetch`, `process.env` and Blobs into a factory in `netlify/lib/`;
tests pass fakes instead, so they never touch WHOOP, Anthropic or your cloud data. `netlify/` is CommonJS
(how Netlify deploys it), so tests import it via the default import. The TypeScript versions were checked
against the previous JavaScript in 48 scenarios: identical responses, requests, logs and stored data.
