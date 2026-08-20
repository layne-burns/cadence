import type { HourBucket } from "../../engine/analytics";
import { formatMinutes } from "../../lib/time";
import { cx } from "../../lib/cx";

interface DropoffHeatmapProps {
  buckets: HourBucket[];
}

// Sequential ramp, light -> dark, one hue (indigo — this app's existing
// accent, substituted for the dataviz method's default blue per its own
// "swap in your brand's hue" guidance, rather than introducing a second
// competing "primary" color).
const RAMP = [
  "bg-indigo-50 dark:bg-indigo-950",
  "bg-indigo-100 dark:bg-indigo-900",
  "bg-indigo-200 dark:bg-indigo-800",
  "bg-indigo-300 dark:bg-indigo-700",
  "bg-indigo-400 dark:bg-indigo-600",
  "bg-indigo-500 dark:bg-indigo-500",
  "bg-indigo-600 dark:bg-indigo-400",
] as const;

function rampClassFor(rate: number): (typeof RAMP)[number] {
  const index = Math.min(RAMP.length - 1, Math.floor(rate * RAMP.length));
  return RAMP[index] as (typeof RAMP)[number];
}

/** One hour-of-day cell per bucket. An hour with nothing ever scheduled
 * in it renders as a distinct neutral cell rather than the palest ramp
 * step — "no data" and "0% completion" are different facts and shouldn't
 * look the same. */
export function DropoffHeatmap({ buckets }: DropoffHeatmapProps) {
  return (
    <div>
      <div className="flex gap-0.5 overflow-x-auto pb-1">
        {buckets.map((bucket) => (
          <div
            key={bucket.hour}
            className="flex min-w-[10px] flex-1 flex-col items-center gap-1"
          >
            <div
              title={
                bucket.totalCount === 0
                  ? `${formatMinutes(bucket.hour * 60)} — nothing scheduled`
                  : `${formatMinutes(bucket.hour * 60)} — ${bucket.completedCount}/${bucket.totalCount} completed (${Math.round(bucket.completionRate * 100)}%)`
              }
              className={cx(
                "h-10 w-full rounded-sm",
                // dark:bg-neutral-800, not -900: Card's own dark background
                // *is* neutral-900, so -900 here would be invisible against
                // it — found by actually looking at this in dark mode.
                bucket.totalCount === 0
                  ? "bg-neutral-100 dark:bg-neutral-800"
                  : rampClassFor(bucket.completionRate),
              )}
            />
            {bucket.hour % 3 === 0 && (
              <span className="text-[9px] text-neutral-400 dark:text-neutral-600">
                {bucket.hour}
              </span>
            )}
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-neutral-400 dark:text-neutral-600">
        Lighter = lower completion rate for that hour, over the last 30 days.
      </p>
    </div>
  );
}
