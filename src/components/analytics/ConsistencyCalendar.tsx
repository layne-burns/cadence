import { useMemo } from "react";
import type { DayOutcome } from "../../types/adherence";
import { addDaysIso, formatDateLabel, startOfWeekIso, toIsoDate } from "../../lib/time";
import { cx } from "../../lib/cx";

const WEEKS = 26;
const DAY_LABELS = ["Mon", "", "Wed", "", "Fri", "", "Sun"] as const;

/** Sequential ramp, light → dark, one hue. Index 0 is reserved for "had
 * blocks but completed none", so a bad day still reads as a day that
 * happened rather than as a blank. */
const RAMP = [
  "bg-indigo-100 dark:bg-indigo-950",
  "bg-indigo-200 dark:bg-indigo-900",
  "bg-indigo-300 dark:bg-indigo-800",
  "bg-indigo-400 dark:bg-indigo-600",
  "bg-indigo-500 dark:bg-indigo-500",
  "bg-indigo-600 dark:bg-indigo-400",
] as const;

function rampClassFor(ratio: number): string {
  const index = Math.min(RAMP.length - 1, Math.floor(ratio * RAMP.length));
  return RAMP[index] as string;
}

interface ConsistencyCalendarProps {
  history: DayOutcome[];
}

/**
 * A GitHub-style contribution grid of daily completion: weeks across,
 * weekdays down, half a year at a glance.
 *
 * Three states are deliberately distinguishable, because collapsing any
 * two of them would misreport the record:
 *   - **no data** — nothing scheduled, or before you started: bare outline
 *   - **excluded** — an ignored day (see streak settings): faded and
 *     dashed, present but visibly not counting either way
 *   - **counted** — shaded by completion ratio, with grace days ringed
 *
 * Excluded days matter especially: showing an ignored Saturday as an
 * empty cell would imply you failed it, and showing it shaded would imply
 * it padded the streak. It did neither.
 */
export function ConsistencyCalendar({ history }: ConsistencyCalendarProps) {
  const { weeks, byDate } = useMemo(() => {
    const map = new Map(history.map((outcome) => [outcome.date, outcome]));
    // Anchor on the current week's Monday and walk back, so the final
    // column is always the week in progress.
    const lastMonday = startOfWeekIso(toIsoDate(new Date()));
    const firstMonday = addDaysIso(lastMonday, -7 * (WEEKS - 1));
    const built = Array.from({ length: WEEKS }, (_, week) =>
      Array.from({ length: 7 }, (_, day) => addDaysIso(firstMonday, week * 7 + day)),
    );
    return { weeks: built, byDate: map };
  }, [history]);

  const today = toIsoDate(new Date());

  if (history.length === 0) {
    return (
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        No days recorded yet — this fills in as you use Cadence.
      </p>
    );
  }

  return (
    <div>
      <div className="flex gap-1 overflow-x-auto pb-1">
        <div className="flex shrink-0 flex-col gap-[3px] pr-1 pt-[1px]">
          {DAY_LABELS.map((label, i) => (
            <span
              key={i}
              className="h-[11px] text-[9px] leading-[11px] text-neutral-400 dark:text-neutral-600"
            >
              {label}
            </span>
          ))}
        </div>

        {weeks.map((week, weekIndex) => (
          <div key={weekIndex} className="flex shrink-0 flex-col gap-[3px]">
            {week.map((date) => {
              const outcome = byDate.get(date);
              const isFuture = date > today;
              const excluded = outcome?.excluded === true;

              return (
                <div
                  key={date}
                  title={describeDay(date, outcome, isFuture)}
                  className={cx(
                    "size-[11px] rounded-[2px]",
                    isFuture
                      ? "bg-transparent"
                      : excluded
                        ? // Faded and dashed: present, but visibly not
                          // counting in either direction.
                          "border border-dashed border-neutral-300 bg-neutral-100/40 opacity-50 dark:border-neutral-700 dark:bg-neutral-800/40"
                        : outcome
                          ? rampClassFor(outcome.completionRatio)
                          : "border border-neutral-200 dark:border-neutral-800",
                    outcome?.usedGraceDay &&
                      !excluded &&
                      "ring-1 ring-amber-400 ring-offset-0",
                  )}
                />
              );
            })}
          </div>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-neutral-400 dark:text-neutral-600">
        <span className="flex items-center gap-1">
          Less
          {RAMP.map((cls) => (
            <span key={cls} className={cx("size-[9px] rounded-[2px]", cls)} />
          ))}
          More
        </span>
        <span className="flex items-center gap-1">
          <span className="size-[9px] rounded-[2px] border border-dashed border-neutral-300 opacity-50 dark:border-neutral-700" />
          Ignored day
        </span>
        <span className="flex items-center gap-1">
          <span className="size-[9px] rounded-[2px] bg-indigo-300 ring-1 ring-amber-400 dark:bg-indigo-800" />
          Grace day
        </span>
      </div>
    </div>
  );
}

function describeDay(
  date: string,
  outcome: DayOutcome | undefined,
  isFuture: boolean,
): string {
  const label = formatDateLabel(date);
  if (isFuture) return label;
  if (!outcome) return `${label} — nothing recorded`;
  if (outcome.excluded) return `${label} — ignored day, doesn't count`;
  const percent = Math.round(outcome.completionRatio * 100);
  const grace = outcome.usedGraceDay ? " (grace day used)" : "";
  return `${label} — ${percent}% complete${grace}`;
}
