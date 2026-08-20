import type { EnergyByHourBucket, FrictionCount } from "../../engine/analytics";
import { formatMinutes } from "../../lib/time";
import { cx } from "../../lib/cx";

interface EnergyAndFrictionProps {
  energyByHour: EnergyByHourBucket[];
  frictionCounts: FrictionCount[];
}

/**
 * The only view that speaks to *why* rather than *whether*. Everything
 * else here reports that a block didn't get done; this reports that you
 * were running on empty at 3pm, or that "underestimated time" is your
 * most common failure mode.
 *
 * Both halves depend on the optional post-check-in prompt, so both state
 * their sample size plainly. An average of 2.0 from one answer is a very
 * different claim from 2.0 from forty, and a chart that hides the
 * difference is quietly lying.
 */
export function EnergyAndFriction({
  energyByHour,
  frictionCounts,
}: EnergyAndFrictionProps) {
  const rated = energyByHour.filter((b) => b.sampleCount > 0);
  const totalRatings = rated.reduce((sum, b) => sum + b.sampleCount, 0);
  const maxFriction = frictionCounts[0]?.count ?? 0;

  if (totalRatings === 0 && frictionCounts.length === 0) {
    return (
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        Nothing here yet. After you mark something done, the optional
        "How did that go?" prompt feeds this — it's the only thing that can
        explain <em>why</em> a block didn't land.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <h4 className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
            Energy by hour
          </h4>
          <span className="text-[10px] text-neutral-400 dark:text-neutral-600">
            {totalRatings} rating{totalRatings === 1 ? "" : "s"}
          </span>
        </div>
        {totalRatings === 0 ? (
          <p className="text-xs text-neutral-400 dark:text-neutral-600">
            No energy ratings yet.
          </p>
        ) : (
          <div className="flex items-end gap-1" style={{ height: 72 }}>
            {energyByHour.map((bucket) => (
              <div
                key={bucket.hour}
                className="flex flex-1 flex-col items-center justify-end gap-1"
                title={
                  bucket.sampleCount === 0
                    ? `${formatMinutes(bucket.hour * 60)} — no ratings`
                    : `${formatMinutes(bucket.hour * 60)} — avg energy ${bucket.averageEnergy?.toFixed(1)} from ${bucket.sampleCount}`
                }
              >
                <div
                  className={cx(
                    "w-full rounded-t-[3px]",
                    bucket.averageEnergy === null
                      ? "bg-neutral-100 dark:bg-neutral-800"
                      : "bg-indigo-500",
                  )}
                  style={{
                    // Scale 1-5 across the plot; an unrated hour keeps a
                    // 2px stub so the axis reads continuously instead of
                    // looking like a gap in the day.
                    height:
                      bucket.averageEnergy === null
                        ? 2
                        : Math.max(4, (bucket.averageEnergy / 5) * 60),
                  }}
                />
                {bucket.hour % 6 === 0 && (
                  <span className="text-[9px] text-neutral-400 dark:text-neutral-600">
                    {bucket.hour}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h4 className="mb-2 text-xs font-medium text-neutral-700 dark:text-neutral-300">
          What came up
        </h4>
        {frictionCounts.length === 0 ? (
          <p className="text-xs text-neutral-400 dark:text-neutral-600">
            No notes logged yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {frictionCounts.map(({ note, count }) => (
              <li key={note} className="flex items-center gap-2">
                <span className="w-36 shrink-0 truncate text-xs">{note}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                  <span
                    className="block h-full rounded-full bg-indigo-500"
                    style={{ width: `${(count / maxFriction) * 100}%` }}
                  />
                </span>
                <span className="w-6 shrink-0 text-right text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
                  {count}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
