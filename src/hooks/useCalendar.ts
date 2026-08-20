/**
 * Data + navigation for the Calendar screen: day / 3-day / week / month
 * views over the blueprint + one-off events + adherence logs, all backed
 * by one range query per view instead of per-date queries.
 *
 * Deliberately separate from `useSchedule` (Phase 4), which now powers
 * only the Now & Next focus widget and always stays pinned to today —
 * Focus showing "today" must not depend on what date the user has
 * browsed to in Calendar. That does mean some CRUD logic (toggling a
 * block complete, adding an event) is duplicated in shape between the two
 * hooks; they operate over different data shapes (one date vs. a map of
 * dates) so sharing it cleanly would need a bigger refactor than this
 * feature warranted. Worth revisiting if a third consumer shows up.
 *
 * Takes `templates` as a parameter rather than calling `useTemplates()`
 * itself, for the same reason `useSchedule` now does — see that file's
 * comment. Phase 6's blueprint editor is a third independent caller of
 * blueprint state, and without a shared instance, edits made there
 * wouldn't show up here until a full reload.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import * as db from "../services/db";
import { renderDailyInstance } from "../engine/scheduler";
import { pushSchedule, type PushDeltaMinutes } from "../engine/timeShifter";
import type { UseTemplatesResult } from "./useTemplates";
import type { NewEventInput } from "./useSchedule";
import {
  addDaysIso,
  addMonthsIso,
  dayOfWeekForIso,
  monthGridDates,
  startOfWeekIso,
  toIsoDate,
} from "../lib/time";
import type { DailyInstance, OneOffEvent, RenderedBlock } from "../types/schedule";
import type { AdherenceLog } from "../types/adherence";

export type CalendarViewMode = "day" | "3day" | "week" | "month";

const VIEW_MODE_STORAGE_KEY = "cadence.calendarViewMode";
const NAV_STEP_DAYS: Record<"day" | "3day" | "week", number> = {
  day: 1,
  "3day": 3,
  week: 7,
};

function isViewMode(value: string | null): value is CalendarViewMode {
  return value === "day" || value === "3day" || value === "week" || value === "month";
}

function loadStoredViewMode(): CalendarViewMode {
  const stored = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY);
  return isViewMode(stored) ? stored : "day";
}

function visibleDatesFor(mode: CalendarViewMode, anchorDate: string): string[] {
  switch (mode) {
    case "day":
      return [anchorDate];
    case "3day":
      return [0, 1, 2].map((offset) => addDaysIso(anchorDate, offset));
    case "week": {
      const start = startOfWeekIso(anchorDate);
      return Array.from({ length: 7 }, (_, i) => addDaysIso(start, i));
    }
    case "month":
      return monthGridDates(anchorDate);
  }
}

export interface UseCalendarResult {
  viewMode: CalendarViewMode;
  setViewMode: (mode: CalendarViewMode) => void;
  anchorDate: string;
  visibleDates: string[];
  instances: Record<string, DailyInstance>;
  loading: boolean;
  goPrev: () => void;
  goNext: () => void;
  goToday: () => void;
  /** Jumps to a specific date in day view — the month grid's "click a day"
   * interaction. */
  jumpToDate: (date: string) => void;
  getLogForBlock: (date: string, blockId: string) => AdherenceLog | undefined;
  toggleComplete: (date: string, block: RenderedBlock) => Promise<void>;
  addEvent: (date: string, input: NewEventInput) => Promise<void>;
  updateEvent: (id: string, input: NewEventInput) => Promise<void>;
  removeEvent: (id: string) => Promise<void>;
  /** The `OneOffEvent` a rendered block came from, or null for routine and
   * buffer blocks. Lets the detail modal offer edit/delete only where
   * there's something editable behind the block. */
  findSourceEvent: (block: RenderedBlock) => OneOffEvent | null;
  /** "Running late?" — re-renders *today* with its remaining flexible
   * blocks pushed forward by `deltaMinutes` (see engine/timeShifter.ts).
   * Session-local only, like Focus's nudges: not persisted, and reset
   * whenever the visible range's data reloads. Only meaningful — and only
   * wired up in the UI — while viewing today. */
  pushToday: (nowMinutes: number, deltaMinutes: PushDeltaMinutes) => void;
}

export function useCalendar(templates: UseTemplatesResult): UseCalendarResult {
  const { blueprint, loading: blueprintLoading } = templates;
  const [viewMode, setViewModeState] = useState<CalendarViewMode>(loadStoredViewMode);
  const [anchorDate, setAnchorDate] = useState(() => toIsoDate(new Date()));
  const [events, setEvents] = useState<OneOffEvent[]>([]);
  const [logs, setLogs] = useState<AdherenceLog[]>([]);
  const [rangeLoading, setRangeLoading] = useState(true);
  const [pushOverride, setPushOverride] = useState<DailyInstance | null>(null);

  const visibleDates = useMemo(
    () => visibleDatesFor(viewMode, anchorDate),
    [viewMode, anchorDate],
  );
  const rangeStart = visibleDates[0] as string;
  const rangeEnd = visibleDates[visibleDates.length - 1] as string;

  useEffect(() => {
    let cancelled = false;
    // Same "restart on changing range" shape as useSchedule.ts's load
    // effect, and the same false-positive from oxlint's set-state-in-effect
    // rule — see that file's comment for why this is the right pattern.
    setRangeLoading(true);
    setPushOverride(null); // a reload invalidates any pending push override
    void Promise.all([
      db.getEventsInRange(rangeStart, rangeEnd),
      db.getAdherenceLogsInRange(rangeStart, rangeEnd),
    ]).then(([loadedEvents, loadedLogs]) => {
      if (cancelled) return;
      setEvents(loadedEvents);
      setLogs(loadedLogs);
      setRangeLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [rangeStart, rangeEnd]);

  const setViewMode = useCallback((mode: CalendarViewMode) => {
    setViewModeState(mode);
    window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
  }, []);

  const instances = useMemo(() => {
    const map: Record<string, DailyInstance> = {};
    for (const date of visibleDates) {
      if (pushOverride && pushOverride.date === date) {
        map[date] = pushOverride;
        continue;
      }
      const dayOfWeek = dayOfWeekForIso(date);
      const template = blueprint.days[dayOfWeek];
      const eventsForDate = events.filter((event) => event.date === date);
      map[date] = renderDailyInstance(date, dayOfWeek, template, eventsForDate);
    }
    return map;
  }, [visibleDates, blueprint, events, pushOverride]);

  const goPrev = useCallback(() => {
    if (viewMode === "month") {
      setAnchorDate((current) => addMonthsIso(current, -1));
    } else {
      setAnchorDate((current) => addDaysIso(current, -NAV_STEP_DAYS[viewMode]));
    }
  }, [viewMode]);

  const goNext = useCallback(() => {
    if (viewMode === "month") {
      setAnchorDate((current) => addMonthsIso(current, 1));
    } else {
      setAnchorDate((current) => addDaysIso(current, NAV_STEP_DAYS[viewMode]));
    }
  }, [viewMode]);

  const goToday = useCallback(() => setAnchorDate(toIsoDate(new Date())), []);

  const jumpToDate = useCallback(
    (date: string) => {
      setAnchorDate(date);
      setViewMode("day");
    },
    [setViewMode],
  );

  const getLogForBlock = useCallback(
    (date: string, blockId: string) =>
      logs.find((log) => log.date === date && log.renderedBlockId === blockId),
    [logs],
  );

  const toggleComplete = useCallback(
    async (date: string, block: RenderedBlock) => {
      const existing = logs.find(
        (log) => log.date === date && log.renderedBlockId === block.id,
      );
      const next: AdherenceLog = {
        id: existing?.id ?? `${date}::${block.id}`,
        date,
        renderedBlockId: block.id,
        blockTitle: block.title,
        categoryId: block.categoryId,
        completed: !existing?.completed,
        loggedAt: new Date().toISOString(),
      };
      setLogs((current) => [...current.filter((log) => log.id !== next.id), next]);
      await db.saveAdherenceLog(next);
    },
    [logs],
  );

  const addEvent = useCallback(async (date: string, input: NewEventInput) => {
    const event: OneOffEvent = { ...input, id: crypto.randomUUID(), date };
    setEvents((current) => [...current, event]);
    await db.saveEvent(event);
  }, []);

  const updateEvent = useCallback(async (id: string, input: NewEventInput) => {
    let updated: OneOffEvent | null = null;
    setEvents((current) =>
      current.map((event) => {
        if (event.id !== id) return event;
        // `date` and `id` are preserved: editing an event's details is a
        // different operation from moving it to another day, which the
        // form doesn't offer.
        updated = { ...event, ...input };
        return updated;
      }),
    );
    if (updated) await db.saveEvent(updated);
  }, []);

  const removeEvent = useCallback(async (id: string) => {
    setEvents((current) => current.filter((event) => event.id !== id));
    await db.deleteEvent(id);
  }, []);

  const findSourceEvent = useCallback(
    (block: RenderedBlock) =>
      block.kind === "event" && block.sourceId
        ? (events.find((event) => event.id === block.sourceId) ?? null)
        : null,
    [events],
  );

  const pushToday = useCallback(
    (nowMinutes: number, deltaMinutes: PushDeltaMinutes) => {
      const todayIso = toIsoDate(new Date());
      const dayOfWeek = dayOfWeekForIso(todayIso);
      const template = blueprint.days[dayOfWeek];
      const eventsToday = events.filter((event) => event.date === todayIso);
      const { instance } = pushSchedule(
        todayIso,
        dayOfWeek,
        template,
        eventsToday,
        nowMinutes,
        deltaMinutes,
      );
      setPushOverride(instance);
    },
    [blueprint, events],
  );

  return {
    viewMode,
    setViewMode,
    anchorDate,
    visibleDates,
    instances,
    loading: blueprintLoading || rangeLoading,
    goPrev,
    goNext,
    goToday,
    jumpToDate,
    getLogForBlock,
    toggleComplete,
    addEvent,
    updateEvent,
    removeEvent,
    findSourceEvent,
    pushToday,
  };
}
