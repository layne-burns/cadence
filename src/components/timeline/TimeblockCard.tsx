import { Check } from "lucide-react";
import type { RenderedBlock } from "../../types/schedule";
import { formatMinutes } from "../../lib/time";
import { cx } from "../../lib/cx";

const DEFAULT_ROUTINE_COLOR = "#6366f1";
const DEFAULT_EVENT_COLOR = "#f59e0b";

/**
 * Height thresholds for how much text a card can honestly show. A block's
 * height encodes its duration and must keep matching the ruler beside it,
 * so a short block genuinely has less room — the card adapts its content
 * instead of overflowing or being clipped mid-word. Anything that doesn't
 * fit lives in the detail modal, one tap away.
 *
 * Measured against real content: the title line is ~20px, the time line
 * ~16px, and vertical padding ~12px.
 */
const MIN_HEIGHT_FOR_TIME_LINE = 48;
const MIN_HEIGHT_FOR_TITLE = 24;

interface TimeblockCardProps {
  block: RenderedBlock;
  completed: boolean;
  /** Rendered height in pixels, so the card can decide how much it can
   * legibly show. The caller owns the geometry; this is not a guess. */
  heightPx: number;
  onToggleComplete: () => void;
  onOpenDetail: () => void;
}

export function TimeblockCard({
  block,
  completed,
  heightPx,
  onToggleComplete,
  onOpenDetail,
}: TimeblockCardProps) {
  const isBuffer = block.kind === "buffer";
  const isEvent = block.kind === "event";
  const accentColor =
    block.color ?? (isEvent ? DEFAULT_EVENT_COLOR : DEFAULT_ROUTINE_COLOR);

  const showTimeLine = heightPx >= MIN_HEIGHT_FOR_TIME_LINE;
  const showTitle = heightPx >= MIN_HEIGHT_FOR_TITLE;
  // Below ~36px a 28px control plus padding no longer fits without
  // crowding the title out entirely; the modal still offers the toggle.
  const showToggle = !isBuffer && heightPx >= 36;

  const title = `${block.title}${block.partIndex ? ` (Part ${block.partIndex})` : ""}`;

  return (
    <div
      role={isBuffer ? undefined : "button"}
      tabIndex={isBuffer ? undefined : 0}
      onClick={isBuffer ? undefined : onOpenDetail}
      onKeyDown={
        isBuffer
          ? undefined
          : (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onOpenDetail();
              }
            }
      }
      // `title` gives a native tooltip on the desktop hover case, which is
      // free and covers the truncated-title problem without a tap.
      title={isBuffer ? undefined : title}
      className={cx(
        "flex h-full items-stretch gap-2 overflow-hidden rounded-lg border text-left shadow-sm",
        isBuffer
          ? "border-dashed border-neutral-300 bg-neutral-50/60 dark:border-neutral-700 dark:bg-neutral-900/40"
          : "cursor-pointer border-neutral-200 bg-white hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-600",
        completed && !isBuffer && "opacity-60",
      )}
    >
      {!isBuffer && (
        <div className="w-1 shrink-0" style={{ backgroundColor: accentColor }} />
      )}
      <div className="flex min-w-0 flex-1 items-center justify-between gap-2 py-1 pr-1.5">
        <div className="min-w-0">
          {showTitle && (
            <p
              className={cx(
                "truncate text-sm font-medium leading-tight",
                isBuffer && "text-neutral-400 dark:text-neutral-600",
              )}
            >
              {title}
            </p>
          )}
          {showTimeLine && (
            <p className="truncate text-xs leading-tight text-neutral-500 dark:text-neutral-400">
              {formatMinutes(block.startMinutes)} – {formatMinutes(block.endMinutes)}
              {isEvent ? " · Event" : ""}
            </p>
          )}
        </div>
        {showToggle && (
          <button
            type="button"
            onClick={(event) => {
              // Without this the click bubbles to the card and opens the
              // detail modal every time you check something off.
              event.stopPropagation();
              onToggleComplete();
            }}
            aria-pressed={completed}
            aria-label={completed ? "Mark incomplete" : "Mark complete"}
            className={cx(
              "flex size-6 shrink-0 items-center justify-center rounded-full border transition-colors",
              completed
                ? "border-emerald-500 bg-emerald-500 text-white"
                : "border-neutral-300 text-transparent hover:border-neutral-400 dark:border-neutral-600",
            )}
          >
            <Check className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
