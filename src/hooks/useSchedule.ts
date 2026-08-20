/**
 * The day-view data hook: resolves the currently-viewed date's
 * `DailyInstance` (blueprint + that date's events, run through the
 * collision engine), owns that date's one-off events and adherence logs,
 * and exposes the interactions the timeline and focus UI need.
 *
 * One deliberate scope decision: the "+10 min extension" and "skip to
 * next" actions in Now & Next are implemented here as session-local
 * "nudges" — an in-memory `{ blockId: minutesDelta }` map applied on top
 * of the pure engine render, NOT persisted to IndexedDB and NOT
 * cascaded through the rest of the day. That's intentionally simpler
 * than the real thing: Phase 5's `timeShifter.ts` is what implements the
 * actual persisted, cascading "running late" push across the whole
 * remaining day. Nudges reset when you navigate to a different date.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import * as db from "../services/db";
import { renderDailyInstance } from "../engine/scheduler";
import { useTemplates } from "./useTemplates";
import { addDaysIso, dayOfWeekForIso, toIsoDate } from "../lib/time";
import type {
  DailyInstance,
  DayOfWeek,
  OneOffEvent,
  RenderedBlock,
} from "../types/schedule";
import type { AdherenceLog, EnergyLevel } from "../types/adherence";

export interface NewEventInput {
  title: string;
  startMinutes: number;
  endMinutes: number;
  categoryId?: string;
  color?: string;
  notes?: string;
}

export interface CheckInInput {
  completed: boolean;
  energyLevel?: EnergyLevel;
  frictionNote?: string;
}

export interface UseScheduleResult {
  date: string;
  dayOfWeek: DayOfWeek;
  isToday: boolean;
  instance: DailyInstance;
  loading: boolean;
  goToToday: () => void;
  goToPreviousDay: () => void;
  goToNextDay: () => void;
  addEvent: (event: NewEventInput) => Promise<void>;
  removeEvent: (id: string) => Promise<void>;
  getLogForBlock: (renderedBlockId: string) => AdherenceLog | undefined;
  logCheckIn: (block: RenderedBlock, input: CheckInInput) => Promise<void>;
  toggleComplete: (block: RenderedBlock) => Promise<void>;
  /** Session-local nudge — see the file-level comment. Positive minutes
   * extend a block's end; used by the "+10 min" button. */
  extendBlock: (block: RenderedBlock, minutes: number) => void;
  /** Session-local nudge that shrinks `block`'s end to `nowMinutes`,
   * making it stop being "current" as of right now — the "Skip/Next"
   * button's implementation. */
  skipBlock: (block: RenderedBlock, nowMinutes: number) => void;
}

export function useSchedule(): UseScheduleResult {
  const { blueprint, loading: blueprintLoading } = useTemplates();
  const [date, setDate] = useState(() => toIsoDate(new Date()));
  const [events, setEvents] = useState<OneOffEvent[]>([]);
  const [logs, setLogs] = useState<AdherenceLog[]>([]);
  const [dayDataLoading, setDayDataLoading] = useState(true);
  const [nudges, setNudges] = useState<Record<string, number>>({});

  const dayOfWeek = useMemo(() => dayOfWeekForIso(date), [date]);
  const isToday = date === toIsoDate(new Date());

  useEffect(() => {
    let cancelled = false;
    // Reset synchronously as soon as `date` changes, before the async load
    // below resolves — otherwise DayView briefly shows yesterday's events
    // (or yesterday's nudges) under today's date. This is the standard
    // "restart on changing id" data-fetching effect shape; the linter's
    // set-state-in-effect warning here is a false positive for that
    // pattern, not a sign this should be computed during render.
    setDayDataLoading(true);
    setNudges({}); // nudges are per-day; don't carry them across navigation
    void Promise.all([
      db.getEventsForDate(date),
      db.getAdherenceLogsForDate(date),
    ]).then(([loadedEvents, loadedLogs]) => {
      if (cancelled) return;
      setEvents(loadedEvents);
      setLogs(loadedLogs);
      setDayDataLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [date]);

  const template = blueprint.days[dayOfWeek];

  const instance = useMemo(() => {
    const rendered = renderDailyInstance(date, dayOfWeek, template, events);
    if (Object.keys(nudges).length === 0) return rendered;
    return {
      ...rendered,
      blocks: rendered.blocks.map((block) => {
        const nudge = nudges[block.id];
        return nudge ? { ...block, endMinutes: block.endMinutes + nudge } : block;
      }),
    };
  }, [date, dayOfWeek, template, events, nudges]);

  const goToToday = useCallback(() => setDate(toIsoDate(new Date())), []);
  const goToPreviousDay = useCallback(() => setDate((d) => addDaysIso(d, -1)), []);
  const goToNextDay = useCallback(() => setDate((d) => addDaysIso(d, 1)), []);

  const addEvent = useCallback(
    async (input: NewEventInput) => {
      const event: OneOffEvent = { ...input, id: crypto.randomUUID(), date };
      setEvents((current) => [...current, event]);
      await db.saveEvent(event);
    },
    [date],
  );

  const removeEvent = useCallback(async (id: string) => {
    setEvents((current) => current.filter((event) => event.id !== id));
    await db.deleteEvent(id);
  }, []);

  const getLogForBlock = useCallback(
    (renderedBlockId: string) =>
      logs.find((log) => log.renderedBlockId === renderedBlockId),
    [logs],
  );

  const logCheckIn = useCallback(
    async (block: RenderedBlock, input: CheckInInput) => {
      const existing = logs.find((log) => log.renderedBlockId === block.id);
      const next: AdherenceLog = {
        id: existing?.id ?? `${date}::${block.id}`,
        date,
        renderedBlockId: block.id,
        blockTitle: block.title,
        categoryId: block.categoryId,
        completed: input.completed,
        energyLevel: input.energyLevel,
        frictionNote: input.frictionNote,
        loggedAt: new Date().toISOString(),
      };
      setLogs((current) => [
        ...current.filter((log) => log.id !== next.id),
        next,
      ]);
      await db.saveAdherenceLog(next);
    },
    [logs, date],
  );

  const toggleComplete = useCallback(
    async (block: RenderedBlock) => {
      const existing = logs.find((log) => log.renderedBlockId === block.id);
      await logCheckIn(block, { completed: !existing?.completed });
    },
    [logs, logCheckIn],
  );

  const extendBlock = useCallback((block: RenderedBlock, minutes: number) => {
    setNudges((current) => ({
      ...current,
      [block.id]: (current[block.id] ?? 0) + minutes,
    }));
  }, []);

  const skipBlock = useCallback((block: RenderedBlock, nowMinutes: number) => {
    const delta = nowMinutes - block.endMinutes;
    setNudges((current) => ({
      ...current,
      [block.id]: (current[block.id] ?? 0) + delta,
    }));
  }, []);

  return {
    date,
    dayOfWeek,
    isToday,
    instance,
    loading: blueprintLoading || dayDataLoading,
    goToToday,
    goToPreviousDay,
    goToNextDay,
    addEvent,
    removeEvent,
    getLogForBlock,
    logCheckIn,
    toggleComplete,
    extendBlock,
    skipBlock,
  };
}
