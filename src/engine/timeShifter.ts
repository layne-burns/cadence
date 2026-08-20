/**
 * The schedule-shift tool: move today's remaining flexible blocks by
 * 15/30/45/60 minutes in **either** direction, then re-render so the
 * collision engine naturally re-splits/re-shrinks them against whatever
 * fixed events are still ahead. If a later shift runs the day past
 * wind-down, best-effort compress trailing buffer/flexible time to try to
 * make it fit.
 *
 * This started as a one-way "running late" push. Running *ahead* turns
 * out to be the same operation with the sign flipped — the only asymmetry
 * is that pulling earlier needs a floor (you can't start something in the
 * past) where pushing later needs a ceiling (wind-down).
 *
 * Compression is the subtle part, worth spelling out: only the block that
 * currently ends *last* in the day can affect whether the day now ends
 * past wind-down — because blocks never overlap, whichever one starts
 * latest also ends latest. Shrinking some *other*, earlier block (even a
 * buffer block sitting right next to a gap) does not move anything after
 * it, so it cannot reduce how late the day ends. That means compression
 * only ever touches the tail block — and only continues on to the
 * previous block if the tail buffer gets fully consumed and removed,
 * genuinely exposing that previous block as the new tail. A flexible
 * routine block that's shrunk down to the 10-minute floor stays put
 * (never removed) and stops the process there, even if overflow remains.
 */

import { MIN_FRAGMENT_MINUTES, renderDailyInstance } from "./scheduler";
import type {
  DailyInstance,
  DayOfWeek,
  OneOffEvent,
  RenderedBlock,
  RoutineBlock,
} from "../types/schedule";
import type { DayTemplate } from "../types/template";

export type ShiftMagnitudeMinutes = 15 | 30 | 45 | 60;

/** Signed: negative pulls the rest of the day earlier, positive pushes it
 * later. Running late and running ahead are the same operation with the
 * sign flipped. */
export type ShiftDeltaMinutes =
  | -60
  | -45
  | -30
  | -15
  | ShiftMagnitudeMinutes;

/**
 * The blocks a shift is allowed to move: flexible routine blocks that
 * haven't started yet. Exported so the UI offers exactly the set the
 * engine will act on, rather than deriving its own list from rendered
 * blocks and drifting out of agreement.
 *
 * Returns template blocks, not rendered ones, because a routine block
 * split around an event renders as two parts sharing one source — the
 * user picks "Flashcards Review" once and both parts move together.
 */
export function getShiftableBlocks(
  template: DayTemplate,
  nowMinutes: number,
): RoutineBlock[] {
  return template.blocks
    .filter(
      (block) => block.flexibility === "flexible" && block.startMinutes >= nowMinutes,
    )
    .sort((a, b) => a.startMinutes - b.startMinutes);
}

export interface ShiftScheduleOptions {
  /**
   * Restrict the shift to these template block ids. Omitted means every
   * eligible block moves, which is the common case and the UI default.
   *
   * Selecting a subset is deliberately allowed to open gaps or close
   * them — moving the afternoon back while the morning stays put is a
   * legitimate thing to want, and the collision engine re-runs either
   * way, so overlaps against fixed events are still resolved correctly.
   */
  blockIds?: string[];
}

export interface ShiftScheduleResult {
  instance: DailyInstance;
  /** Minutes still hanging past wind-down after best-effort compression —
   * 0 means everything fit. Only ever non-zero for a later shift. */
  overflowMinutes: number;
  /**
   * What was actually applied, which can be smaller in magnitude than
   * requested when pulling earlier: blocks are never moved before the
   * current time or the day's wake time. The UI reports this so a
   * clamped shift doesn't look like it silently did the wrong thing.
   */
  appliedDeltaMinutes: number;
}

function isCompressible(block: RenderedBlock): boolean {
  if (block.kind === "buffer") return true;
  if (block.kind === "routine") return block.flexibility === "flexible";
  return false; // "event" — fixed, one-offs never move or shrink
}

/** Best-effort: shrinks (and, for fully-consumed buffers, removes)
 * trailing blocks until the day's end fits within `windDownMinutes` or
 * nothing more can be reclaimed. See the file-level comment for why this
 * only ever touches the tail. */
export function compressToFit(
  blocks: RenderedBlock[],
  windDownMinutes: number,
): { blocks: RenderedBlock[]; overflowMinutes: number } {
  const result = [...blocks];

  while (result.length > 0) {
    const tail = result[result.length - 1] as RenderedBlock;
    const overflow = tail.endMinutes - windDownMinutes;
    if (overflow <= 0) {
      return { blocks: result, overflowMinutes: 0 };
    }

    if (!isCompressible(tail)) {
      // Can't touch a fixed event or a fixed routine block — whatever
      // overflow remains because of it is final.
      return { blocks: result, overflowMinutes: overflow };
    }

    const floor = tail.kind === "buffer" ? 0 : MIN_FRAGMENT_MINUTES;
    const duration = tail.endMinutes - tail.startMinutes;
    const capacity = Math.max(0, duration - floor);
    const reclaim = Math.min(overflow, capacity);
    const newEnd = tail.endMinutes - reclaim;
    const newDuration = newEnd - tail.startMinutes;

    if (tail.kind === "buffer" && newDuration <= 0) {
      // Fully consumed — drop it and let whatever comes before it become
      // the new tail; that block's own end might independently still
      // need shrinking too, so loop rather than returning.
      result.pop();
      continue;
    }

    result[result.length - 1] = { ...tail, endMinutes: newEnd };
    return { blocks: result, overflowMinutes: Math.max(0, overflow - reclaim) };
  }

  return { blocks: result, overflowMinutes: 0 };
}

/**
 * Shifts every flexible routine block starting at or after `nowMinutes`
 * by `deltaMinutes`, re-renders the day against the (unmoved) events, and
 * best-effort compresses the tail to fit wind-down.
 *
 * A **positive** delta is the classic "running late" push. A **negative**
 * delta pulls the remainder of the day earlier, for when you're ahead and
 * would rather not sit waiting for the schedule to catch up.
 *
 * Blocks that have already started (startMinutes < nowMinutes) are left
 * alone — this tool moves what's still ahead, not whatever is in progress
 * right now (that's Now & Next's "+10 min").
 *
 * Pulling earlier is clamped so no block starts before the current time
 * or the day's wake time, whichever is later. The clamp is computed once
 * across all affected blocks and applied uniformly, so their spacing is
 * preserved rather than the earliest ones bunching up against the floor.
 */
export function shiftSchedule(
  date: string,
  dayOfWeek: DayOfWeek,
  template: DayTemplate,
  events: OneOffEvent[],
  nowMinutes: number,
  deltaMinutes: ShiftDeltaMinutes,
  options: ShiftScheduleOptions = {},
): ShiftScheduleResult {
  const selected = options.blockIds ? new Set(options.blockIds) : null;
  const isMovable = (block: RoutineBlock) =>
    block.flexibility === "flexible" &&
    block.startMinutes >= nowMinutes &&
    (selected === null || selected.has(block.id));

  const movable = template.blocks.filter(isMovable);

  let appliedDelta: number = deltaMinutes;
  if (deltaMinutes < 0 && movable.length > 0) {
    // You can't start something in the past, and nothing should precede
    // the day's declared start.
    const floor = Math.max(nowMinutes, template.wakeMinutes);
    const earliestStart = Math.min(...movable.map((block) => block.startMinutes));
    // `deltaMinutes` is negative, so the *larger* of the two is the
    // smaller move — that's the one that respects the floor.
    appliedDelta = Math.max(deltaMinutes, floor - earliestStart);
    if (appliedDelta > 0) appliedDelta = 0; // already at or past the floor
  }

  const shiftedBlocks = template.blocks.map((block) =>
    isMovable(block)
      ? {
          ...block,
          startMinutes: block.startMinutes + appliedDelta,
          endMinutes: block.endMinutes + appliedDelta,
        }
      : block,
  );

  const rendered = renderDailyInstance(
    date,
    dayOfWeek,
    { ...template, blocks: shiftedBlocks },
    events,
  );

  const { blocks, overflowMinutes } = compressToFit(
    rendered.blocks,
    template.windDownMinutes,
  );

  return {
    instance: { ...rendered, blocks },
    overflowMinutes,
    appliedDeltaMinutes: appliedDelta,
  };
}
