/**
 * Soft-streak math: whether a day "succeeded" (>=75% of that day's
 * scheduled blocks checked off), and the rolling grace-day mechanic that
 * lets one missed day per trailing 7-day window pass without resetting
 * the streak — so a single off day doesn't wipe out weeks of consistency,
 * the all-or-nothing failure mode habit-tracking apps are notorious for.
 */

import type { DailyInstance } from "../types/schedule";
import type { AdherenceLog, DayOutcome, StreakState } from "../types/adherence";

export const SUCCESS_THRESHOLD = 0.75;
const GRACE_WINDOW_DAYS = 7;
// How long grace-day usage is kept around before pruning — generous
// margin over GRACE_WINDOW_DAYS so pruning is never anywhere near the
// edge of affecting a real rolling-window check. `history` (for the
// analytics 30-day trend, Phase 6) is capped separately and much longer.
const GRACE_TRACKING_DAYS = 14;
const HISTORY_LIMIT = 400;

/** Whole-day difference between two ISO dates, computed in UTC so pure
 * calendar-date subtraction isn't perturbed by DST — this is calendar
 * math, not elapsed real time. */
function daysBetween(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split("-").map(Number);
  const [ty, tm, td] = toIso.split("-").map(Number);
  const from = Date.UTC(fy as number, (fm as number) - 1, fd as number);
  const to = Date.UTC(ty as number, (tm as number) - 1, td as number);
  return Math.round((to - from) / 86_400_000);
}

/**
 * A block counts as a scheduled commitment for streak purposes if it's
 * something the user actually agreed to do — both recurring routine
 * blocks and one-off events count. Synthesized buffer time (open or
 * discarded-sliver filler from the collision engine) doesn't, since
 * there's nothing there to check off.
 */
export function computeCompletionRatio(
  instance: DailyInstance,
  logs: AdherenceLog[],
): number {
  const scheduled = instance.blocks.filter((block) => block.kind !== "buffer");
  if (scheduled.length === 0) return 1; // nothing scheduled -> nothing to fail
  const completedIds = new Set(
    logs.filter((log) => log.completed).map((log) => log.renderedBlockId),
  );
  const completedCount = scheduled.filter((block) => completedIds.has(block.id)).length;
  return completedCount / scheduled.length;
}

export function computeDayOutcome(
  date: string,
  instance: DailyInstance,
  logs: AdherenceLog[],
): Omit<DayOutcome, "usedGraceDay"> {
  const completionRatio = computeCompletionRatio(instance, logs);
  return { date, completionRatio, succeeded: completionRatio >= SUCCESS_THRESHOLD };
}

/**
 * Folds one more day's outcome into the running streak state. Callers
 * are expected to call this once per day, in chronological order —
 * it doesn't re-derive order from `history` itself.
 *
 * - Success: streak extends; longest-streak record updates if beaten.
 * - Miss, with a grace day available in the trailing 7-day window: the
 *   streak is preserved as-is (frozen, not extended) and the grace day
 *   is spent.
 * - Miss, with no grace day available (one was already used within the
 *   last 7 days): the streak resets to 0.
 */
export function applyDayOutcome(
  state: StreakState,
  outcomeInput: Omit<DayOutcome, "usedGraceDay">,
): StreakState {
  const prunedGraceDates = state.graceDayDatesUsed.filter(
    (used) => daysBetween(used, outcomeInput.date) <= GRACE_TRACKING_DAYS,
  );

  if (outcomeInput.succeeded) {
    const currentStreak = state.currentStreak + 1;
    const outcome: DayOutcome = { ...outcomeInput, usedGraceDay: false };
    return {
      currentStreak,
      longestStreak: Math.max(state.longestStreak, currentStreak),
      graceDayDatesUsed: prunedGraceDates,
      history: [...state.history, outcome].slice(-HISTORY_LIMIT),
    };
  }

  const graceDayAvailable = !prunedGraceDates.some(
    (used) => daysBetween(used, outcomeInput.date) < GRACE_WINDOW_DAYS,
  );

  if (graceDayAvailable) {
    const outcome: DayOutcome = { ...outcomeInput, usedGraceDay: true };
    return {
      ...state,
      graceDayDatesUsed: [...prunedGraceDates, outcomeInput.date],
      history: [...state.history, outcome].slice(-HISTORY_LIMIT),
    };
  }

  const outcome: DayOutcome = { ...outcomeInput, usedGraceDay: false };
  return {
    currentStreak: 0,
    longestStreak: state.longestStreak,
    graceDayDatesUsed: prunedGraceDates,
    history: [...state.history, outcome].slice(-HISTORY_LIMIT),
  };
}

/** Convenience one-call wrapper combining the two pieces above — what a
 * "close out the day" hook or scheduled job actually calls. Kept as two
 * separately-testable pure functions rather than only this, so the
 * threshold math and the grace-day rules can each be tested in isolation. */
export function recordDay(
  state: StreakState,
  date: string,
  instance: DailyInstance,
  logs: AdherenceLog[],
): StreakState {
  return applyDayOutcome(state, computeDayOutcome(date, instance, logs));
}
