import { describe, expect, it } from "vitest";
import { MIN_FRAGMENT_MINUTES, getCurrentAndNext, renderDailyInstance } from "./scheduler";
import type { OneOffEvent, RoutineBlock } from "../types/schedule";
import type { DayTemplate } from "../types/template";

const DATE = "2026-08-24"; // a Monday, arbitrary
const DAY = "monday" as const;

function block(overrides: Partial<RoutineBlock> = {}): RoutineBlock {
  return {
    id: "research",
    title: "Research",
    categoryId: "deep-research",
    startMinutes: 8.5 * 60, // 08:30
    endMinutes: 11.5 * 60, // 11:30
    flexibility: "flexible",
    ...overrides,
  };
}

function template(blocks: RoutineBlock[]): DayTemplate {
  return {
    day: DAY,
    wakeMinutes: 7 * 60,
    windDownMinutes: 22 * 60,
    blocks,
  };
}

function event(overrides: Partial<OneOffEvent> = {}): OneOffEvent {
  return {
    id: "meeting",
    date: DATE,
    title: "Committee Meeting",
    startMinutes: 9.5 * 60, // 09:30
    endMinutes: 10.5 * 60, // 10:30
    ...overrides,
  };
}

describe("renderDailyInstance", () => {
  it("leaves a block untouched, with no partIndex, when no event overlaps it", () => {
    const instance = renderDailyInstance(DATE, DAY, template([block()]), []);

    expect(instance.blocks).toHaveLength(1);
    expect(instance.blocks[0]).toMatchObject({
      kind: "routine",
      sourceId: "research",
      partIndex: undefined,
      startMinutes: 8.5 * 60,
      endMinutes: 11.5 * 60,
    });
  });

  it("splits a block in two around a mid-overlap event (the spec's own example)", () => {
    const instance = renderDailyInstance(
      DATE,
      DAY,
      template([block()]),
      [event()],
    );

    // Research (Part 1): 08:30–09:30, Meeting: 09:30–10:30, Research (Part 2): 10:30–11:30
    expect(instance.blocks.map((b) => [b.kind, b.startMinutes, b.endMinutes])).toEqual([
      ["routine", 8.5 * 60, 9.5 * 60],
      ["event", 9.5 * 60, 10.5 * 60],
      ["routine", 10.5 * 60, 11.5 * 60],
    ]);

    const [part1, , part2] = instance.blocks;
    expect(part1).toMatchObject({ sourceId: "research", partIndex: 1 });
    expect(part2).toMatchObject({ sourceId: "research", partIndex: 2 });
  });

  it("shrinks a block from the front when an event covers its left edge", () => {
    const instance = renderDailyInstance(
      DATE,
      DAY,
      template([block()]),
      [event({ startMinutes: 8 * 60, endMinutes: 9 * 60 })],
    );

    const routine = instance.blocks.filter((b) => b.kind === "routine");
    expect(routine).toHaveLength(1);
    expect(routine[0]).toMatchObject({
      startMinutes: 9 * 60,
      endMinutes: 11.5 * 60,
      partIndex: undefined,
    });
  });

  it("shrinks a block from the back when an event covers its right edge", () => {
    const instance = renderDailyInstance(
      DATE,
      DAY,
      template([block()]),
      [event({ startMinutes: 11 * 60, endMinutes: 12 * 60 })],
    );

    const routine = instance.blocks.filter((b) => b.kind === "routine");
    expect(routine).toHaveLength(1);
    expect(routine[0]).toMatchObject({
      startMinutes: 8.5 * 60,
      endMinutes: 11 * 60,
      partIndex: undefined,
    });
  });

  it("fully suppresses a block that an event completely covers", () => {
    const instance = renderDailyInstance(
      DATE,
      DAY,
      template([block()]),
      [event({ startMinutes: 8 * 60, endMinutes: 12 * 60 })],
    );

    expect(instance.blocks.filter((b) => b.kind === "routine")).toHaveLength(0);
    expect(instance.blocks).toHaveLength(1); // just the event
    expect(instance.blocks[0]?.kind).toBe("event");
  });

  it("also suppresses a block an event covers exactly, edge to edge", () => {
    const instance = renderDailyInstance(
      DATE,
      DAY,
      template([block()]),
      [event({ startMinutes: 8.5 * 60, endMinutes: 11.5 * 60 })],
    );

    expect(instance.blocks.filter((b) => b.kind === "routine")).toHaveLength(0);
  });

  it("discards a remainder under the 10-minute threshold and turns it into a buffer block", () => {
    // Block 08:00–09:00, event 08:00–08:55 leaves a 5-minute remainder.
    const instance = renderDailyInstance(
      DATE,
      DAY,
      template([block({ startMinutes: 8 * 60, endMinutes: 9 * 60 })]),
      [event({ startMinutes: 8 * 60, endMinutes: 8 * 60 + 55 })],
    );

    expect(instance.blocks.filter((b) => b.kind === "routine")).toHaveLength(0);
    const buffer = instance.blocks.find((b) => b.kind === "buffer");
    expect(buffer).toMatchObject({
      sourceId: null,
      categoryId: null,
      startMinutes: 8 * 60 + 55,
      endMinutes: 9 * 60,
    });
  });

  it("keeps a remainder that is exactly the 10-minute threshold (< is strict)", () => {
    // Block 08:00–09:00, event 08:00–08:50 leaves exactly 10 minutes.
    const instance = renderDailyInstance(
      DATE,
      DAY,
      template([block({ startMinutes: 8 * 60, endMinutes: 9 * 60 })]),
      [event({ startMinutes: 8 * 60, endMinutes: 8 * 60 + 50 })],
    );

    const routine = instance.blocks.filter((b) => b.kind === "routine");
    expect(routine).toHaveLength(1);
    expect(routine[0]!.endMinutes - routine[0]!.startMinutes).toBe(
      MIN_FRAGMENT_MINUTES,
    );
    expect(instance.blocks.some((b) => b.kind === "buffer")).toBe(false);
  });

  it("applies multiple non-overlapping events against the same block in one pass", () => {
    // Block 08:00–12:00 gets bitten by two separate meetings.
    const instance = renderDailyInstance(
      DATE,
      DAY,
      template([block({ startMinutes: 8 * 60, endMinutes: 12 * 60 })]),
      [
        event({ id: "standup", startMinutes: 9 * 60, endMinutes: 9 * 60 + 15 }),
        event({
          id: "review",
          startMinutes: 10 * 60 + 30,
          endMinutes: 11 * 60,
        }),
      ],
    );

    const routine = instance.blocks.filter((b) => b.kind === "routine");
    expect(routine.map((b) => [b.startMinutes, b.endMinutes])).toEqual([
      [8 * 60, 9 * 60],
      [9 * 60 + 15, 10 * 60 + 30],
      [11 * 60, 12 * 60],
    ]);
    expect(routine.map((b) => b.partIndex)).toEqual([1, 2, 3]);
  });

  it("renders a standalone event with no underlying routine block untouched", () => {
    const instance = renderDailyInstance(DATE, DAY, template([]), [
      event({ startMinutes: 13 * 60, endMinutes: 14 * 60 }),
    ]);

    expect(instance.blocks).toHaveLength(1);
    expect(instance.blocks[0]).toMatchObject({ kind: "event", flexibility: "fixed" });
  });

  it("produces identical block ids across repeated runs with unchanged input", () => {
    const t = template([block()]);
    const events = [event()];

    const first = renderDailyInstance(DATE, DAY, t, events);
    const second = renderDailyInstance(DATE, DAY, t, events);

    expect(second.blocks.map((b) => b.id)).toEqual(first.blocks.map((b) => b.id));
  });

  it("gives split parts different ids than the original unsplit block would have had", () => {
    const withoutEvent = renderDailyInstance(DATE, DAY, template([block()]), []);
    const withEvent = renderDailyInstance(DATE, DAY, template([block()]), [event()]);

    const originalId = withoutEvent.blocks[0]?.id;
    const splitIds = withEvent.blocks.filter((b) => b.kind === "routine").map((b) => b.id);

    expect(splitIds).not.toContain(originalId);
    expect(new Set(splitIds).size).toBe(2);
  });

  it("copies wake/wind-down minutes from the template onto the rendered instance", () => {
    const instance = renderDailyInstance(
      DATE,
      DAY,
      { ...template([]), wakeMinutes: 6 * 60 + 30, windDownMinutes: 23 * 60 },
      [],
    );

    expect(instance.wakeMinutes).toBe(6 * 60 + 30);
    expect(instance.windDownMinutes).toBe(23 * 60);
  });
});

describe("getCurrentAndNext", () => {
  it("picks the block containing now as current, and the next-starting one as next", () => {
    const instance = renderDailyInstance(
      DATE,
      DAY,
      template([
        block({ id: "a", startMinutes: 8 * 60, endMinutes: 9 * 60 }),
        block({ id: "b", startMinutes: 9 * 60, endMinutes: 10 * 60 }),
      ]),
      [],
    );

    const { current, next } = getCurrentAndNext(instance, 8 * 60 + 30);
    expect(current?.sourceId).toBe("a");
    expect(next?.sourceId).toBe("b");
  });

  it("returns null current between blocks, with next still pointing ahead", () => {
    const instance = renderDailyInstance(
      DATE,
      DAY,
      template([
        block({ id: "a", startMinutes: 8 * 60, endMinutes: 9 * 60 }),
        block({ id: "b", startMinutes: 9 * 60 + 30, endMinutes: 10 * 60 }),
      ]),
      [],
    );

    const { current, next } = getCurrentAndNext(instance, 9 * 60 + 10);
    expect(current).toBeNull();
    expect(next?.sourceId).toBe("b");
  });

  it("returns null for both once the day's blocks are exhausted", () => {
    const instance = renderDailyInstance(
      DATE,
      DAY,
      template([block({ startMinutes: 8 * 60, endMinutes: 9 * 60 })]),
      [],
    );

    const { current, next } = getCurrentAndNext(instance, 20 * 60);
    expect(current).toBeNull();
    expect(next).toBeNull();
  });

  it("treats a block's end minute as exclusive (back-to-back blocks hand off cleanly)", () => {
    const instance = renderDailyInstance(
      DATE,
      DAY,
      template([
        block({ id: "a", startMinutes: 8 * 60, endMinutes: 9 * 60 }),
        block({ id: "b", startMinutes: 9 * 60, endMinutes: 10 * 60 }),
      ]),
      [],
    );

    const { current, next } = getCurrentAndNext(instance, 9 * 60);
    expect(current?.sourceId).toBe("b");
    expect(next).toBeNull();
  });
});
