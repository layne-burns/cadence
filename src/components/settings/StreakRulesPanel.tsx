import { Check } from "lucide-react";
import { DAYS_OF_WEEK, type DayOfWeek } from "../../types/schedule";
import type { StreakSettings } from "../../types/settings";
import { cx } from "../../lib/cx";

const DAY_LABELS: Record<DayOfWeek, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
};

interface StreakRulesPanelProps {
  streak: StreakSettings;
  onChange: (patch: Partial<StreakSettings>) => void;
}

export function StreakRulesPanel({ streak, onChange }: StreakRulesPanelProps) {
  const hasIgnoredDays = streak.ignoredDays.length > 0;

  function toggleDay(day: DayOfWeek) {
    const next = streak.ignoredDays.includes(day)
      ? streak.ignoredDays.filter((d) => d !== day)
      : [...streak.ignoredDays, day];
    onChange({
      ignoredDays: next,
      // Clearing the last ignored day makes the exception meaningless;
      // reset it so re-adding a day doesn't silently reinstate a rule the
      // user set up ages ago and has no reason to remember.
      ...(next.length === 0 ? { ignoreOnlyWhenNoEvents: false } : {}),
    });
  }

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-medium">Streak rules</h3>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Ignored days don't count toward your streak — they can't break it, and
          they can't pad it either.
        </p>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-300">
          Ignore days
        </p>
        <div className="flex flex-wrap gap-1.5">
          {DAYS_OF_WEEK.map((day) => {
            const active = streak.ignoredDays.includes(day);
            return (
              <button
                key={day}
                type="button"
                role="checkbox"
                aria-checked={active}
                onClick={() => toggleDay(day)}
                className={cx(
                  "rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
                  active
                    ? "border-indigo-500 bg-indigo-500 text-white"
                    : "border-neutral-300 text-neutral-600 hover:border-neutral-400 dark:border-neutral-700 dark:text-neutral-400",
                )}
              >
                {DAY_LABELS[day]}
              </button>
            );
          })}
        </div>
      </div>

      <label
        className={cx(
          "flex items-start gap-2.5 rounded-lg border p-3 transition-colors",
          hasIgnoredDays
            ? "cursor-pointer border-neutral-200 dark:border-neutral-800"
            : "cursor-not-allowed border-neutral-100 opacity-50 dark:border-neutral-900",
        )}
      >
        <button
          type="button"
          role="checkbox"
          aria-checked={streak.ignoreOnlyWhenNoEvents}
          disabled={!hasIgnoredDays}
          onClick={() =>
            onChange({ ignoreOnlyWhenNoEvents: !streak.ignoreOnlyWhenNoEvents })
          }
          className={cx(
            "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
            streak.ignoreOnlyWhenNoEvents
              ? "border-indigo-500 bg-indigo-500 text-white"
              : "border-neutral-300 text-transparent dark:border-neutral-600",
          )}
        >
          <Check className="size-3" />
        </button>
        <span className="text-xs text-neutral-700 dark:text-neutral-300">
          Only ignore those days when nothing special is scheduled
          <span className="mt-0.5 block text-neutral-500 dark:text-neutral-400">
            An ignored day still counts if you put a one-off event on it — if you
            planned something, showing up for it should count.
          </span>
        </span>
      </label>
    </section>
  );
}
