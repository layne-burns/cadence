/**
 * Everything to do with "did it happen": per-block check-ins, the rolled-up
 * telemetry the analytics dashboard aggregates over, and streak state.
 */

export type EnergyLevel = 1 | 2 | 3 | 4 | 5;

/**
 * A single check-in against a rendered block on a specific date.
 *
 * Keyed by `renderedBlockId` (see `RenderedBlock.id` in types/schedule.ts)
 * rather than the routine/event id directly, because a routine block can
 * appear as multiple rendered parts in one day. `title`/`categoryId` are
 * denormalized (copied at log time) so a block's history stays readable
 * even after the user renames or deletes the source routine block later —
 * analytics should show what the block *was called at the time*, not
 * silently rewrite history.
 */
export interface AdherenceLog {
  id: string;
  date: string;
  renderedBlockId: string;
  blockTitle: string;
  categoryId: string | null;
  completed: boolean;
  energyLevel?: EnergyLevel;
  /** Free text on purpose — "distracted", "underestimated time", "great
   * flow" are examples in the spec, not a fixed set of options. */
  frictionNote?: string;
  loggedAt: string;
}

/** One flattened sample the analytics aggregators (engine/analytics.ts)
 * consume — e.g. to bucket completions by hour-of-day for the drop-off
 * heatmap. Derived from AdherenceLog + the RenderedBlock it points at,
 * not stored on its own. */
export interface TelemetrySample {
  date: string;
  hour: number;
  categoryId: string | null;
  completed: boolean;
  energyLevel?: EnergyLevel;
  /** Both this and `energyLevel` are only present when the user answered
   * the optional post-check-in prompt, so aggregates over them must
   * report their own sample size rather than implying full coverage. */
  frictionNote?: string;
}

/** One day's outcome against the 75% completion threshold. `usedGraceDay`
 * is true when the day fell short but a grace day covered it instead of
 * breaking the streak. */
export interface DayOutcome {
  date: string;
  completionRatio: number;
  succeeded: boolean;
  usedGraceDay: boolean;
  /**
   * The day was excluded from streak math by the user's ignored-days
   * setting, so it neither extended nor broke the streak. Still recorded
   * in history so the consistency chart can show the gap honestly rather
   * than making an ignored Saturday look like a day that never existed.
   *
   * Optional because `StreakState.history` persisted before this field
   * existed; treat a missing value as `false`.
   */
  excluded?: boolean;
}

/**
 * Rolling streak state. `graceDayDatesUsed` only needs to remember dates
 * within the trailing 7 days — streaks.ts treats it as a sliding window
 * (max 1 grace day per rolling 7 days), not a calendar-week bucket that
 * resets every Monday.
 */
export interface StreakState {
  currentStreak: number;
  longestStreak: number;
  graceDayDatesUsed: string[];
  history: DayOutcome[];
}

export function createEmptyStreakState(): StreakState {
  return {
    currentStreak: 0,
    longestStreak: 0,
    graceDayDatesUsed: [],
    history: [],
  };
}
