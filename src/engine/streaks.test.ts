import { describe, expect, it } from "vitest";
import {
  applyDayOutcome,
  computeCompletionRatio,
  computeDayOutcome,
  recordDay,
  SUCCESS_THRESHOLD,
} from "./streaks";
import { createEmptyStreakState } from "../types/adherence";
import type { AdherenceLog } from "../types/adherence";
import type { DailyInstance, RenderedBlock } from "../types/schedule";

function block(overrides: Partial<RenderedBlock> = {}): RenderedBlock {
  return {
    id: "b1",
    kind: "routine",
    sourceId: "src",
    title: "Block",
    categoryId: "cat",
    startMinutes: 9 * 60,
    endMinutes: 10 * 60,
    flexibility: "flexible",
    ...overrides,
  };
}

function instance(blocks: RenderedBlock[], date = "2026-08-24"): DailyInstance {
  return { date, dayOfWeek: "monday", wakeMinutes: 7 * 60, windDownMinutes: 22 * 60, blocks };
}

function log(renderedBlockId: string, completed: boolean): AdherenceLog {
  return {
    id: `log-${renderedBlockId}`,
    date: "2026-08-24",
    renderedBlockId,
    blockTitle: "Block",
    categoryId: "cat",
    completed,
    loggedAt: "2026-08-24T12:00:00.000Z",
  };
}

describe("computeCompletionRatio", () => {
  it("returns 1 when nothing is scheduled", () => {
    expect(computeCompletionRatio(instance([]), [])).toBe(1);
  });

  it("ignores buffer blocks entirely", () => {
    const inst = instance([
      block({ id: "a" }),
      block({ id: "buf", kind: "buffer", sourceId: null }),
    ]);
    expect(computeCompletionRatio(inst, [log("a", true)])).toBe(1); // 1/1, buffer excluded
  });

  it("counts both routine and event blocks as scheduled", () => {
    const inst = instance([
      block({ id: "a", kind: "routine" }),
      block({ id: "b", kind: "event", flexibility: "fixed" }),
    ]);
    expect(computeCompletionRatio(inst, [log("a", true)])).toBe(0.5);
  });

  it("computes a fractional ratio", () => {
    const inst = instance([block({ id: "a" }), block({ id: "b" }), block({ id: "c" }), block({ id: "d" })]);
    const logs = [log("a", true), log("b", true), log("c", true), log("d", false)];
    expect(computeCompletionRatio(inst, logs)).toBe(0.75);
  });
});

describe("computeDayOutcome", () => {
  it("succeeds exactly at the 75% threshold", () => {
    const inst = instance([block({ id: "a" }), block({ id: "b" }), block({ id: "c" }), block({ id: "d" })]);
    const logs = [log("a", true), log("b", true), log("c", true), log("d", false)];
    const outcome = computeDayOutcome("2026-08-24", inst, logs);
    expect(outcome.completionRatio).toBe(SUCCESS_THRESHOLD);
    expect(outcome.succeeded).toBe(true);
  });

  it("fails just below the threshold", () => {
    const inst = instance([block({ id: "a" }), block({ id: "b" }), block({ id: "c" })]);
    const logs = [log("a", true)]; // 1/3 ≈ 0.33
    expect(computeDayOutcome("2026-08-24", inst, logs).succeeded).toBe(false);
  });
});

describe("applyDayOutcome", () => {
  const succeed = (date: string) => ({ date, completionRatio: 1, succeeded: true });
  const fail = (date: string) => ({ date, completionRatio: 0, succeeded: false });

  it("extends the streak on success and tracks the longest streak", () => {
    let state = createEmptyStreakState();
    state = applyDayOutcome(state, succeed("2026-08-20"));
    state = applyDayOutcome(state, succeed("2026-08-21"));
    expect(state.currentStreak).toBe(2);
    expect(state.longestStreak).toBe(2);
  });

  it("spends a grace day on a miss instead of resetting the streak", () => {
    let state = createEmptyStreakState();
    state = applyDayOutcome(state, succeed("2026-08-20"));
    state = applyDayOutcome(state, succeed("2026-08-21"));
    state = applyDayOutcome(state, fail("2026-08-22"));

    expect(state.currentStreak).toBe(2); // preserved, not extended
    expect(state.graceDayDatesUsed).toContain("2026-08-22");
    expect(state.history.at(-1)).toMatchObject({ date: "2026-08-22", usedGraceDay: true });
  });

  it("resets the streak on a second miss within the same rolling 7-day window", () => {
    let state = createEmptyStreakState();
    state = applyDayOutcome(state, succeed("2026-08-20"));
    state = applyDayOutcome(state, fail("2026-08-21")); // grace day spent
    state = applyDayOutcome(state, fail("2026-08-23")); // 2 days later, still within 7

    expect(state.currentStreak).toBe(0);
    expect(state.history.at(-1)).toMatchObject({ date: "2026-08-23", usedGraceDay: false });
  });

  it("grants a fresh grace day once the prior one ages out of the 7-day window", () => {
    let state = createEmptyStreakState();
    state = applyDayOutcome(state, succeed("2026-08-01"));
    state = applyDayOutcome(state, fail("2026-08-02")); // grace day spent on Aug 2

    // Aug 9 is 7 days after Aug 2 — daysBetween == 7, outside the "< 7" window.
    state = applyDayOutcome(state, fail("2026-08-09"));

    expect(state.history.at(-1)).toMatchObject({ date: "2026-08-09", usedGraceDay: true });
    expect(state.currentStreak).toBe(1); // preserved from before the first miss
  });

  it("keeps the longest-streak record after a later reset", () => {
    let state = createEmptyStreakState();
    state = applyDayOutcome(state, succeed("2026-08-01"));
    state = applyDayOutcome(state, succeed("2026-08-02"));
    state = applyDayOutcome(state, succeed("2026-08-03"));
    // Two misses close together burns the grace day then resets.
    state = applyDayOutcome(state, fail("2026-08-04"));
    state = applyDayOutcome(state, fail("2026-08-05"));

    expect(state.currentStreak).toBe(0);
    expect(state.longestStreak).toBe(3);
  });

  it("prunes grace-day tracking entries older than the tracking window", () => {
    let state = createEmptyStreakState();
    state = applyDayOutcome(state, fail("2026-08-01")); // grace day used
    // Jump well past GRACE_TRACKING_DAYS (14) — the Aug 1 entry should be
    // pruned from graceDayDatesUsed, independent of whether it would have
    // still blocked a fresh grace day.
    state = applyDayOutcome(state, succeed("2026-09-01"));
    expect(state.graceDayDatesUsed).not.toContain("2026-08-01");
  });
});

describe("recordDay", () => {
  it("combines outcome computation and streak update in one call", () => {
    const inst = instance([block({ id: "a" })]);
    const state = recordDay(createEmptyStreakState(), "2026-08-24", inst, [log("a", true)]);
    expect(state.currentStreak).toBe(1);
    expect(state.history[0]).toMatchObject({ date: "2026-08-24", succeeded: true });
  });
});
