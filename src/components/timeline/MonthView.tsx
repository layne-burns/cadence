import { cx } from "../../lib/cx";
import { dayNumber, formatDateLabel } from "../../lib/time";
import type { DailyInstance } from "../../types/schedule";
import type { AdherenceLog } from "../../types/adherence";

const WEEKDAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

interface MonthViewProps {
  /** 42 dates, Monday-first grid — see lib/time.ts's monthGridDates. */
  dates: string[];
  instances: Record<string, DailyInstance>;
  anchorDate: string;
  today: string;
  getLogForBlock: (date: string, blockId: string) => AdherenceLog | undefined;
  /** Clicking a day drills into day view on that date — month view is
   * navigation-and-overview only, not directly interactive, so it doesn't
   * need its own add-event/complete-toggle affordances. */
  onSelectDate: (date: string) => void;
}

export function MonthView({
  dates,
  instances,
  anchorDate,
  today,
  getLogForBlock,
  onSelectDate,
}: MonthViewProps) {
  const anchorMonth = anchorDate.slice(0, 7); // "YYYY-MM"

  return (
    <div className="flex flex-col gap-1 p-4">
      <div className="grid grid-cols-7 gap-1 pb-1 text-center text-xs font-medium text-neutral-400 dark:text-neutral-600">
        {WEEKDAY_HEADERS.map((label) => (
          <div key={label}>{label}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {dates.map((date) => {
          const instance = instances[date];
          const blocks = instance?.blocks.filter((block) => block.kind !== "buffer") ?? [];
          const completedCount = blocks.filter(
            (block) => getLogForBlock(date, block.id)?.completed,
          ).length;
          const inMonth = date.slice(0, 7) === anchorMonth;
          const isToday = date === today;

          return (
            <button
              key={date}
              type="button"
              onClick={() => onSelectDate(date)}
              aria-label={formatDateLabel(date)}
              className={cx(
                "flex min-h-16 flex-col items-start gap-1 rounded-lg border p-1.5 text-left transition-colors hover:border-neutral-300 dark:hover:border-neutral-700",
                inMonth
                  ? "border-neutral-200 dark:border-neutral-800"
                  : "border-transparent opacity-40",
              )}
            >
              <span
                className={cx(
                  "flex size-5 items-center justify-center rounded-full text-xs",
                  isToday
                    ? "bg-indigo-500 text-white"
                    : "text-neutral-700 dark:text-neutral-300",
                )}
              >
                {dayNumber(date)}
              </span>
              {blocks.length > 0 && (
                <span className="text-[10px] text-neutral-400 dark:text-neutral-600">
                  {completedCount}/{blocks.length}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
