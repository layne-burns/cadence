# Cadence — ADHD-Friendly Daily Routine & Scheduling App

Local-first, mobile-responsive PWA for a grad student with ADHD. A repeating
weekly blueprint of timeblocks, overlaid with one-off events that
automatically shrink/split the blueprint around themselves, plus recovery
tools ("running late" push, Now & Next focus mode) and soft-streak tracking.
Syncs to a private GitHub Gist; otherwise fully offline via IndexedDB.

Project owner is new to GitHub and Claude Code — narrate GitHub/git actions
plainly, don't assume familiarity with jargon.

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

### Running Late / Push Schedule (`engine/timeShifter.ts`)

- Shifts all remaining **unfinished, flexible** blocks forward by
  15/30/45/60 min.
- **Fixed one-off events never move.** Flexible blocks shift around them
  (i.e. this reruns collision logic against the now-shifted blocks).
- If the push runs past the day's wind-down time, compress the
  lowest-priority buffer blocks at the end of the day first — don't just
  silently truncate real routine blocks.

### Soft streaks (`engine/streaks.ts`)

- A day counts as a "success" if ≥75% of that day's active scheduled routine
  blocks were checked off.
- Missing the threshold consumes a **Grace Day** instead of resetting the
  streak — max 1 grace day per rolling 7-day window. Track grace-day usage
  as a rolling window, not a fixed weekly bucket that resets on Monday.

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

## Commands

```bash
npm run dev         # Vite dev server (also registered in .claude/launch.json as "cadence-dev", port 5183)
npm run build        # production build (tsc -b && vite build)
npm run test           # vitest run
npm run test:watch    # vitest watch mode
npm run typecheck      # tsc -b, strict mode, no emit
npm run lint             # oxlint
```

Stack notes:
- Tailwind CSS v4 via `@tailwindcss/vite` (no separate `tailwind.config.js` —
  theme tokens live in `src/index.css` under `@theme`).
- Dark mode is **class-based**, not OS-only: `@custom-variant dark` in
  `src/index.css` makes `dark:` respond to a `.dark` class on an ancestor
  (normally `<html>`). A later-phase theme hook is responsible for syncing
  that class with system preference by default and a manual override on
  top — until that hook exists, the app renders light-only.
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

- GitHub: https://github.com/layne-burns/cadence (private), remote `origin`,
  branch `master`. `gh` CLI authenticated as `layne-burns`.

## Phase tracker

- [x] Phase 0 — env diagnostics, `gh` installed, this file
- [x] Phase 1 — Vite + Tailwind + Lucide + TS types + Vitest scaffold
- [ ] Phase 2 — scheduler.ts collision engine + tests
- [ ] Phase 3 — db.ts (IndexedDB) + gistSync.ts
- [ ] Phase 4 — daily timeline + Now & Next focus UI
- [ ] Phase 5 — timeShifter.ts + streaks.ts
- [ ] Phase 6 — blueprint editor + analytics dashboard
- [ ] Phase 7 — PWA manifest/SW, import/export, GitHub Pages deploy
