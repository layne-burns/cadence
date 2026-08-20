import { describe, expect, it } from "vitest";
import { compressToFit, pushSchedule } from "./timeShifter";
import type { RenderedBlock, RoutineBlock, OneOffEvent } from "../types/schedule";
import type { DayTemplate } from "../types/template";

const DATE = "2026-08-24";
const DAY = "monday" as const;

function routineBlock(overrides: Partial<RoutineBlock> = {}): RoutineBlock {
  return {
    id: "research",
    title: "Research",
    categoryId: "deep-research",
    startMinutes: 9 * 60,
    endMinutes: 11 * 60,
    flexibility: "flexible",
    ...overrides,
  };
}

function template(blocks: RoutineBlock[], windDownMinutes = 22 * 60): DayTemplate {
  return { day: DAY, wakeMinutes: 7 * 60, windDownMinutes, blocks };
}

function event(overrides: Partial<OneOffEvent> = {}): OneOffEvent {
  return {
    id: "meeting",
    date: DATE,
    title: "Meeting",
    startMinutes: 10 * 60,
    endMinutes: 10 * 60 + 30,
    ...overrides,
  };
}

function rendered(overrides: Partial<RenderedBlock> = {}): RenderedBlock {
  return {
    id: "block-1",
    kind: "routine",
    sourceId: "research",
    title: "Research",
    categoryId: "deep-research",
    startMinutes: 9 * 60,
    endMinutes: 10 * 60,
    flexibility: "flexible",
    ...overrides,
  };
}

describe("pushSchedule", () => {
  it("shifts a flexible block starting at/after now forward by the delta", () => {
    const result = pushSchedule(DATE, DAY, template([routineBlock()]), [], 8 * 60, 30);
    const block = result.instance.blocks[0]!;
    expect(block.startMinutes).toBe(9 * 60 + 30);
    expect(block.endMinutes).toBe(11 * 60 + 30);
  });

  it("leaves a block that already started untouched", () => {
    // Block runs 9:00-11:00; "now" is 9:30, mid-block.
    const result = pushSchedule(DATE, DAY, template([routineBlock()]), [], 9 * 60 + 30, 30);
    const block = result.instance.blocks[0]!;
    expect(block.startMinutes).toBe(9 * 60);
    expect(block.endMinutes).toBe(11 * 60);
  });

  it("never shifts a fixed routine block", () => {
    const fixedBlock = routineBlock({ id: "wake", flexibility: "fixed" });
    const result = pushSchedule(DATE, DAY, template([fixedBlock]), [], 8 * 60, 60);
    expect(result.instance.blocks[0]!.startMinutes).toBe(9 * 60);
  });

  it("re-runs collision against fixed events after shifting, so splits stay correct", () => {
    // Block 9-11, event fixed at 10:00-10:30 (unaffected by the push).
    // After a 30-min push the block becomes 9:30-11:30 and should split
    // around the still-fixed event.
    const result = pushSchedule(
      DATE,
      DAY,
      template([routineBlock()]),
      [event()],
      8 * 60,
      30,
    );

    const eventBlock = result.instance.blocks.find((b) => b.kind === "event")!;
    expect(eventBlock.startMinutes).toBe(10 * 60);
    expect(eventBlock.endMinutes).toBe(10 * 60 + 30);

    const routineParts = result.instance.blocks.filter((b) => b.kind === "routine");
    expect(routineParts.map((b) => [b.startMinutes, b.endMinutes])).toEqual([
      [9 * 60 + 30, 10 * 60],
      [10 * 60 + 30, 11 * 60 + 30],
    ]);
  });

  it("reports remaining overflow when compression floors out before fully absorbing the push", () => {
    // A short 15-min block leaves little to compress: pushed by 60 from
    // 9:00-9:15 to 10:00-10:15, against a 9:20 wind-down. Compression can
    // only reclaim 5 min (15 - the 10-min floor) of the 55-min overflow.
    const shortBlock = routineBlock({ endMinutes: 9 * 60 + 15 });
    const result = pushSchedule(
      DATE,
      DAY,
      template([shortBlock], 9 * 60 + 20),
      [],
      8 * 60,
      60,
    );
    expect(result.overflowMinutes).toBe(50);
  });
});

describe("compressToFit", () => {
  it("returns unchanged with zero overflow when everything already fits", () => {
    const blocks = [rendered({ endMinutes: 10 * 60 })];
    const result = compressToFit(blocks, 22 * 60);
    expect(result).toEqual({ blocks, overflowMinutes: 0 });
  });

  it("partially shrinks a trailing buffer block to absorb overflow", () => {
    const blocks = [
      rendered({ id: "a", startMinutes: 9 * 60, endMinutes: 10 * 60 }),
      rendered({
        id: "b",
        kind: "buffer",
        sourceId: null,
        startMinutes: 10 * 60,
        endMinutes: 10 * 60 + 40,
      }),
    ];
    // Wind-down 10:10 -> buffer (10:00-10:40) overflows by 30, has 40 min
    // of capacity (no floor) -> shrinks to 10:00-10:10, fully absorbed.
    const result = compressToFit(blocks, 10 * 60 + 10);
    expect(result.overflowMinutes).toBe(0);
    expect(result.blocks).toHaveLength(2);
    expect(result.blocks[1]!.endMinutes).toBe(10 * 60 + 10);
  });

  it("fully consumes a trailing buffer and falls through to shrink the block before it", () => {
    const blocks = [
      rendered({
        id: "a",
        startMinutes: 9 * 60,
        endMinutes: 10 * 60 + 30, // 90 min, flexible routine
      }),
      rendered({
        id: "b",
        kind: "buffer",
        sourceId: null,
        startMinutes: 10 * 60 + 30,
        endMinutes: 10 * 60 + 40, // 10-min buffer
      }),
    ];
    // Wind-down 10:00. Overflow starts at 40 (buffer ends 10:40). Buffer
    // has only 10 min capacity -> fully consumed and removed, 30 min
    // overflow remains against block "a" (ends 10:30, floor 10 -> 80 min
    // capacity), which absorbs the rest.
    const result = compressToFit(blocks, 10 * 60);
    expect(result.overflowMinutes).toBe(0);
    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0]!.id).toBe("a");
    expect(result.blocks[0]!.endMinutes).toBe(10 * 60);
  });

  it("stops at a fixed event and reports the remaining overflow", () => {
    const blocks = [
      rendered({ id: "a", endMinutes: 9 * 60 + 30 }),
      rendered({
        id: "b",
        kind: "event",
        sourceId: "meeting",
        flexibility: "fixed",
        startMinutes: 9 * 60 + 30,
        endMinutes: 10 * 60,
      }),
    ];
    const result = compressToFit(blocks, 9 * 60 + 45);
    expect(result.overflowMinutes).toBe(15);
    expect(result.blocks).toEqual(blocks); // untouched
  });

  it("stops at a fixed-flexibility routine block and reports remaining overflow", () => {
    const blocks = [
      rendered({ id: "wake", flexibility: "fixed", startMinutes: 6 * 60, endMinutes: 7 * 60 }),
    ];
    const result = compressToFit(blocks, 6 * 60 + 45);
    expect(result.overflowMinutes).toBe(15);
  });

  it("shrinks a flexible routine block only down to the 10-minute floor, not further", () => {
    // 30-min block, wind-down demands shrinking by 25 (down to 5 min) —
    // only 20 min is actually available before hitting the floor.
    const blocks = [rendered({ startMinutes: 9 * 60, endMinutes: 9 * 60 + 30 })];
    const result = compressToFit(blocks, 9 * 60 + 5);
    expect(result.blocks[0]!.endMinutes).toBe(9 * 60 + 10); // floored at 10 min
    expect(result.overflowMinutes).toBe(5); // 9:10 - 9:05 remaining
  });

  it("does not reach past a gap to compress an earlier block that can't help", () => {
    // a (9:00-9:30) ... gap ... b, flexible, ends past wind-down and gets
    // floored — a is never touched because compressing it can't reduce
    // the day's actual end time.
    const blocks = [
      rendered({ id: "a", startMinutes: 9 * 60, endMinutes: 9 * 60 + 30 }),
      rendered({ id: "b", startMinutes: 10 * 60, endMinutes: 10 * 60 + 30 }),
    ];
    const result = compressToFit(blocks, 10 * 60 + 5);
    expect(result.blocks[0]).toEqual(blocks[0]); // "a" untouched
    expect(result.blocks[1]!.endMinutes).toBe(10 * 60 + 10); // floored
    expect(result.overflowMinutes).toBe(5);
  });
});
