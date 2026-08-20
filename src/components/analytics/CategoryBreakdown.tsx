import type { CategoryBucket } from "../../engine/analytics";
import type { Category } from "../../types/schedule";

interface CategoryBreakdownProps {
  buckets: CategoryBucket[];
  categories: Category[];
}

/**
 * A horizontal bar per category rather than a pie: part-to-whole reads
 * more accurately as bar length than as angle, and each row is already
 * directly labeled with the category name, so a separate legend swatch
 * box would just repeat it. (Named `CategoryPie` in the original spec's
 * file list — deliberately built as a bar chart instead; see CLAUDE.md.)
 */
export function CategoryBreakdown({ buckets, categories }: CategoryBreakdownProps) {
  const categoryById = new Map(categories.map((category) => [category.id, category]));

  if (buckets.length === 0) {
    return (
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        No scheduled blocks in the last 30 days yet.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {buckets.map((bucket) => {
        const category = bucket.categoryId ? categoryById.get(bucket.categoryId) : undefined;
        const color = category?.color ?? "#a3a3a3";
        const name = category?.name ?? "One-off events";
        const percent = Math.round(bucket.completionRate * 100);
        return (
          <li key={bucket.categoryId ?? "none"} className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{name}</span>
              <span className="text-neutral-500 dark:text-neutral-400">
                {bucket.completedCount}/{bucket.totalCount} · {percent}%
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
              <div
                className="h-full rounded-full"
                style={{ width: `${percent}%`, backgroundColor: color }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
