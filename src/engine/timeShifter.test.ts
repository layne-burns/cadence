import { describe, expect, it } from "vitest";
import { compressToFit, getShiftableBlocks, shiftSchedule } from "./timeShifter";
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

describe("shiftSchedule", () => {
  it("shifts a flexible block starting at/after now forward by the delta", () => {
    const result = shiftSchedule(DATE, DAY, template([routineBlock()]), [], 8 * 60, 30);
    const block = result.instance.blocks[0]!;
    expect(block.startMinutes).toBe(9 * 60 + 30);
    expect(block.endMinutes).toBe(11 * 60 + 30);
  });

  it("leaves a block that already started untouched", () => {
    // Block runs 9:00-11:00; "now" is 9:30, mid-block.
    const result = shiftSchedule(DATE, DAY, template([routineBlock()]), [], 9 * 60 + 30, 30);
    const block = result.instance.blocks[0]!;
    expect(block.startMinutes).toBe(9 * 60);
    expect(block.endMinutes).toBe(11 * 60);
  });

  it("never shifts a fixed routine block", () => {
    const fixedBlock = routineBlock({ id: "wake", flexibility: "fixed" });
    const result = shiftSchedule(DATE, DAY, template([fixedBlock]), [], 8 * 60, 60);
    expect(result.instance.blocks[0]!.startMinutes).toBe(9 * 60);
  });

  it("re-runs collision against fixed events after shifting, so splits stay correct", () => {
    // Block 9-11, event fixed at 10:00-10:30 (unaffected by the push).
    // After a 30-min push the block becomes 9:30-11:30 and should split
    // around the still-fixed event.
    const result = shiftSchedule(
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
    const result = shiftSchedule(
      DATE,
      DAY,
      template([shortBlock], 9 * 60 + 20),
      [],
      8 * 60,
      60,
    );
    expect(result.overflowMinutes).toBe(50);
  });

  it("reports the delta it actually applied", () => {
    const result = shiftSchedule(DATE, DAY, template([routineBlock()]), [], 8 * 60, 30);
    expect(result.appliedDeltaMinutes).toBe(30);
  });
});

describe("shiftSchedule pulling earlier", () => {
  it("moves a flexible block earlier by a negative delta", () => {
    // Block 9:00-11:00, now is 8:00, wake 7:00 — plenty of room.
    const result = shiftSchedule(DATE, DAY, template([routineBlock()]), [], 8 * 60, -30);
    const block = result.instance.blocks[0]!;
    expect(block.startMinutes).toBe(8 * 60 + 30);
    expect(block.endMinutes).toBe(10 * 60 + 30);
    expect(result.appliedDeltaMinutes).toBe(-30);
  });

  it("never pulls a block back before the current time", () => {
    // Block starts 9:00 and it's already 8:45, so only 15 minutes of
    // room exist even though 60 was asked for.
    const result = shiftSchedule(
      DATE,
      DAY,
      template([routineBlock()]),
      [],
      8 * 60 + 45,
      -60,
    );
    expect(result.appliedDeltaMinutes).toBe(-15);
    expect(result.instance.blocks[0]!.startMinutes).toBe(8 * 60 + 45);
  });

  it("never pulls a block before the day's wake time", () => {
    // Wake is 7:00 and "now" is earlier than that (an early riser
    // checking the app), so wake is the binding floor.
    const early = template([routineBlock({ startMinutes: 7 * 60 + 20, endMinutes: 8 * 60 })]);
    const result = shiftSchedule(DATE, DAY, early, [], 6 * 60, -60);
    expect(result.appliedDeltaMinutes).toBe(-20);
    expect(result.instance.blocks[0]!.startMinutes).toBe(7 * 60);
  });

  it("clamps uniformly so the spacing between blocks is preserved", () => {
    // Two blocks 30 minutes apart; the clamp is driven by the earliest
    // one, and both move by the same amount rather than bunching up.
    const blocks = [
      routineBlock({ id: "a", startMinutes: 9 * 60, endMinutes: 9 * 60 + 30 }),
      routineBlock({ id: "b", startMinutes: 10 * 60, endMinutes: 10 * 60 + 30 }),
    ];
    const result = shiftSchedule(DATE, DAY, template(blocks), [], 8 * 60 + 45, -60);

    expect(result.appliedDeltaMinutes).toBe(-15);
    const [first, second] = result.instance.blocks;
    expect(first!.startMinutes).toBe(8 * 60 + 45);
    expect(second!.startMinutes).toBe(9 * 60 + 45);
    // Still exactly an hour apart, as they were before the shift.
    expect(second!.startMinutes - first!.startMinutes).toBe(60);
  });

  it("does nothing when the schedule is already up against the floor", () => {
    const result = shiftSchedule(DATE, DAY, template([routineBlock()]), [], 9 * 60, -30);
    expect(result.appliedDeltaMinutes).toBe(0);
    expect(result.instance.blocks[0]!.startMinutes).toBe(9 * 60);
  });

  it("still leaves fixed blocks and events where they are", () => {
    const fixedBlock = routineBlock({ id: "class", flexibility: "fixed" });
    const result = shiftSchedule(DATE, DAY, template([fixedBlock]), [event()], 8 * 60, -30);
    const routine = result.instance.blocks.find((b) => b.kind === "routine")!;
    const evt = result.instance.blocks.find((b) => b.kind === "event")!;
    expect(routine.startMinutes).toBe(9 * 60);
    expect(evt.startMinutes).toBe(10 * 60);
  });

  it("cannot overflow wind-down when pulling earlier", () => {
    const result = shiftSchedule(DATE, DAY, template([routineBlock()]), [], 8 * 60, -30);
    expect(result.overflowMinutes).toBe(0);
  });
});

describe("getShiftableBlocks", () => {
  it("offers only flexible blocks that haven't started, in time order", () => {
    const blocks = [
      routineBlock({ id: "late", startMinutes: 14 * 60, endMinutes: 15 * 60 }),
      routineBlock({ id: "fixed", flexibility: "fixed", startMinutes: 11 * 60 }),
      routineBlock({ id: "past", startMinutes: 7 * 60, endMinutes: 8 * 60 }),
      routineBlock({ id: "soon", startMinutes: 10 * 60, endMinutes: 11 * 60 }),
    ];
    const shiftable = getShiftableBlocks(template(blocks), 9 * 60);
    expect(shiftable.map((b) => b.id)).toEqual(["soon", "late"]);
  });
});

describe("shiftSchedule with a subset selected", () => {
  const twoBlocks = () => [
    routineBlock({ id: "morning", startMinutes: 9 * 60, endMinutes: 10 * 60 }),
    routineBlock({ id: "afternoon", startMinutes: 14 * 60, endMinutes: 15 * 60 }),
  ];

  it("moves only the selected block and leaves the rest alone", () => {
    const result = shiftSchedule(
      DATE,
      DAY,
      template(twoBlocks()),
      [],
      8 * 60,
      30,
      { blockIds: ["afternoon"] },
    );
    const byId = new Map(result.instance.blocks.map((b) => [b.sourceId, b]));
    expect(byId.get("morning")!.startMinutes).toBe(9 * 60); // untouched
    expect(byId.get("afternoon")!.startMinutes).toBe(14 * 60 + 30);
  });

  it("shifts everything eligible when no subset is given", () => {
    const result = shiftSchedule(DATE, DAY, template(twoBlocks()), [], 8 * 60, 30);
    const byId = new Map(result.instance.blocks.map((b) => [b.sourceId, b]));
    expect(byId.get("morning")!.startMinutes).toBe(9 * 60 + 30);
    expect(byId.get("afternoon")!.startMinutes).toBe(14 * 60 + 30);
  });

  it("does nothing when the selection is empty", () => {
    const result = shiftSchedule(DATE, DAY, template(twoBlocks()), [], 8 * 60, 30, {
      blockIds: [],
    });
    const byId = new Map(result.instance.blocks.map((b) => [b.sourceId, b]));
    expect(byId.get("morning")!.startMinutes).toBe(9 * 60);
    expect(byId.get("afternoon")!.startMinutes).toBe(14 * 60);
  });

  it("clamps an earlier shift against only the selected blocks", () => {
    // "morning" starts at 9:00 and would bind the clamp, but it isn't
    // selected — the afternoon block has hours of room and should move
    // the full 60 minutes.
    const result = shiftSchedule(
      DATE,
      DAY,
      template(twoBlocks()),
      [],
      8 * 60 + 45,
      -60,
      { blockIds: ["afternoon"] },
    );
    expect(result.appliedDeltaMinutes).toBe(-60);
    const afternoon = result.instance.blocks.find((b) => b.sourceId === "afternoon")!;
    expect(afternoon.startMinutes).toBe(13 * 60);
  });

  it("ignores selected ids that aren't eligible to move anyway", () => {
    const blocks = [
      ...twoBlocks(),
      routineBlock({ id: "pinned", flexibility: "fixed", startMinutes: 11 * 60, endMinutes: 12 * 60 }),
    ];
    const result = shiftSchedule(DATE, DAY, template(blocks), [], 8 * 60, 30, {
      blockIds: ["pinned", "afternoon"],
    });
    const byId = new Map(result.instance.blocks.map((b) => [b.sourceId, b]));
    expect(byId.get("pinned")!.startMinutes).toBe(11 * 60); // fixed stays fixed
    expect(byId.get("afternoon")!.startMinutes).toBe(14 * 60 + 30);
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
