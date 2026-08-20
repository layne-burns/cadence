import { Check } from "lucide-react";
import type { RenderedBlock } from "../../types/schedule";
import { formatMinutes } from "../../lib/time";
import { cx } from "../../lib/cx";

const DEFAULT_ROUTINE_COLOR = "#6366f1";
const DEFAULT_EVENT_COLOR = "#f59e0b";

interface TimeblockCardProps {
  block: RenderedBlock;
  completed: boolean;
  onToggleComplete: () => void;
}

export function TimeblockCard({
  block,
  completed,
  onToggleComplete,
}: TimeblockCardProps) {
  const isBuffer = block.kind === "buffer";
  const isEvent = block.kind === "event";
  const accentColor =
    block.color ?? (isEvent ? DEFAULT_EVENT_COLOR : DEFAULT_ROUTINE_COLOR);

  return (
    <div
      className={cx(
        "flex h-full items-stretch gap-2 overflow-hidden rounded-lg border text-left shadow-sm",
        isBuffer
          ? "border-dashed border-neutral-300 bg-neutral-50/60 dark:border-neutral-700 dark:bg-neutral-900/40"
          : "border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900",
        completed && !isBuffer && "opacity-60",
      )}
    >
      {!isBuffer && (
        <div className="w-1 shrink-0" style={{ backgroundColor: accentColor }} />
      )}
      <div className="flex min-w-0 flex-1 items-center justify-between gap-2 py-1.5 pr-2">
        <div className="min-w-0">
          <p
            className={cx(
              "truncate text-sm font-medium",
              isBuffer && "text-neutral-400 dark:text-neutral-600",
            )}
          >
            {block.title}
            {block.partIndex ? ` (Part ${block.partIndex})` : ""}
          </p>
          <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
            {formatMinutes(block.startMinutes)} – {formatMinutes(block.endMinutes)}
            {isEvent ? " · Event" : ""}
          </p>
        </div>
        {!isBuffer && (
          <button
            type="button"
            onClick={onToggleComplete}
            aria-pressed={completed}
            aria-label={completed ? "Mark incomplete" : "Mark complete"}
            className={cx(
              "flex size-7 shrink-0 items-center justify-center rounded-full border transition-colors",
              completed
                ? "border-emerald-500 bg-emerald-500 text-white"
                : "border-neutral-300 text-transparent hover:border-neutral-400 dark:border-neutral-600",
            )}
          >
            <Check className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
}
