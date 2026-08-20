import { describe, expect, it } from "vitest";
import {
  buildTelemetrySamples,
  computeCategoryBreakdown,
  computeHourlyDropoff,
} from "./analytics";
import type { AdherenceLog } from "../types/adherence";
import type { DailyInstance, RenderedBlock } from "../types/schedule";

function block(overrides: Partial<RenderedBlock> = {}): RenderedBlock {
  return {
    id: "b1",
    kind: "routine",
    sourceId: "src",
    title: "Block",
    categoryId: "research",
    startMinutes: 9 * 60,
    endMinutes: 10 * 60,
    flexibility: "flexible",
    ...overrides,
  };
}

function instance(date: string, blocks: RenderedBlock[]): DailyInstance {
  return { date, dayOfWeek: "monday", wakeMinutes: 7 * 60, windDownMinutes: 22 * 60, blocks };
}

function log(date: string, renderedBlockId: string, completed: boolean): AdherenceLog {
  return {
    id: `${date}::${renderedBlockId}`,
    date,
    renderedBlockId,
    blockTitle: "Block",
    categoryId: "research",
    completed,
    loggedAt: `${date}T12:00:00.000Z`,
  };
}

describe("buildTelemetrySamples", () => {
  it("produces one sample per non-buffer block, defaulting to incomplete with no log", () => {
    const instances = [
      instance("2026-08-24", [
        block({ id: "a" }),
        block({ id: "buf", kind: "buffer", sourceId: null }),
      ]),
    ];
    const samples = buildTelemetrySamples(instances, {});
    expect(samples).toHaveLength(1); // buffer excluded
    expect(samples[0]).toMatchObject({ date: "2026-08-24", hour: 9, completed: false });
  });

  it("picks up completed:true from a matching log", () => {
    const instances = [instance("2026-08-24", [block({ id: "a" })])];
    const logsByDate = { "2026-08-24": [log("2026-08-24", "a", true)] };
    const samples = buildTelemetrySamples(instances, logsByDate);
    expect(samples[0]?.completed).toBe(true);
  });

  it("buckets the hour from the block's start time", () => {
    const instances = [instance("2026-08-24", [block({ id: "a", startMinutes: 14 * 60 + 30 })])];
    const samples = buildTelemetrySamples(instances, {});
    expect(samples[0]?.hour).toBe(14);
  });

  it("wraps an out-of-range start time into a valid hour bucket", () => {
    // e.g. a session nudge that pushed a block past midnight (26:15).
    const instances = [instance("2026-08-24", [block({ id: "a", startMinutes: 26 * 60 + 15 })])];
    const samples = buildTelemetrySamples(instances, {});
    expect(samples[0]?.hour).toBe(2);
  });
});

describe("computeHourlyDropoff", () => {
  it("returns all 24 hours with zero counts when there are no samples", () => {
    const buckets = computeHourlyDropoff([]);
    expect(buckets).toHaveLength(24);
    expect(buckets.every((b) => b.totalCount === 0 && b.completionRate === 0)).toBe(true);
  });

  it("computes a per-hour completion rate", () => {
    const samples = [
      { date: "d", hour: 9, categoryId: null, completed: true },
      { date: "d", hour: 9, categoryId: null, completed: false },
      { date: "d", hour: 14, categoryId: null, completed: true },
    ];
    const buckets = computeHourlyDropoff(samples);
    expect(buckets[9]).toMatchObject({ totalCount: 2, completedCount: 1, completionRate: 0.5 });
    expect(buckets[14]).toMatchObject({ totalCount: 1, completedCount: 1, completionRate: 1 });
    expect(buckets[10]).toMatchObject({ totalCount: 0, completionRate: 0 });
  });
});

describe("computeCategoryBreakdown", () => {
  it("groups by category and sorts by total count descending", () => {
    const samples = [
      { date: "d", hour: 9, categoryId: "research", completed: true },
      { date: "d", hour: 10, categoryId: "research", completed: false },
      { date: "d", hour: 11, categoryId: "chores", completed: true },
    ];
    const buckets = computeCategoryBreakdown(samples);
    expect(buckets.map((b) => b.categoryId)).toEqual(["research", "chores"]);
    expect(buckets[0]).toMatchObject({ totalCount: 2, completedCount: 1, completionRate: 0.5 });
  });

  it("groups null categoryId (one-off events with no category) as its own bucket", () => {
    const samples = [{ date: "d", hour: 9, categoryId: null, completed: true }];
    const buckets = computeCategoryBreakdown(samples);
    expect(buckets).toEqual([
      { categoryId: null, totalCount: 1, completedCount: 1, completionRate: 1 },
    ]);
  });

  it("returns an empty array for no samples", () => {
    expect(computeCategoryBreakdown([])).toEqual([]);
  });
});
