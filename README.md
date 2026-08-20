# Cadence

An ADHD-friendly daily routine & scheduling PWA — a repeating weekly
blueprint of timeblocks, overlaid with one-off events that automatically
shrink/split around themselves, plus "running late" recovery tools and
soft-streak tracking. Local-first (IndexedDB), with optional sync to a
private GitHub Gist.

See [CLAUDE.md](./CLAUDE.md) for architecture rules, domain logic, and the
phase tracker.

## Commands

```bash
npm run dev         # Vite dev server
npm run build        # production build
npm run test          # vitest run
npm run test:watch   # vitest watch mode
npm run typecheck     # tsc -b (strict, no emit)
npm run lint           # oxlint
```
