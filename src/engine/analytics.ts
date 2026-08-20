/**
 * Pure aggregators over adherence data for the Analytics dashboard:
 * hourly drop-off (which hours of day see the most incompletions) and
 * category breakdown (completion rate per category). Both consume
 * `TelemetrySample[]` (types/adherence.ts) rather than raw
 * DailyInstance/AdherenceLog pairs directly, so the aggregation math
 * itself doesn't need to know how a sample was derived.
 */

import type { DailyInstance } from "../types/schedule";
import type { AdherenceLog, TelemetrySample } from "../types/adherence";

/**
 * Flattens a set of rendered days plus their logs into one sample per
 * scheduled (non-buffer) block. `completed: false` is the default for a
 * block with no matching log — that's exactly what drop-off analysis
 * needs: a block nobody checked off is a drop-off, not a missing data
 * point to be silently excluded.
 */
export function buildTelemetrySamples(
  instances: DailyInstance[],
  logsByDate: Record<string, AdherenceLog[]>,
): TelemetrySample[] {
  const samples: TelemetrySample[] = [];
  for (const instance of instances) {
    const logs = logsByDate[instance.date] ?? [];
    for (const block of instance.blocks) {
      if (block.kind === "buffer") continue;
      const log = logs.find((l) => l.renderedBlockId === block.id);
      // Wrapped defensively in case a session nudge (Focus's +10/skip, or
      // a running-late push) ever pushed a block's start past midnight —
      // same wrap-around handled the same way lib/time.ts's formatMinutes
      // does, so an hour always lands in a valid 0-23 bucket.
      const hour = (((Math.floor(block.startMinutes / 60) % 24) + 24) % 24);
      samples.push({
        date: instance.date,
        hour,
        categoryId: block.categoryId,
        completed: log?.completed ?? false,
        energyLevel: log?.energyLevel,
      });
    }
  }
  return samples;
}

export interface HourBucket {
  hour: number;
  totalCount: number;
  completedCount: number;
  /** 0 when totalCount is 0 — callers should check totalCount before
   * treating completionRate as meaningful ("no data" vs. "0% complete"
   * are different facts). */
  completionRate: number;
}

export function computeHourlyDropoff(samples: TelemetrySample[]): HourBucket[] {
  const buckets: HourBucket[] = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    totalCount: 0,
    completedCount: 0,
    completionRate: 0,
  }));
  for (const sample of samples) {
    const bucket = buckets[sample.hour] as HourBucket;
    bucket.totalCount += 1;
    if (sample.completed) bucket.completedCount += 1;
  }
  for (const bucket of buckets) {
    bucket.completionRate =
      bucket.totalCount > 0 ? bucket.completedCount / bucket.totalCount : 0;
  }
  return buckets;
}

export interface CategoryBucket {
  categoryId: string | null;
  totalCount: number;
  completedCount: number;
  completionRate: number;
}

/** Sorted by total scheduled count, descending — the category the
 * schedule leans on most leads the list. */
export function computeCategoryBreakdown(samples: TelemetrySample[]): CategoryBucket[] {
  const map = new Map<string | null, CategoryBucket>();
  for (const sample of samples) {
    let bucket = map.get(sample.categoryId);
    if (!bucket) {
      bucket = {
        categoryId: sample.categoryId,
        totalCount: 0,
        completedCount: 0,
        completionRate: 0,
      };
      map.set(sample.categoryId, bucket);
    }
    bucket.totalCount += 1;
    if (sample.completed) bucket.completedCount += 1;
  }
  const buckets = [...map.values()];
  for (const bucket of buckets) {
    bucket.completionRate =
      bucket.totalCount > 0 ? bucket.completedCount / bucket.totalCount : 0;
  }
  buckets.sort((a, b) => b.totalCount - a.totalCount);
  return buckets;
}
