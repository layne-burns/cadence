import { ChevronLeft, ChevronRight } from "lucide-react";
import { SyncIndicator } from "./SyncIndicator";
import type { SyncStatus } from "../../types/gist";

interface HeaderProps {
  label: string;
  /** Show the "Today" quick-jump link — irrelevant (and hidden) whenever
   * `onToday` isn't provided. */
  showTodayLink: boolean;
  /** Omit all three nav handlers to render a plain, non-interactive label
   * — used on tabs with no date to browse (Focus always shows "now"). */
  onPrev?: () => void;
  onNext?: () => void;
  onToday?: () => void;
  syncStatus: SyncStatus;
  syncConfigured: boolean;
  onOpenSync: () => void;
}

export function Header({
  label,
  showTodayLink,
  onPrev,
  onNext,
  onToday,
  syncStatus,
  syncConfigured,
  onOpenSync,
}: HeaderProps) {
  return (
    <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
      <div className="flex items-center gap-2">
        {onPrev && (
          <button
            type="button"
            onClick={onPrev}
            aria-label="Previous"
            className="rounded-md p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <ChevronLeft className="size-4" />
          </button>
        )}
        <span className="text-sm font-medium">{label}</span>
        {onNext && (
          <button
            type="button"
            onClick={onNext}
            aria-label="Next"
            className="rounded-md p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <ChevronRight className="size-4" />
          </button>
        )}
        {showTodayLink && onToday && (
          <button
            type="button"
            onClick={onToday}
            className="text-xs font-medium text-indigo-500 hover:underline"
          >
            Today
          </button>
        )}
      </div>
      {/* Settings has its own bottom-nav tab; the only thing earning
          header space is sync state, which needs to be glanceable. */}
      <SyncIndicator
        status={syncStatus}
        isConfigured={syncConfigured}
        onClick={onOpenSync}
      />
    </header>
  );
}
