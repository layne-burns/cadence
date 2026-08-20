/**
 * User settings that change how the app *computes*, as opposed to how it
 * looks. These live in IndexedDB and travel in the sync payload, unlike
 * theme and calendar view mode which are localStorage-only.
 *
 * The distinction is deliberate: theme is a per-device preference (a
 * phone at night and a laptop at noon can reasonably disagree), but
 * streak rules are part of the record. If two devices disagreed about
 * which days count, they'd compute different streaks from identical
 * adherence data, and the one that synced last would win arbitrarily.
 */

import type { DayOfWeek } from "./schedule";

export interface StreakSettings {
  /** Weekdays excluded from streak math entirely — neither a success nor
   * a miss, so they can't inflate or break a streak. */
  ignoredDays: DayOfWeek[];
  /**
   * When true, an ignored day is only *actually* ignored if nothing
   * special was scheduled on it. A one-off event on an ignored Saturday
   * pulls that Saturday back into the streak, because deliberately
   * scheduling something is evidence you meant to show up for it.
   *
   * Meaningless when `ignoredDays` is empty, and the UI disables it in
   * that case — but the engine doesn't rely on that, it just reads false.
   */
  ignoreOnlyWhenNoEvents: boolean;
}

export interface AppSettings {
  streak: StreakSettings;
}

export function createDefaultSettings(): AppSettings {
  return {
    streak: {
      ignoredDays: [],
      ignoreOnlyWhenNoEvents: false,
    },
  };
}
