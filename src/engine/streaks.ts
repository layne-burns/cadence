/**
 * Soft-streak math: whether a day "succeeded" (>=75% of that day's
 * scheduled blocks checked off), and the rolling grace-day mechanic that
 * lets one missed day per trailing 7-day window pass without resetting
 * the streak — so a single off day doesn't wipe out weeks of consistency,
 * the all-or-nothing failure mode habit-tracking apps are notorious for.
 */

import type { DailyInstance } from "../types/schedule";
import type { AdherenceLog, DayOutcome, StreakState } from "../types/adherence";
import type { StreakSettings } from "../types/settings";
import { createDefaultSettings } from "../types/settings";

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
 * Whether a day is excluded from streak math by the user's settings.
 *
 * This exists because `computeCompletionRatio` returns 1 for a day with
 * nothing scheduled — sensible in isolation ("you failed nothing"), but
 * it means a permanently empty Saturday counts as a *success* every week
 * and quietly inflates the streak. Excluding such days is the fix, and
 * it has to happen here rather than inside the ratio, because "no blocks
 * today" and "this day doesn't count" are genuinely different facts: a
 * weekday you simply cleared should still count as a win.
 *
 * Settings are passed in rather than read from storage so this module
 * stays pure — see the architecture rules in CLAUDE.md.
 */
export function isDayExcluded(
  instance: DailyInstance,
  settings: StreakSettings,
): boolean {
  if (!settings.ignoredDays.includes(instance.dayOfWeek)) return false;
  if (!settings.ignoreOnlyWhenNoEvents) return true;
  // A deliberately scheduled one-off pulls the day back into the streak.
  const hasEvent = instance.blocks.some((block) => block.kind === "event");
  return !hasEvent;
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
  excluded = false,
): StreakState {
  const prunedGraceDates = state.graceDayDatesUsed.filter(
    (used) => daysBetween(used, outcomeInput.date) <= GRACE_TRACKING_DAYS,
  );

  if (excluded) {
    // Recorded but inert: the streak, the longest-streak record, and the
    // grace-day budget all pass through untouched. An excluded day is
    // neither a win nor a miss, so it must not consume a grace day —
    // otherwise ignoring your weekends would burn the very protection
    // that exists for the weekdays you care about.
    return {
      ...state,
      graceDayDatesUsed: prunedGraceDates,
      history: [
        ...state.history,
        { ...outcomeInput, succeeded: false, usedGraceDay: false, excluded: true },
      ].slice(-HISTORY_LIMIT),
    };
  }

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

/** Convenience one-call wrapper combining the pieces above — what a
 * "close out the day" hook or scheduled job actually calls. Kept as
 * separately-testable pure functions rather than only this, so the
 * threshold math, the exclusion rule, and the grace-day rules can each be
 * tested in isolation.
 *
 * `settings` defaults to "nothing ignored" so existing callers and tests
 * that predate day exclusions keep their original behaviour. */
export function recordDay(
  state: StreakState,
  date: string,
  instance: DailyInstance,
  logs: AdherenceLog[],
  settings: StreakSettings = createDefaultSettings().streak,
): StreakState {
  return applyDayOutcome(
    state,
    computeDayOutcome(date, instance, logs),
    isDayExcluded(instance, settings),
  );
}
