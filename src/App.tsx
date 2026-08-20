import { CalendarClock } from "lucide-react";

// Phase 1 placeholder — proves Vite + React + TS + Tailwind + Lucide are
// wired together correctly. Replaced by the real daily timeline in Phase 4.
function App() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-3">
      <CalendarClock className="size-10 text-neutral-400 dark:text-neutral-600" />
      <h1 className="text-2xl font-medium">Cadence</h1>
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        Foundation scaffold — timeline UI lands in a later phase.
      </p>
    </div>
  );
}

export default App;
