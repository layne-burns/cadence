/**
 * Loads persisted `StreakState` and — this is the piece Phase 5 left
 * deliberately unwired — catches it up: on mount, records every day
 * between the last day already in `history` and yesterday (never today;
 * today isn't over yet) via `engine/streaks.recordDay`. That's the
 * "close out the day" trigger the analytics dashboard needed to exist
 * before `StreakCard`/`ConsistencyTrend` could show anything real.
 *
 * If `history` is empty (brand new user), catch-up starts at yesterday
 * only — not the unbounded past before they had a blueprint — so a new
 * user doesn't retroactively earn a streak for days before they'd
 * scheduled anything. See computeCompletionRatio's "nothing scheduled ->
 * ratio 1" rule in streaks.ts for why an unbounded backfill would be
 * misleading (it'd count every empty pre-signup day as a success).
 */

import { useEffect, useState } from "react";
import * as db from "../services/db";
import { renderDailyInstance } from "../engine/scheduler";
import { recordDay } from "../engine/streaks";
import { addDaysIso, dayOfWeekForIso, toIsoDate } from "../lib/time";
import { createEmptyStreakState, type StreakState } from "../types/adherence";
import type { UseTemplatesResult } from "./useTemplates";
import type { UseSettingsResult } from "./useSettings";

// Safety cap on how many days a single catch-up pass will walk, so a
// stale localStorage/IndexedDB state from months of not opening the app
// can't turn mount into an unbounded loop.
const MAX_CATCHUP_DAYS = 400;

export interface UseStreakResult {
  streakState: StreakState;
  loading: boolean;
}

export function useStreak(
  templates: UseTemplatesResult,
  settings: UseSettingsResult,
): UseStreakResult {
  const [streakState, setStreakState] = useState<StreakState>(createEmptyStreakState);
  const [loading, setLoading] = useState(true);
  const streakSettings = settings.settings.streak;

  useEffect(() => {
    if (templates.loading || settings.loading) return;
    let cancelled = false;

    void (async () => {
      let state = await db.getStreakState();
      const lastRecorded = state.history.at(-1)?.date ?? null;
      const yesterday = addDaysIso(toIsoDate(new Date()), -1);

      let cursor = lastRecorded ? addDaysIso(lastRecorded, 1) : yesterday;
      const datesToRecord: string[] = [];
      let guard = 0;
      while (cursor <= yesterday && guard < MAX_CATCHUP_DAYS) {
        datesToRecord.push(cursor);
        cursor = addDaysIso(cursor, 1);
        guard += 1;
      }

      for (const date of datesToRecord) {
        const dayOfWeek = dayOfWeekForIso(date);
        const dayTemplate = templates.blueprint.days[dayOfWeek];
        const [events, logs] = await Promise.all([
          db.getEventsForDate(date),
          db.getAdherenceLogsForDate(date),
        ]);
        const instance = renderDailyInstance(date, dayOfWeek, dayTemplate, events);
        state = recordDay(state, date, instance, logs, streakSettings);
      }

      if (datesToRecord.length > 0) {
        await db.saveStreakState(state);
      }
      if (!cancelled) {
        setStreakState(state);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // `streakSettings` is a dependency on purpose: changing which days are
    // ignored changes what the catch-up pass should have recorded, so the
    // effect re-runs. Note this only affects days recorded *from now on* —
    // history already written under the old rules isn't retroactively
    // rewritten. See CLAUDE.md for why that's a known limitation.
  }, [templates.loading, templates.blueprint, settings.loading, streakSettings]);

  return { streakState, loading };
}
