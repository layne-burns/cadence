/**
 * Pure aggregators over adherence data for the Analytics dashboard:
 * hourly drop-off (which hours of day see the most incompletions) and
 * category breakdown (completion rate per category). Both consume
 * `TelemetrySample[]` (types/adherence.ts) rather than raw
 * DailyInstance/AdherenceLog pairs directly, so the aggregation math
 * itself doesn't need to know how a sample was derived.
 */

import type { DailyInstance, DayOfWeek, Flexibility } from "../types/schedule";
import { DAYS_OF_WEEK } from "../types/schedule";
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
        frictionNote: log?.frictionNote,
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

// ---- Energy & friction ---------------------------------------------------
//
// These two answer *why* something didn't land, which nothing else here
// can. Both only see check-ins where the user actually answered the
// optional follow-up, so every function below reports its sample size —
// a 2.0 average energy from one answer is not the same claim as 2.0 from
// forty, and a chart that hides the difference is lying quietly.

export interface EnergyByHourBucket {
  hour: number;
  /** Null when nobody logged energy in this hour — distinct from 0. */
  averageEnergy: number | null;
  sampleCount: number;
}

export function computeEnergyByHour(samples: TelemetrySample[]): EnergyByHourBucket[] {
  const totals = new Array<number>(24).fill(0);
  const counts = new Array<number>(24).fill(0);
  for (const sample of samples) {
    if (sample.energyLevel === undefined) continue;
    totals[sample.hour] = (totals[sample.hour] ?? 0) + sample.energyLevel;
    counts[sample.hour] = (counts[sample.hour] ?? 0) + 1;
  }
  return Array.from({ length: 24 }, (_, hour) => {
    const count = counts[hour] ?? 0;
    return {
      hour,
      averageEnergy: count > 0 ? (totals[hour] as number) / count : null,
      sampleCount: count,
    };
  });
}

export interface FrictionCount {
  note: string;
  count: number;
}

/** Most common first. Ties keep their original encounter order, which is
 * stable enough for a list nobody sorts by name. */
export function computeFrictionCounts(samples: TelemetrySample[]): FrictionCount[] {
  const counts = new Map<string, number>();
  for (const sample of samples) {
    if (!sample.frictionNote) continue;
    counts.set(sample.frictionNote, (counts.get(sample.frictionNote) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([note, count]) => ({ note, count }))
    .sort((a, b) => b.count - a.count);
}

// ---- Planned vs actual time ----------------------------------------------

export interface PlannedVsActualBucket {
  categoryId: string | null;
  plannedMinutes: number;
  completedMinutes: number;
  /** completed / planned, 0 when nothing was planned. */
  ratio: number;
}

/**
 * Minutes scheduled against minutes actually checked off, per category.
 *
 * Counts *minutes* rather than blocks because that's the question this
 * answers — a category full of 20-minute blocks and one full of 90-minute
 * blocks look identical by block count while consuming wildly different
 * amounts of a day. Over-scheduling shows up here and nowhere else.
 */
export function computePlannedVsActual(
  instances: DailyInstance[],
  logsByDate: Record<string, AdherenceLog[]>,
): PlannedVsActualBucket[] {
  const map = new Map<string | null, PlannedVsActualBucket>();

  for (const instance of instances) {
    const logs = logsByDate[instance.date] ?? [];
    for (const block of instance.blocks) {
      if (block.kind === "buffer") continue;
      const minutes = block.endMinutes - block.startMinutes;
      let bucket = map.get(block.categoryId);
      if (!bucket) {
        bucket = {
          categoryId: block.categoryId,
          plannedMinutes: 0,
          completedMinutes: 0,
          ratio: 0,
        };
        map.set(block.categoryId, bucket);
      }
      bucket.plannedMinutes += minutes;
      if (logs.find((l) => l.renderedBlockId === block.id)?.completed) {
        bucket.completedMinutes += minutes;
      }
    }
  }

  const buckets = [...map.values()];
  for (const bucket of buckets) {
    bucket.ratio =
      bucket.plannedMinutes > 0 ? bucket.completedMinutes / bucket.plannedMinutes : 0;
  }
  buckets.sort((a, b) => b.plannedMinutes - a.plannedMinutes);
  return buckets;
}

// ---- Day of week & flexibility -------------------------------------------

export interface DayOfWeekBucket {
  dayOfWeek: DayOfWeek;
  totalCount: number;
  completedCount: number;
  completionRate: number;
}

export function computeDayOfWeekBreakdown(
  instances: DailyInstance[],
  logsByDate: Record<string, AdherenceLog[]>,
): DayOfWeekBucket[] {
  const buckets: DayOfWeekBucket[] = DAYS_OF_WEEK.map((dayOfWeek) => ({
    dayOfWeek,
    totalCount: 0,
    completedCount: 0,
    completionRate: 0,
  }));
  const byDay = new Map(buckets.map((b) => [b.dayOfWeek, b]));

  for (const instance of instances) {
    const logs = logsByDate[instance.date] ?? [];
    const bucket = byDay.get(instance.dayOfWeek);
    if (!bucket) continue;
    for (const block of instance.blocks) {
      if (block.kind === "buffer") continue;
      bucket.totalCount += 1;
      if (logs.find((l) => l.renderedBlockId === block.id)?.completed) {
        bucket.completedCount += 1;
      }
    }
  }

  for (const bucket of buckets) {
    bucket.completionRate =
      bucket.totalCount > 0 ? bucket.completedCount / bucket.totalCount : 0;
  }
  return buckets;
}

export interface FlexibilityBucket {
  flexibility: Flexibility;
  totalCount: number;
  completedCount: number;
  completionRate: number;
}

/**
 * Completion split by whether a block is pinned or movable. Worth having
 * for an ADHD tool specifically: it answers whether rigid scheduling
 * actually helps this person or just manufactures things to fail at.
 *
 * One-off events are excluded — they're always `fixed` by construction
 * (see the collision engine), so including them would load the "fixed"
 * side with appointments and make the comparison meaningless.
 */
export function computeFlexibilityBreakdown(
  instances: DailyInstance[],
  logsByDate: Record<string, AdherenceLog[]>,
): FlexibilityBucket[] {
  const buckets: FlexibilityBucket[] = [
    { flexibility: "fixed", totalCount: 0, completedCount: 0, completionRate: 0 },
    { flexibility: "flexible", totalCount: 0, completedCount: 0, completionRate: 0 },
  ];
  const byFlex = new Map(buckets.map((b) => [b.flexibility, b]));

  for (const instance of instances) {
    const logs = logsByDate[instance.date] ?? [];
    for (const block of instance.blocks) {
      if (block.kind !== "routine") continue;
      const bucket = byFlex.get(block.flexibility);
      if (!bucket) continue;
      bucket.totalCount += 1;
      if (logs.find((l) => l.renderedBlockId === block.id)?.completed) {
        bucket.completedCount += 1;
      }
    }
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
