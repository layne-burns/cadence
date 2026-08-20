/**
 * Data for the Analytics dashboard's heatmap and category breakdown:
 * loads the trailing 30 days of events/logs in one range query each,
 * renders each of those 30 dates, and feeds the result through
 * engine/analytics.ts's pure aggregators.
 */

import { useEffect, useMemo, useState } from "react";
import * as db from "../services/db";
import { renderDailyInstance } from "../engine/scheduler";
import {
  buildTelemetrySamples,
  computeCategoryBreakdown,
  computeDayOfWeekBreakdown,
  computeEnergyByHour,
  computeFlexibilityBreakdown,
  computeFrictionCounts,
  computeHourlyDropoff,
  computePlannedVsActual,
  type CategoryBucket,
  type DayOfWeekBucket,
  type EnergyByHourBucket,
  type FlexibilityBucket,
  type FrictionCount,
  type HourBucket,
  type PlannedVsActualBucket,
} from "../engine/analytics";
import { addDaysIso, dayOfWeekForIso, toIsoDate } from "../lib/time";
import type { UseTemplatesResult } from "./useTemplates";
import type { OneOffEvent } from "../types/schedule";
import type { AdherenceLog } from "../types/adherence";

const WINDOW_DAYS = 30;

export interface UseAnalyticsDataResult {
  loading: boolean;
  hourlyDropoff: HourBucket[];
  categoryBreakdown: CategoryBucket[];
  energyByHour: EnergyByHourBucket[];
  frictionCounts: FrictionCount[];
  plannedVsActual: PlannedVsActualBucket[];
  dayOfWeek: DayOfWeekBucket[];
  flexibility: FlexibilityBucket[];
}

export function useAnalyticsData(templates: UseTemplatesResult): UseAnalyticsDataResult {
  const [events, setEvents] = useState<OneOffEvent[]>([]);
  const [logs, setLogs] = useState<AdherenceLog[]>([]);
  const [rangeLoading, setRangeLoading] = useState(true);

  const today = toIsoDate(new Date());
  const rangeStart = addDaysIso(today, -(WINDOW_DAYS - 1));

  useEffect(() => {
    let cancelled = false;
    setRangeLoading(true);
    void Promise.all([
      db.getEventsInRange(rangeStart, today),
      db.getAdherenceLogsInRange(rangeStart, today),
    ]).then(([loadedEvents, loadedLogs]) => {
      if (cancelled) return;
      setEvents(loadedEvents);
      setLogs(loadedLogs);
      setRangeLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [rangeStart, today]);

  const instances = useMemo(() => {
    if (templates.loading) return [];
    return Array.from({ length: WINDOW_DAYS }, (_, i) => {
      const date = addDaysIso(rangeStart, i);
      const dayOfWeek = dayOfWeekForIso(date);
      const template = templates.blueprint.days[dayOfWeek];
      const eventsForDate = events.filter((event) => event.date === date);
      return renderDailyInstance(date, dayOfWeek, template, eventsForDate);
    });
  }, [templates.loading, templates.blueprint, events, rangeStart]);

  const logsByDate = useMemo(() => {
    const map: Record<string, AdherenceLog[]> = {};
    for (const log of logs) {
      (map[log.date] ??= []).push(log);
    }
    return map;
  }, [logs]);

  const samples = useMemo(
    () => buildTelemetrySamples(instances, logsByDate),
    [instances, logsByDate],
  );
  const hourlyDropoff = useMemo(() => computeHourlyDropoff(samples), [samples]);
  const categoryBreakdown = useMemo(() => computeCategoryBreakdown(samples), [samples]);
  const energyByHour = useMemo(() => computeEnergyByHour(samples), [samples]);
  const frictionCounts = useMemo(() => computeFrictionCounts(samples), [samples]);
  // These three read the rendered instances directly rather than the
  // flattened samples: they need block duration and flexibility, which a
  // TelemetrySample deliberately doesn't carry.
  const plannedVsActual = useMemo(
    () => computePlannedVsActual(instances, logsByDate),
    [instances, logsByDate],
  );
  const dayOfWeek = useMemo(
    () => computeDayOfWeekBreakdown(instances, logsByDate),
    [instances, logsByDate],
  );
  const flexibility = useMemo(
    () => computeFlexibilityBreakdown(instances, logsByDate),
    [instances, logsByDate],
  );

  return {
    loading: rangeLoading || templates.loading,
    hourlyDropoff,
    categoryBreakdown,
    energyByHour,
    frictionCounts,
    plannedVsActual,
    dayOfWeek,
    flexibility,
  };
}
