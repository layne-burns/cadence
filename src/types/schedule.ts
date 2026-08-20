/**
 * Core scheduling vocabulary: the building blocks the collision engine
 * (`engine/scheduler.ts`) reads and produces. Two kinds of times shown to
 * this app:
 *
 * 1. Blueprint blocks (`RoutineBlock`) and one-off events (`OneOffEvent`) —
 *    the *inputs*, persisted as-is and never mutated by rendering.
 * 2. `RenderedBlock` — the *output*: what a single calendar day actually
 *    looks like after one-off events have sliced up the routine. This is
 *    always computed fresh, never persisted.
 *
 * Times are stored as minutes-since-midnight (0–1439) rather than Date
 * objects or "HH:mm" strings — it makes interval math (overlap, shrink,
 * split, shift) plain integer arithmetic instead of string parsing or
 * timezone-aware Date juggling, which matters once timeShifter.ts starts
 * doing repeated add/subtract passes over a day's blocks.
 */

export type DayOfWeek =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export const DAYS_OF_WEEK: readonly DayOfWeek[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

/**
 * User-defined grouping for blocks — colors and names are set by the user,
 * not hardcoded, so the starter taxonomy in `lib/taxonomy.ts` is a
 * suggestion rather than a fixed enum.
 *
 * Categories form a **two-level** tree via `parentId`. It's a flat list
 * with parent references rather than nested objects because blocks
 * reference a category by id and don't care where it sits — nesting the
 * storage would mean every lookup walks a tree for no gain.
 */
export interface Category {
  id: string;
  name: string;
  /** Any valid CSS color (hex, oklch, etc.) — rendered as-is. */
  color: string;
  /**
   * The parent category, for a subcategory. Absent means top-level.
   *
   * Exactly two levels are supported: a category with a `parentId` must
   * not itself be a parent. Depth is capped because the UI, the analytics
   * roll-up, and the block picker all assume "parent › child" — arbitrary
   * depth would complicate all three to express something nobody asked
   * for. `isValidCategoryTree` in lib/categories.ts enforces it.
   */
  parentId?: string;
}

/** `fixed` blocks/events never move under the "running late" push tool.
 * `flexible` routine blocks are the only thing timeShifter.ts is allowed
 * to shift. One-off events are always effectively fixed (see OneOffEvent). */
export type Flexibility = "fixed" | "flexible";

/** A block in the recurring weekly blueprint. Lives inside a `DayTemplate`
 * (see types/template.ts) and is never edited by the collision engine —
 * only read from, to produce a day's `RenderedBlock[]`. */
export interface RoutineBlock {
  id: string;
  title: string;
  categoryId: string;
  startMinutes: number;
  endMinutes: number;
  flexibility: Flexibility;
  /** Overrides the category's color for this specific block, if set. */
  color?: string;
}

/** A specific-date appointment layered on top of the blueprint. Always
 * behaves as `fixed` — one-offs are the thing the blueprint bends around,
 * so they never shift themselves in timeShifter.ts. */
export interface OneOffEvent {
  id: string;
  /** ISO date, e.g. "2026-08-19" — one-offs are date-specific, not weekly. */
  date: string;
  title: string;
  startMinutes: number;
  endMinutes: number;
  categoryId?: string;
  color?: string;
  notes?: string;
}

/** What produced a `RenderedBlock`. `buffer` blocks are synthesized by the
 * collision engine (e.g. the open time left after a sliver gets discarded
 * under the 10-minute threshold, or gaps introduced by pushing the
 * schedule) and have no source template/event behind them. */
export type BlockKind = "routine" | "event" | "buffer";

/**
 * One block as it actually appears on a specific calendar day, after the
 * collision engine has sliced the blueprint around that day's one-off
 * events. This is the type components render and the type check-ins
 * (`AdherenceLog`) key against.
 *
 * `id` is derived deterministically from `sourceId` + the final
 * start/end — NOT random — so that re-running the collision engine (e.g.
 * because a new event was added later) reproduces the same id for a block
 * whose geometry didn't change, keeping existing check-ins attached to the
 * right block. See engine/scheduler.ts for the id derivation.
 */
export interface RenderedBlock {
  id: string;
  kind: BlockKind;
  /** RoutineBlock id or OneOffEvent id this was derived from; null for a
   * synthesized buffer block. */
  sourceId: string | null;
  /** When a routine block is split, `partIndex` distinguishes "Research
   * (Part 1)" from "Research (Part 2)"; undefined for unsplit blocks. */
  partIndex?: number;
  title: string;
  categoryId: string | null;
  color?: string;
  startMinutes: number;
  endMinutes: number;
  flexibility: Flexibility;
}

/** The fully resolved schedule for one concrete date — the collision
 * engine's output. Always computed on demand from a WeeklyBlueprint + that
 * date's OneOffEvent[]; never itself persisted. */
export interface DailyInstance {
  date: string;
  dayOfWeek: DayOfWeek;
  wakeMinutes: number;
  windDownMinutes: number;
  blocks: RenderedBlock[];
}
