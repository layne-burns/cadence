import { ChevronLeft, ChevronRight, Settings } from "lucide-react";

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
  onOpenSettings: () => void;
}

export function Header({
  label,
  showTodayLink,
  onPrev,
  onNext,
  onToday,
  onOpenSettings,
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
      <button
        type="button"
        onClick={onOpenSettings}
        title="Settings"
        aria-label="Settings"
        className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
      >
        <Settings className="size-4" />
      </button>
    </header>
  );
}
