import { describe, expect, it } from "vitest";
import {
  buildTelemetrySamples,
  computeCategoryBreakdown,
  computeDayOfWeekBreakdown,
  computeEnergyByHour,
  computeFlexibilityBreakdown,
  computeFrictionCounts,
  computeHourlyDropoff,
  computePlannedVsActual,
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

describe("computeEnergyByHour", () => {
  it("averages energy per hour and reports the sample size", () => {
    const samples = [
      { date: "d", hour: 9, categoryId: null, completed: true, energyLevel: 4 as const },
      { date: "d", hour: 9, categoryId: null, completed: true, energyLevel: 2 as const },
      { date: "d", hour: 14, categoryId: null, completed: true, energyLevel: 5 as const },
    ];
    const buckets = computeEnergyByHour(samples);
    expect(buckets[9]).toMatchObject({ averageEnergy: 3, sampleCount: 2 });
    expect(buckets[14]).toMatchObject({ averageEnergy: 5, sampleCount: 1 });
  });

  it("reports null rather than 0 for an hour nobody rated", () => {
    // "no data" and "energy was zero" must not look the same, and zero
    // isn't even a valid EnergyLevel.
    const buckets = computeEnergyByHour([]);
    expect(buckets[9]).toMatchObject({ averageEnergy: null, sampleCount: 0 });
    expect(buckets).toHaveLength(24);
  });

  it("ignores check-ins where energy was never answered", () => {
    const samples = [
      { date: "d", hour: 9, categoryId: null, completed: true },
      { date: "d", hour: 9, categoryId: null, completed: true, energyLevel: 4 as const },
    ];
    expect(computeEnergyByHour(samples)[9]).toMatchObject({
      averageEnergy: 4,
      sampleCount: 1,
    });
  });
});

describe("computeFrictionCounts", () => {
  it("counts notes and sorts them most common first", () => {
    const samples = [
      { date: "d", hour: 9, categoryId: null, completed: false, frictionNote: "Distracted" },
      { date: "d", hour: 10, categoryId: null, completed: false, frictionNote: "Distracted" },
      { date: "d", hour: 11, categoryId: null, completed: true, frictionNote: "Great flow" },
    ];
    expect(computeFrictionCounts(samples)).toEqual([
      { note: "Distracted", count: 2 },
      { note: "Great flow", count: 1 },
    ]);
  });

  it("is empty when nobody left a note", () => {
    expect(
      computeFrictionCounts([{ date: "d", hour: 9, categoryId: null, completed: true }]),
    ).toEqual([]);
  });

  it("picks up notes that buildTelemetrySamples carried through", () => {
    // Regression guard: the sample builder originally dropped
    // frictionNote, which made this aggregator silently always empty.
    const instances = [instance("2026-08-24", [block({ id: "a" })])];
    const logsByDate = {
      "2026-08-24": [{ ...log("2026-08-24", "a", true), frictionNote: "Great flow" }],
    };
    const samples = buildTelemetrySamples(instances, logsByDate);
    expect(computeFrictionCounts(samples)).toEqual([{ note: "Great flow", count: 1 }]);
  });
});

describe("computePlannedVsActual", () => {
  it("counts minutes, not blocks", () => {
    // The whole point: a category of short blocks and one of long blocks
    // look identical by block count while eating very different amounts
    // of the day.
    const instances = [
      instance("2026-08-24", [
        block({ id: "long", categoryId: "deep", startMinutes: 9 * 60, endMinutes: 11 * 60 }),
        block({ id: "short", categoryId: "admin", startMinutes: 11 * 60, endMinutes: 11 * 60 + 20 }),
      ]),
    ];
    const buckets = computePlannedVsActual(instances, {
      "2026-08-24": [log("2026-08-24", "long", true)],
    });

    const deep = buckets.find((b) => b.categoryId === "deep")!;
    const admin = buckets.find((b) => b.categoryId === "admin")!;
    expect(deep.plannedMinutes).toBe(120);
    expect(deep.completedMinutes).toBe(120);
    expect(deep.ratio).toBe(1);
    expect(admin.plannedMinutes).toBe(20);
    expect(admin.completedMinutes).toBe(0);
    expect(admin.ratio).toBe(0);
  });

  it("sorts by planned time, heaviest first", () => {
    const instances = [
      instance("2026-08-24", [
        block({ id: "a", categoryId: "small", startMinutes: 9 * 60, endMinutes: 9 * 60 + 15 }),
        block({ id: "b", categoryId: "big", startMinutes: 10 * 60, endMinutes: 12 * 60 }),
      ]),
    ];
    const buckets = computePlannedVsActual(instances, {});
    expect(buckets.map((b) => b.categoryId)).toEqual(["big", "small"]);
  });

  it("excludes buffer blocks", () => {
    const instances = [
      instance("2026-08-24", [
        block({ id: "buf", kind: "buffer", sourceId: null, categoryId: null }),
      ]),
    ];
    expect(computePlannedVsActual(instances, {})).toEqual([]);
  });
});

describe("computeDayOfWeekBreakdown", () => {
  it("returns all seven days, attributing blocks to the right one", () => {
    const monday = instance("2026-08-24", [block({ id: "a" })]); // dayOfWeek "monday"
    const buckets = computeDayOfWeekBreakdown([monday], {
      "2026-08-24": [log("2026-08-24", "a", true)],
    });
    expect(buckets).toHaveLength(7);
    const mon = buckets.find((b) => b.dayOfWeek === "monday")!;
    expect(mon).toMatchObject({ totalCount: 1, completedCount: 1, completionRate: 1 });
    const tue = buckets.find((b) => b.dayOfWeek === "tuesday")!;
    expect(tue).toMatchObject({ totalCount: 0, completionRate: 0 });
  });
});

describe("computeFlexibilityBreakdown", () => {
  it("splits routine blocks by fixed vs flexible", () => {
    const instances = [
      instance("2026-08-24", [
        block({ id: "f1", flexibility: "fixed" }),
        block({ id: "f2", flexibility: "fixed" }),
        block({ id: "x1", flexibility: "flexible" }),
      ]),
    ];
    const buckets = computeFlexibilityBreakdown(instances, {
      "2026-08-24": [log("2026-08-24", "f1", true)],
    });
    const fixed = buckets.find((b) => b.flexibility === "fixed")!;
    const flexible = buckets.find((b) => b.flexibility === "flexible")!;
    expect(fixed).toMatchObject({ totalCount: 2, completedCount: 1, completionRate: 0.5 });
    expect(flexible).toMatchObject({ totalCount: 1, completedCount: 0 });
  });

  it("excludes one-off events, which are always fixed by construction", () => {
    // Counting them would stuff the "fixed" side with appointments and
    // make the comparison meaningless.
    const instances = [
      instance("2026-08-24", [
        block({ id: "e", kind: "event", flexibility: "fixed" }),
      ]),
    ];
    const buckets = computeFlexibilityBreakdown(instances, {});
    expect(buckets.every((b) => b.totalCount === 0)).toBe(true);
  });
});
