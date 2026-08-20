/**
 * The collision engine: turns a day's `DayTemplate` (recurring blueprint)
 * plus that day's `OneOffEvent[]` into a `DailyInstance` — the blocks that
 * actually render on the calendar for that specific date.
 *
 * This module never mutates the blueprint. It recomputes the render from
 * scratch every time it's called, which is what lets `timeShifter.ts`
 * (Phase 5) shift blocks around and just re-run this same function to get
 * a consistent picture, and what makes a fresh event added later "just
 * work" without any incremental-update bookkeeping.
 *
 * The core trick is one function, `clipIntervalByEvent`: given a block
 * interval and an overlapping event interval, it returns whatever's left
 * of the block on either side. Middle-overlap (split), left-edge overlap
 * (shrink from the front), right-edge overlap (shrink from the back), and
 * full occlusion (nothing left) all fall out of that one function — they
 * aren't special-cased separately.
 */

import type {
  BlockKind,
  DailyInstance,
  DayOfWeek,
  Flexibility,
  OneOffEvent,
  RenderedBlock,
} from "../types/schedule";
import type { DayTemplate } from "../types/template";

/** Fragments shorter than this are discarded rather than shown as a sliver
 * block — the leftover time becomes open buffer instead. Per spec: this is
 * a "smaller than" threshold, so a fragment of exactly 10 minutes survives. */
export const MIN_FRAGMENT_MINUTES = 10;

interface Interval {
  startMinutes: number;
  endMinutes: number;
}

/** A routine block as it's being carved up while events are applied. Kept
 * separate from `RenderedBlock` because it doesn't have a final `id` (or
 * known `partIndex`) yet — those are only assigned once every event has
 * been applied and we know how many pieces of each source block survived. */
interface RoutineFragment extends Interval {
  sourceId: string;
  title: string;
  categoryId: string;
  color: string | undefined;
  flexibility: Flexibility;
}

function overlaps(a: Interval, b: Interval): boolean {
  return a.startMinutes < b.endMinutes && a.endMinutes > b.startMinutes;
}

/**
 * The one piece of interval math this whole module rests on. Given a block
 * and an event known to overlap it, return the block's remaining pieces
 * (0, 1, or 2 of them):
 *
 *   - 2 pieces → the event was in the middle: the block splits in two.
 *   - 1 piece  → the event touched one edge: the block shrinks.
 *   - 0 pieces → the event covered the whole block: full occlusion.
 */
function clipIntervalByEvent(block: Interval, event: Interval): Interval[] {
  const pieces: Interval[] = [];
  if (event.startMinutes > block.startMinutes) {
    pieces.push({
      startMinutes: block.startMinutes,
      endMinutes: event.startMinutes,
    });
  }
  if (event.endMinutes < block.endMinutes) {
    pieces.push({
      startMinutes: event.endMinutes,
      endMinutes: block.endMinutes,
    });
  }
  return pieces;
}

/** Deterministic id for a rendered block: same source + same final interval
 * always produces the same id, so re-running the engine (e.g. after adding
 * an unrelated event elsewhere in the day) doesn't orphan existing
 * check-ins for blocks whose geometry didn't actually change. */
function renderedBlockId(
  sourceId: string | null,
  startMinutes: number,
  endMinutes: number,
): string {
  return `${sourceId ?? "buffer"}::${startMinutes}-${endMinutes}`;
}

function byStart(a: Interval, b: Interval): number {
  return a.startMinutes - b.startMinutes;
}

/**
 * Render one calendar date from its weekday template and that date's
 * one-off events. `events` should already be filtered to the date being
 * rendered — this function doesn't look at `OneOffEvent.date` itself, so
 * that filtering (and mapping a date to the right weekday template) is a
 * caller/hook concern, not this one.
 *
 * Events are assumed not to overlap each other; overlapping events aren't
 * clipped against one another, only against routine blocks, since the
 * spec doesn't define what conflicting appointments should mean.
 */
export function renderDailyInstance(
  date: string,
  dayOfWeek: DayOfWeek,
  template: DayTemplate,
  events: OneOffEvent[],
): DailyInstance {
  let fragments: RoutineFragment[] = template.blocks.map((block) => ({
    sourceId: block.id,
    title: block.title,
    categoryId: block.categoryId,
    color: block.color,
    flexibility: block.flexibility,
    startMinutes: block.startMinutes,
    endMinutes: block.endMinutes,
  }));

  const sortedEvents = [...events].sort(byStart);

  for (const event of sortedEvents) {
    fragments = fragments.flatMap((fragment) => {
      if (!overlaps(fragment, event)) return [fragment];
      return clipIntervalByEvent(fragment, event).map((piece) => ({
        ...fragment,
        startMinutes: piece.startMinutes,
        endMinutes: piece.endMinutes,
      }));
    });
  }

  const survivors: RoutineFragment[] = [];
  const discarded: Interval[] = [];
  for (const fragment of fragments) {
    const duration = fragment.endMinutes - fragment.startMinutes;
    if (duration < MIN_FRAGMENT_MINUTES) {
      discarded.push(fragment);
    } else {
      survivors.push(fragment);
    }
  }

  // Group surviving fragments by source block so a block that got split
  // (however many events it took to do it) gets 1-based part numbers, and
  // a block nothing happened to keeps `partIndex` undefined.
  const bySource = new Map<string, RoutineFragment[]>();
  for (const fragment of survivors) {
    const group = bySource.get(fragment.sourceId);
    if (group) {
      group.push(fragment);
    } else {
      bySource.set(fragment.sourceId, [fragment]);
    }
  }

  const routineBlocks: RenderedBlock[] = [];
  for (const group of bySource.values()) {
    group.sort(byStart);
    const isSplit = group.length > 1;
    group.forEach((fragment, index) => {
      routineBlocks.push({
        id: renderedBlockId(
          fragment.sourceId,
          fragment.startMinutes,
          fragment.endMinutes,
        ),
        kind: "routine" satisfies BlockKind,
        sourceId: fragment.sourceId,
        partIndex: isSplit ? index + 1 : undefined,
        title: fragment.title,
        categoryId: fragment.categoryId,
        color: fragment.color,
        startMinutes: fragment.startMinutes,
        endMinutes: fragment.endMinutes,
        flexibility: fragment.flexibility,
      });
    });
  }

  // Buffers are flexible by construction — they're literally leftover open
  // time, which is exactly what timeShifter.ts should feel free to
  // compress first when a "running late" push runs out of room.
  const bufferBlocks: RenderedBlock[] = discarded.map((interval) => ({
    id: renderedBlockId(null, interval.startMinutes, interval.endMinutes),
    kind: "buffer" satisfies BlockKind,
    sourceId: null,
    title: "Buffer",
    categoryId: null,
    startMinutes: interval.startMinutes,
    endMinutes: interval.endMinutes,
    flexibility: "flexible",
  }));

  const eventBlocks: RenderedBlock[] = sortedEvents.map((event) => ({
    id: renderedBlockId(event.id, event.startMinutes, event.endMinutes),
    kind: "event" satisfies BlockKind,
    sourceId: event.id,
    title: event.title,
    categoryId: event.categoryId ?? null,
    color: event.color,
    startMinutes: event.startMinutes,
    endMinutes: event.endMinutes,
    // One-offs are the thing the blueprint bends around — they never move
    // under the "running late" push tool, so they're always `fixed` here
    // regardless of anything on the source event.
    flexibility: "fixed",
  }));

  const blocks = [...routineBlocks, ...bufferBlocks, ...eventBlocks].sort(
    byStart,
  );

  return {
    date,
    dayOfWeek,
    wakeMinutes: template.wakeMinutes,
    windDownMinutes: template.windDownMinutes,
    blocks,
  };
}

export interface CurrentAndNext {
  current: RenderedBlock | null;
  next: RenderedBlock | null;
}

/**
 * Picks out "what's happening right now" and "what's after it" from an
 * already-rendered day — the core of the Now & Next focus widget. Pure
 * function of `(instance, nowMinutes)` rather than reading the clock
 * itself, so it's testable without faking time and so the UI can pass in
 * a session-nudged instance (see useSchedule's "+10 min" / skip handling)
 * without this needing to know nudges exist.
 */
export function getCurrentAndNext(
  instance: DailyInstance,
  nowMinutes: number,
): CurrentAndNext {
  // `instance.blocks` is already sorted by start time by renderDailyInstance.
  const current =
    instance.blocks.find(
      (block) =>
        block.startMinutes <= nowMinutes && nowMinutes < block.endMinutes,
    ) ?? null;
  const next =
    instance.blocks.find((block) => block.startMinutes > nowMinutes) ?? null;
  return { current, next };
}
