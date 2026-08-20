/**
 * The weekly baseline — the "blueprint" that `DailyInstance`s are derived
 * from. Each day of the week is independently configurable (its own
 * wake/wind-down times and its own block list); there is no assumption
 * that weekdays share a shape.
 */

import type { Category, DayOfWeek, RoutineBlock } from "./schedule";

export interface DayTemplate {
  day: DayOfWeek;
  /** Minutes-since-midnight the day's schedule begins / ends. Blocks
   * outside this range shouldn't exist, but the engine doesn't assume
   * that — it clamps rather than trusts. */
  wakeMinutes: number;
  windDownMinutes: number;
  blocks: RoutineBlock[];
}

/** The full recurring schedule: one `DayTemplate` per day of the week, plus
 * the categories shared across all of them. Persisted as a single record in
 * IndexedDB and as the `blueprint` field of a `GistPayload`. */
export interface WeeklyBlueprint {
  days: Record<DayOfWeek, DayTemplate>;
  categories: Category[];
}

/** A brand-new user's blueprint before the setup wizard runs — every day
 * present but empty, so the rest of the app never has to null-check a
 * missing day. */
export function createEmptyBlueprint(): WeeklyBlueprint {
  const emptyDay = (day: DayOfWeek): DayTemplate => ({
    day,
    wakeMinutes: 7 * 60,
    windDownMinutes: 22 * 60,
    blocks: [],
  });

  return {
    categories: [],
    days: {
      monday: emptyDay("monday"),
      tuesday: emptyDay("tuesday"),
      wednesday: emptyDay("wednesday"),
      thursday: emptyDay("thursday"),
      friday: emptyDay("friday"),
      saturday: emptyDay("saturday"),
      sunday: emptyDay("sunday"),
    },
  };
}
