import type { PlannedVsActualBucket } from "../../engine/analytics";
import type { Category } from "../../types/schedule";
import { categoryPath } from "../../lib/categories";
import { withAlpha } from "../../lib/color";

interface PlannedVsActualProps {
  buckets: PlannedVsActualBucket[];
  categories: Category[];
}

function formatHours(minutes: number): string {
  const hours = minutes / 60;
  if (hours < 1) return `${minutes}m`;
  return `${hours.toFixed(hours < 10 ? 1 : 0)}h`;
}

/**
 * Hours scheduled against hours actually done, per category.
 *
 * Counted in minutes rather than blocks on purpose: a category of
 * 20-minute blocks and one of 90-minute blocks look identical by block
 * count while consuming wildly different amounts of a day. Chronic
 * over-scheduling of one area shows up here and nowhere else in the app.
 *
 * The bar is drawn as completed-over-planned rather than side by side, so
 * the shortfall is the visible gap — the thing you'd want to notice.
 */
export function PlannedVsActual({ buckets, categories }: PlannedVsActualProps) {
  if (buckets.length === 0) {
    return (
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        Nothing scheduled in the last 30 days yet.
      </p>
    );
  }

  const maxPlanned = Math.max(...buckets.map((b) => b.plannedMinutes));

  return (
    <ul className="flex flex-col gap-3">
      {buckets.map((bucket) => {
        const category = bucket.categoryId
          ? categories.find((c) => c.id === bucket.categoryId)
          : undefined;
        const name = bucket.categoryId
          ? categoryPath(categories, bucket.categoryId)
          : "One-off events";
        const color = category?.color ?? "#a3a3a3";
        const plannedWidth = (bucket.plannedMinutes / maxPlanned) * 100;
        const completedWidth =
          bucket.plannedMinutes > 0
            ? (bucket.completedMinutes / bucket.plannedMinutes) * 100
            : 0;

        return (
          <li key={bucket.categoryId ?? "none"} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="min-w-0 truncate font-medium">{name}</span>
              <span className="shrink-0 text-xs text-neutral-500 dark:text-neutral-400">
                {formatHours(bucket.completedMinutes)} of{" "}
                {formatHours(bucket.plannedMinutes)} · {Math.round(bucket.ratio * 100)}%
              </span>
            </div>
            {/* Outer track is scaled to the heaviest category so the rows
                compare against each other, not just against themselves. */}
            <div className="h-2.5 w-full rounded-full bg-neutral-100 dark:bg-neutral-800">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${plannedWidth}%`,
                  backgroundColor: withAlpha(color, 0.25) ?? "#e5e5e5",
                }}
              >
                <div
                  className="h-full rounded-full"
                  style={{ width: `${completedWidth}%`, backgroundColor: color }}
                />
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
