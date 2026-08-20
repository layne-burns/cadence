import type { DayOfWeekBucket, FlexibilityBucket } from "../../engine/analytics";
import type { DayOfWeek } from "../../types/schedule";
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

interface PatternBreakdownProps {
  byDayOfWeek: DayOfWeekBucket[];
  byFlexibility: FlexibilityBucket[];
}

/**
 * Two structural questions: is one weekday reliably worse than the
 * others, and do pinned blocks land better than movable ones?
 *
 * The second is the more interesting one for an ADHD tool. If fixed
 * blocks complete far *worse* than flexible ones, rigid scheduling isn't
 * helping — it's just manufacturing things to fail at, and the honest
 * response is to loosen the blueprint rather than try harder.
 */
export function PatternBreakdown({ byDayOfWeek, byFlexibility }: PatternBreakdownProps) {
  const hasDayData = byDayOfWeek.some((b) => b.totalCount > 0);
  const hasFlexData = byFlexibility.some((b) => b.totalCount > 0);

  if (!hasDayData && !hasFlexData) {
    return (
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        Nothing scheduled in the last 30 days yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h4 className="mb-2 text-xs font-medium text-neutral-700 dark:text-neutral-300">
          By day of week
        </h4>
        <div className="flex items-end gap-1.5" style={{ height: 80 }}>
          {byDayOfWeek.map((bucket) => (
            <div
              key={bucket.dayOfWeek}
              className="flex flex-1 flex-col items-center justify-end gap-1"
              title={
                bucket.totalCount === 0
                  ? `${DAY_LABELS[bucket.dayOfWeek]} — nothing scheduled`
                  : `${DAY_LABELS[bucket.dayOfWeek]} — ${bucket.completedCount}/${bucket.totalCount} (${Math.round(bucket.completionRate * 100)}%)`
              }
            >
              <span className="text-[10px] tabular-nums text-neutral-400 dark:text-neutral-600">
                {bucket.totalCount === 0
                  ? "–"
                  : `${Math.round(bucket.completionRate * 100)}%`}
              </span>
              <div
                className={cx(
                  "w-full rounded-t-[3px]",
                  bucket.totalCount === 0
                    ? "bg-neutral-100 dark:bg-neutral-800"
                    : "bg-indigo-500",
                )}
                style={{
                  height:
                    bucket.totalCount === 0
                      ? 2
                      : Math.max(3, bucket.completionRate * 52),
                }}
              />
              <span className="text-[10px] text-neutral-500 dark:text-neutral-400">
                {DAY_LABELS[bucket.dayOfWeek]}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h4 className="mb-2 text-xs font-medium text-neutral-700 dark:text-neutral-300">
          Fixed vs flexible blocks
        </h4>
        {!hasFlexData ? (
          <p className="text-xs text-neutral-400 dark:text-neutral-600">
            No routine blocks recorded yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {byFlexibility.map((bucket) => (
              <li key={bucket.flexibility} className="flex items-center gap-2">
                <span className="w-16 shrink-0 text-xs capitalize">
                  {bucket.flexibility}
                </span>
                <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                  <span
                    className="block h-full rounded-full bg-indigo-500"
                    style={{ width: `${bucket.completionRate * 100}%` }}
                  />
                </span>
                <span className="w-24 shrink-0 text-right text-xs text-neutral-500 dark:text-neutral-400">
                  {bucket.totalCount === 0
                    ? "none"
                    : `${bucket.completedCount}/${bucket.totalCount} · ${Math.round(bucket.completionRate * 100)}%`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
