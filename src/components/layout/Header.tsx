import { ChevronLeft, ChevronRight, Settings } from "lucide-react";
import { formatDateLabel } from "../../lib/time";

interface HeaderProps {
  date: string;
  isToday: boolean;
  onPrevDay: () => void;
  onNextDay: () => void;
  onToday: () => void;
}

export function Header({ date, isToday, onPrevDay, onNextDay, onToday }: HeaderProps) {
  return (
    <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onPrevDay}
          aria-label="Previous day"
          className="rounded-md p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="text-sm font-medium">{formatDateLabel(date)}</span>
        <button
          type="button"
          onClick={onNextDay}
          aria-label="Next day"
          className="rounded-md p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          <ChevronRight className="size-4" />
        </button>
        {!isToday && (
          <button
            type="button"
            onClick={onToday}
            className="text-xs font-medium text-indigo-500 hover:underline"
          >
            Today
          </button>
        )}
      </div>
      {/* No settings modal yet — GistConfigModal attaches here once Gist
          sync gets a UI (see CLAUDE.md's Phase 3 notes). */}
      <button
        type="button"
        disabled
        title="Settings — coming in a later phase"
        aria-label="Settings"
        className="rounded-md p-1.5 text-neutral-300 dark:text-neutral-700"
      >
        <Settings className="size-4" />
      </button>
    </header>
  );
}
