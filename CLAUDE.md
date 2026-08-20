# Cadence — ADHD-Friendly Daily Routine & Scheduling App

Local-first, mobile-responsive PWA for a grad student with ADHD. A repeating
weekly blueprint of timeblocks, overlaid with one-off events that
automatically shrink/split the blueprint around themselves, plus recovery
tools ("running late" push, Now & Next focus mode) and soft-streak tracking.
Syncs to a private GitHub Gist; otherwise fully offline via IndexedDB.

Project owner is new to GitHub and Claude Code — narrate GitHub/git actions
plainly, don't assume familiarity with jargon.

## Handoff: structural review session starts here

**All seven phases are complete and pushed** (see the phase tracker at the
bottom of this file for what each covered). The app is usable end-to-end:
set up categories and routine blocks in Blueprint, they render correctly on
Calendar (Day/3-Day/Week/Month all share one engine), the collision engine
splits/shrinks around one-off events, Focus tracks today independent of
Calendar's browsed date, Analytics shows real streak/heatmap/category data,
and Phase 7 added the PWA (installable, works offline), JSON backup
import/export, a settings modal, a working theme toggle, and automated
GitHub Pages deployment.

This section is for a fresh session (structural review + further testing)
to orient quickly without re-deriving what's already known. Everything
below is also covered in more detail in its own section further down —
this is the "read this first" summary, not a duplicate source of truth.

**Test coverage gap — the single biggest thing to look at first.** All 106
existing tests (`npm run test`) cover `engine/`, `lib/`, and `services/` —
pure functions plus `db.ts`/`gistSync.ts`/`transfer.ts` with
`fake-indexeddb`/mocked `fetch`. **Zero hooks or components have unit
tests.** Every hook (`useSchedule`, `useCalendar`, `useTemplates`,
`useSync`, `useStreak`, `useAnalyticsData`, `useTheme`) and every component
were verified only by manually driving the dev/preview server through the
Browser tool — real verification, and it did catch several genuine bugs,
but not regression-proof. If component/hook testing infrastructure
(`@testing-library/react` + jsdom) gets added, this is where it has by far
the most leverage.

**Known gaps and simplifications worth a structural look:**

- **No UI to edit or delete a one-off event once added.** `useSchedule`
  has a `removeEvent`, but nothing calls it, and `useCalendar` (what
  Calendar actually uses) doesn't even expose one. You can add an event
  via `EventForm` in Day/3-Day/Week view; there's no way to remove or
  retitle it afterward except by deleting the whole day's data. This is a
  real missing feature, not a documented deliberate deferral like the
  ones below.
- **`useSchedule` and `useCalendar` duplicate CRUD logic in shape**
  (toggle-complete, add-event) because one operates on a single date and
  the other on a map of dates. Documented as a deliberate trade in
  `useCalendar.ts`'s file comment, but worth a real look now that both
  are stable — a shared single-date "day data" primitive that
  `useCalendar` composes per-date might remove the duplication cleanly.
  `DayView.tsx` / `MultiDayView.tsx` have a smaller version of the same
  duplication (block positioning, the add-event modal).
- **Focus's nudges (+10 min/skip) and Calendar's "running late" push are
  both session-local, not persisted** — by design (see the Now & Next and
  timeShifter sections below for the reasoning), but confirm that's still
  the right call now that the rest of the app is real, not just whether
  it was reasonable to defer originally.
- **Gist sync is wired up but has never been run against a real GitHub
  token.** Phase 7 built the settings UI that calls it, and `gistSync.ts`
  is unit-tested against a mocked `fetch`, but no live PAT has ever hit
  `api.github.com` from this app. The create-gist / pull / debounced-push
  round trip is the least-proven path in the codebase. Testing it needs a
  real token, which is the user's to supply.
- **The blueprint has no per-day history/versioning** — Analytics
  necessarily renders *today's* blueprint against every past matching
  weekday in its 30-day window, not what was actually scheduled
  historically. Documented in the Analytics section below since it looks
  like a bug without that context; a real fix would be a genuine feature
  (snapshotting), not a quick patch.
- **The dataviz color palette wasn't run through the skill's validator**
  (`scripts/validate_palette.js`) — Analytics currently uses Tailwind's
  indigo scale directly rather than a checked-for-colorblind-safety ramp.
  Fine at one hue with no adjacent-pair risk; worth validating properly
  if the palette ever grows.
- **`Modal` keeps children permanently mounted** (toggles the native
  `<dialog>`, not React mount state) — forms inside it use a
  transition-derived `key` to force a fresh mount per open. Works, but a
  future contributor who doesn't know this will reintroduce the same
  stale-state bug in a new form. Worth deciding whether to keep the
  `key` convention or change `Modal` itself to conditionally render
  children.
- **Import does a full `window.location.reload()`** rather than re-seeding
  the hooks in place, and so does disconnecting Gist sync. Correct and
  honest for operations this rare, but if a "reset everything" or
  multi-device-merge feature ever lands, that pattern won't stretch.

**Everything else** — architecture rules, the full domain-logic reference,
commands, working style — is below, unchanged in nature from how it's
guided this project through Phases 0–6.

## Tech stack

- React 18+ / TypeScript (strict, no `any`) / Vite
- Tailwind CSS, Lucide React icons
- IndexedDB for local storage (typed wrapper, not raw)
- Vitest for unit tests (pure logic only — engine, not components)
- PWA: manifest + service worker, deployed to GitHub Pages

## Architecture rules

- **`/src/engine`** — pure functions only. No React, no DOM, no fetch. Every
  function here should be trivially unit-testable with plain inputs/outputs.
- **`/src/services`** — the only code allowed to touch IndexedDB or
  `fetch()`/`api.github.com`. No React imports here either.
- **`/src/hooks`** — the bridge: wraps engine + services into React state.
  Components should not call services or engine functions directly for
  anything with side effects — go through a hook.
- **`/src/components`** — grouped by feature area (`timeline/`, `focus/`,
  `weekly/`, `analytics/`, `settings/`, `common/`). Keep components small and
  single-purpose; a component that both renders a grid and computes collision
  slicing is a bug, not a shortcut.
- Strict TypeScript everywhere. No `any` — if a type is genuinely unknown,
  model it with a discriminated union or `unknown` + narrowing, not `any`.

## Domain logic reference

### Collision engine (`engine/scheduler.ts`)

One-off events overlay the weekly blueprint **without mutating the
blueprint**. Splitting/shrinking is computed fresh per day at render time.

- Event overlaps middle of a block → block splits into two parts around it.
- Event overlaps one edge → block shrinks from that edge.
- Event fully covers a block → block is suppressed for that day.
- **10-minute minimum**: any resulting fragment under 10 minutes is discarded
  and becomes open buffer time, not a visible sliver block.
- The blueprint (weekly template) itself is never written to by this engine —
  it only produces a derived per-day render.

### Calendar multi-view (Day / 3-Day / Week / Month)

Added after Phase 4 as a scope expansion, not one of the original 7
phases — the bottom-nav tab is `"calendar"` (renamed from `"today"`), and
the view-mode switcher lives *inside* the Calendar screen itself
(`CalendarViewSwitcher`), not behind the global settings icon.

- `hooks/useCalendar.ts` is the data layer: one range query (via
  `db.getEventsInRange`/`getAdherenceLogsInRange`) per visible range
  instead of one per date, a `viewMode` persisted to localStorage
  (`cadence.calendarViewMode`), and date-range math in `lib/time.ts`
  (`startOfWeekIso`, `monthGridDates`, etc — weeks are Monday-first).
  Month view always renders a fixed 42-date (6-week) grid so the page
  height doesn't jump between months.
- Three view components share the engine's per-date `DailyInstance`s:
  `DayView` (unchanged from Phase 4), `MultiDayView` (3-day and week are
  the same component — column count is just `dates.length`), and
  `MonthView` (read-only overview; clicking a day drills into Day view via
  `jumpToDate`, it doesn't support inline add/complete).
- **This surfaced a real bug and forced a split**: Focus mode and the
  Calendar tab used to share one `useSchedule()` instance's `date` state,
  so browsing Calendar to another day silently changed what Focus treated
  as "now". Fixed by giving each its own hook instance — `useSchedule()`
  now powers *only* Focus (its date-nav methods are unused, always stays
  on the date it initialized with — today), and `useCalendar()` is a
  separate hook with its own event/adherence CRUD for the browsable
  Calendar tab. The CRUD logic is duplicated in shape between the two
  (single-date vs. multi-date-map) rather than shared — see
  `useCalendar.ts`'s file comment for why, and reconsider if a third
  consumer of either shape shows up.
- `Header` is now generic (`label` + optional `onPrev`/`onNext`/`onToday`)
  instead of hardcoded to a single date — Focus passes just a label with
  no handlers, so no chevrons render there.

### Now & Next's "+10 min" and "Skip" (Phase 4, `hooks/useSchedule.ts`)

Implemented as session-local, non-persisted "nudges" — an in-memory
`{ blockId: minutesDelta }` map applied on top of the pure engine render,
reset whenever the viewed date changes. "+10 min" adds a positive delta to
the current block's end; "Skip" adds a negative delta that shrinks the
current block's end to right now, which is enough to make
`getCurrentAndNext` stop treating it as current. **This is a deliberate
simplification, not the real feature** — it doesn't cascade the shift
through the rest of the day and doesn't survive a reload. Phase 5's
`timeShifter.ts` is the actual "running late" push engine (persisted,
cascading, protects fixed events); when it lands, decide whether these
Now & Next buttons should call into it instead of the nudge map.

### Running Late / Push Schedule (`engine/timeShifter.ts`) — Phase 5, done

- `pushSchedule(date, dayOfWeek, template, events, nowMinutes, delta)`
  shifts every **flexible routine block starting at/after `nowMinutes`**
  forward by 15/30/45/60 min, then re-renders via `renderDailyInstance` so
  collisions against the (unmoved) fixed events are recomputed fresh —
  no separate "already split" bookkeeping needed.
- A block that's already in progress (started before `nowMinutes`) is left
  alone on purpose — that's Now & Next's "+10 min" territory, not this
  tool's. **Fixed one-off events never move**, matching the collision
  engine's own event handling.
- `compressToFit` best-effort-reclaims trailing time if the push runs past
  wind-down. **Only the actual tail block can ever reduce the day's end
  time** — blocks don't overlap, so whichever one starts latest also ends
  latest; shrinking some earlier block separated by a gap can't move
  anything after it, so it's a no-op for this purpose. Compression only
  continues past the tail when a fully-consumed *buffer* block gets
  removed, genuinely exposing the block before it as the new tail. A
  flexible routine block stops at the 10-minute floor (reusing
  `MIN_FRAGMENT_MINUTES` from scheduler.ts) and is never removed. Read the
  file-level comment before touching this function — the "why only the
  tail" reasoning isn't obvious from the code alone.
- UI: `TimeShifterModal` (single tap, no confirmation) + a "Running late?"
  button in `DayView`, shown only when viewing today. Applied via
  `useCalendar`'s `pushToday` as a session-local override (same pattern as
  Focus's nudges) — not persisted, cleared whenever the visible range
  reloads.

### Soft streaks (`engine/streaks.ts`) — Phase 5 engine, Phase 6b UI, done

- `computeCompletionRatio`/`computeDayOutcome`/`applyDayOutcome`/`recordDay`
  are pure and fully tested. A block counts toward the ratio if it's
  `kind !== "buffer"` — both routine blocks *and* one-off events count as
  real commitments; only synthesized filler is excluded.
- A day "succeeds" at ≥75% (`SUCCESS_THRESHOLD`). A miss spends a grace day
  if none was used in the trailing 7 days (`daysBetween(...) < 7`); if one
  was already spent, the streak resets to 0. `longestStreak` never
  decreases. `graceDayDatesUsed` is pruned at 14 days (margin over the
  7-day window), `history` capped at 400 entries.
- `hooks/useStreak.ts` is the "close out the day" trigger: on mount, walks
  from the day after `history`'s last entry up through **yesterday**
  (never today — the day isn't over) and calls `recordDay` for each,
  persisting once at the end. A brand-new user (empty `history`) only
  backfills from yesterday, not the unbounded past, so empty pre-signup
  days don't retroactively count as vacuous successes.
- **Known characteristic, not a bug**: the blueprint has no history or
  versioning, so `useAnalyticsData`'s 30-day window (and `useStreak`'s
  catch-up) render *today's* blueprint against every past matching
  weekday — not whatever was actually scheduled on that historical day.
  Concretely: add a Wednesday block today and the category breakdown
  immediately shows it as "1/5" (one of the ~5 Wednesdays in the trailing
  30 days actually has a completion). This is architecturally honest
  given the data model, but looks like a bug at first glance if you don't
  know it's intentional — a real per-day blueprint snapshot would be a
  genuine (larger) feature, not a fix.

### Blueprint editor (Phase 6a) and shared `useTemplates`

- `useTemplates()` grew a real CRUD surface (categories, blocks, wake/
  wind-down) on top of its one primitive, `updateBlueprint(updater)`. A
  category can't be deleted while any block still references it —
  `RoutineBlock.categoryId` is required, so allowing that would leave a
  dangling reference; `removeCategory` returns `false` instead and the UI
  shows why.
- **Call `useTemplates()` exactly once, at the App root, and pass the
  result down.** `useSchedule` and `useCalendar` both take a `templates:
  UseTemplatesResult` parameter now instead of calling the hook
  themselves — before the editor existed, three independent instances
  silently drifting out of sync was invisible (nothing wrote to
  blueprint state); now that editing is real, it isn't. If a new
  screen needs blueprint data, thread the same instance through rather
  than calling `useTemplates()` again.
- **`Modal` keeps its children mounted permanently** — it only toggles
  the native `<dialog>`'s visibility via `showModal()`/`close()`, not
  React mount state. A form inside one whose fields should reset (or
  re-derive defaults like "first available category") between opens
  needs a `key` that changes across open/close/target transitions, or
  its `useState` initializers only ever run once. See `BlockForm`'s
  usage in `DayTemplateEditor` and `EventForm`'s in `DayView`/
  `MultiDayView` for the pattern — found the hard way when a freshly
  added category didn't show up as the default in a block-add form that
  had mounted before any category existed.

### Analytics dashboard (Phase 6b, `components/analytics/`)

- `engine/analytics.ts`: `buildTelemetrySamples` flattens rendered days +
  logs into one `TelemetrySample` per non-buffer block (`completed: false`
  by default with no log — a drop-off, not a missing data point), then
  `computeHourlyDropoff` / `computeCategoryBreakdown` bucket those. Pure,
  tested (9 tests).
- `hooks/useAnalyticsData.ts` loads a trailing 30-day window (one range
  query each for events/logs) and feeds it through the aggregators.
  `hooks/useStreak.ts` is separate — see the streaks section above.
- **`CategoryBreakdown` is a horizontal bar chart, not the pie the
  original spec's file list named (`CategoryPie`)** — deliberate,
  following the dataviz skill's guidance that part-to-whole reads more
  accurately as bar length than pie angle, and each row is already
  directly labeled so a legend would just repeat it. Each bar uses the
  category's own user-chosen `color`, not a generated categorical
  palette — categories already carry color in the type system.
- `DropoffHeatmap`'s sequential ramp is Tailwind's indigo scale (light
  →dark), substituted for the dataviz skill's default blue per its own
  "swap in your brand's hue" guidance, since indigo is already this
  app's accent everywhere else (BottomNav, Focus's progress ring, links).
  A full validated-palette pass (running the skill's
  `scripts/validate_palette.js`) was skipped as out of scope for this
  pass — worth doing if the palette ever expands past one sequential hue
  and neutral.
- Found and fixed live in the browser: the heatmap's "no data" cells
  originally used `dark:bg-neutral-900`, identical to `Card`'s own dark
  background, so they were invisible in dark mode. Fixed to `-800`. A
  reminder that Tailwind class review alone doesn't catch same-value
  collisions between a component and its container — only actually
  looking at it in both themes does.

### Gist sync (`services/gistSync.ts`)

- PAT + Gist ID live in browser localStorage only. Every request goes
  directly to `api.github.com` — never proxied anywhere else.
- Local write → IndexedDB immediately (local-first, always works offline).
- Push to Gist is debounced 2s after the last local change.
- On app launch, pull if remote `last_modified` is newer than the last local
  sync timestamp; reconcile is last-write-wins at the whole-payload level
  (no field-level merge) unless/until we decide we need more.
- "Create New Gist Automatically" = `POST /gists` with a private
  `cadence-data.json` gist, then store the returned ID.
- Implemented in `services/gistSync.ts` (REST client + credential storage)
  and `hooks/useSync.ts` (lifecycle: auto-pull on mount, debounced
  auto-push, manual `configure`/`syncNow`). localStorage keys:
  `cadence.gistPat`, `cadence.gistId`, `cadence.lastKnownRemoteUpdatedAt`
  (the last one is sync bookkeeping, not a secret, but kept alongside the
  other two since it's meaningless without them).
- `tsconfig`'s `erasableSyntaxOnly` disallows TS parameter-property syntax
  (`constructor(readonly x: T)`) — write class fields out explicitly
  instead (see `GistSyncError`).

### Change notification (Phase 7, `services/db.ts`)

`useSync` originally took a `changeSignal` parameter and left it to a
future caller to bump whenever local data changed. Phase 7 replaced that
with a subscription at the database layer: `db.ts` exports
`subscribeToDataChanges` / `getDataVersion`, every write function calls a
private `notifyDataChanged()`, and `useSync` consumes both through
`useSyncExternalStore`. Since `db.ts` is already the single choke point
every write passes through, it's the only place that can answer "did
anything change?" without each feature hook remembering to report in.

One sharp edge worth knowing: `replaceAllData` takes `{ silent: true }`,
used **only** by the Gist *pull* path. Without it, pulling from the remote
would notify → `useSync` would see a local change → it would schedule a
push of the data it just pulled. A JSON *import* deliberately does not
pass `silent`, because a restored backup should propagate up to the Gist.

### Phase 7: PWA, backup, settings, deploy

- **PWA** via `vite-plugin-pwa` (`generateSW`, `registerType: "autoUpdate"`
  — no "update available, reload?" prompt, since there's no unsaved-form
  state worth protecting and prompting someone with ADHD to service their
  app is pure friction). All 10 assets precache; verified in `npm run
  preview` that the SW registers at the right scope and the precache holds
  `index.html` + JS + CSS + manifest + every icon, so a cold offline load
  works. App data was already offline-first in IndexedDB.
- **Icons**: `public/icon.svg` is the source of truth; `npm run icons`
  rasterizes it to the PNGs a real install needs (`icon-192`, `icon-512`,
  `icon-maskable-512` at 62% inset for Android's adaptive mask, and
  `apple-touch-icon` at 180 — iOS screenshots the page instead of using an
  SVG, and iPad is a target). The PNGs are committed so a normal build
  never needs `sharp`.
- **Theme**: `hooks/useTheme.ts` owns the `.dark` class. Three states, not
  a boolean — "system" (keeps following the OS mid-session) is distinct
  from explicitly choosing light or dark, and a boolean can't represent
  it. **An inline script in `index.html` applies the stored theme before
  first paint**; it duplicates the hook's resolution rule on purpose, and
  the two must stay in sync (same `cadence.theme` key, same logic) or
  dark-mode users get a white flash on every load.
- **Backup**: `services/transfer.ts`. The file format is the *same*
  `GistPayload` the Gist stores, so a backup file and a Gist file are
  interchangeable and one validator covers both. Validation is hand-rolled
  (no schema library) and collects every problem rather than failing on
  the first, so a bad import reports all of its faults at once with full
  field paths (`blueprint.days.monday.blocks[0].startMinutes must be a
  number`). Import is destructive, so the UI runs validate → summarize →
  confirm, then hard-reloads.
- **Settings**: one `SettingsModal` with Appearance / Sync / Backup
  panels, rather than the separate `GistConfigModal` + `ImportExportModal`
  the original spec's file list named — two modals would need their own
  menu to choose between them, and sync and backup are the same mental
  category. This is what finally calls `useSync`, unused since Phase 3.
- **Deploy**: `.github/workflows/deploy.yml` builds on push to `master`
  (running the test suite first, so a red suite blocks the deploy) and
  publishes `dist` to GitHub Pages. `vite.config.ts` sets `base` to
  `/cadence/` for builds **and previews** — `vite preview` reports
  `command === "serve"`, so checking `command` alone made preview serve at
  `/` while its own HTML requested `/cadence/…`, 404ing every asset. Use
  `isPreview`; that bug is exactly the kind `npm run preview` exists to
  catch. To move to a root domain, set `GITHUB_PAGES_BASE` to `"/"` — the
  manifest's `start_url`/`scope` derive from it automatically.

## Commands

```bash
npm run dev         # Vite dev server, base "/" (launch.json: "cadence-dev", port 5183)
npm run preview      # serves dist at base "/cadence/" (launch.json: "cadence-preview", port 5184)
npm run build         # production build (tsc -b && vite build) + service worker
npm run test           # vitest run
npm run test:watch    # vitest watch mode
npm run typecheck      # tsc -b, strict mode, no emit
npm run lint            # oxlint
npm run icons            # regenerate PNG icons from public/icon.svg (needs sharp)
```

Note that `npm run preview` serves at **http://localhost:5184/cadence/**,
not the bare origin — the base path is deliberately the same one GitHub
Pages uses, so preview actually exercises the deployed configuration.

Stack notes:
- Tailwind CSS v4 via `@tailwindcss/vite` (no separate `tailwind.config.js` —
  theme tokens live in `src/index.css` under `@theme`).
- Dark mode is **class-based**, not OS-only: `@custom-variant dark` in
  `src/index.css` makes `dark:` respond to a `.dark` class on an ancestor
  (normally `<html>`). `hooks/useTheme.ts` owns that class, plus the
  pre-paint inline script in `index.html` — see the Phase 7 section above.
- `tsconfig.app.json` / `tsconfig.node.json` both set `"strict": true`
  (plus `noUncheckedIndexedAccess`) — this is the actual enforcement of the
  "no `any`" rule above, not just a convention.

## Working style for this project

- Plan phases up front, then deliver each phase as a complete, tested
  increment before moving to the next — don't leave a phase half-wired.
- Local git commits as work lands; push to GitHub only once the remote is
  confirmed set up (see repo status below).
- Never write the user's PAT, tokens, or any credential into a file, commit,
  or log. Settings UI stores it in localStorage only, entered by the user.
- Verify UI changes in the browser preview (layout, drag/drop, mobile
  viewport), not just via `npm run test`.

## Repo status

- GitHub: https://github.com/layne-burns/cadence, remote `origin`, branch
  `master`. `gh` CLI authenticated as `layne-burns`.
- **Public**, deliberately: GitHub Pages needs either a public repo or a
  paid plan, and the user chose public over paying. Nothing sensitive is
  in the repo — the Gist PAT lives only in browser localStorage, schedule
  data lives in IndexedDB and (optionally) a *private* Gist, and `.env` is
  gitignored. Keep it that way: **never commit a token or real personal
  schedule data.**
- Live at https://layne-burns.github.io/cadence/ — pushes to `master`
  deploy automatically via `.github/workflows/deploy.yml`.

## Phase tracker

- [x] Phase 0 — env diagnostics, `gh` installed, this file
- [x] Phase 1 — Vite + Tailwind + Lucide + TS types + Vitest scaffold
- [x] Phase 2 — scheduler.ts collision engine + tests
- [x] Phase 3 — db.ts (IndexedDB) + gistSync.ts + useSync.ts
- [x] Phase 4 — daily timeline + Now & Next focus UI
- [x] Phase 5 — timeShifter.ts + streaks.ts (+ unplanned Calendar
      multi-view: Day/3-Day/Week/Month, done between Phase 4 and 5)
- [x] Phase 6a — blueprint editor (categories + per-day blocks)
- [x] Phase 6b — analytics dashboard (streak card, consistency trend,
      hourly heatmap, category breakdown) + useStreak's catch-up recording
- [x] Phase 7 — PWA (manifest + service worker + icons), JSON
      import/export, settings modal (activates Gist sync), theme toggle,
      GitHub Pages deploy via Actions
