import { cx } from "../../lib/cx";
import type { CalendarViewMode } from "../../hooks/useCalendar";

const OPTIONS: ReadonlyArray<{ id: CalendarViewMode; label: string }> = [
  { id: "day", label: "Day" },
  { id: "3day", label: "3-Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
];

interface CalendarViewSwitcherProps {
  value: CalendarViewMode;
  onChange: (mode: CalendarViewMode) => void;
}

/** The "settings inside the calendar view" for switching how much of the
 * calendar is visible at once — deliberately a plain segmented control on
 * the screen itself, not tucked behind the (currently inert) global
 * settings icon in the header. */
export function CalendarViewSwitcher({ value, onChange }: CalendarViewSwitcherProps) {
  return (
    <div
      role="tablist"
      aria-label="Calendar view"
      className="inline-flex rounded-lg border border-neutral-200 p-0.5 dark:border-neutral-800"
    >
      {OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          role="tab"
          aria-selected={value === option.id}
          onClick={() => onChange(option.id)}
          className={cx(
            "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            value === option.id
              ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
              : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
