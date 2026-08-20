import { useStreak } from "../../hooks/useStreak";
import { useAnalyticsData } from "../../hooks/useAnalyticsData";
import type { UseTemplatesResult } from "../../hooks/useTemplates";
import type { UseSettingsResult } from "../../hooks/useSettings";
import { StreakCard } from "./StreakCard";
import { ConsistencyTrend } from "./ConsistencyTrend";
import { ConsistencyCalendar } from "./ConsistencyCalendar";
import { DropoffHeatmap } from "./DropoffHeatmap";
import { CategoryBreakdown } from "./CategoryBreakdown";
import { EnergyAndFriction } from "./EnergyAndFriction";
import { PlannedVsActual } from "./PlannedVsActual";
import { PatternBreakdown } from "./PatternBreakdown";
import { Card } from "../common/Card";

interface AnalyticsScreenProps {
  templates: UseTemplatesResult;
  settings: UseSettingsResult;
}

/** Section wrapper — every panel is a titled card, so the screen reads as
 * a list of questions rather than a wall of charts. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="p-4">
      <h3 className="mb-3 text-sm font-medium text-neutral-500 dark:text-neutral-400">
        {title}
      </h3>
      {children}
    </Card>
  );
}

export function AnalyticsScreen({ templates, settings }: AnalyticsScreenProps) {
  const { streakState, loading: streakLoading } = useStreak(templates, settings);
  const analytics = useAnalyticsData(templates);

  if (streakLoading || analytics.loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-neutral-400 dark:text-neutral-600">
        Loading…
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4">
      <StreakCard streakState={streakState} />

      <Section title="Last six months">
        <ConsistencyCalendar history={streakState.history} />
      </Section>

      <Section title="Consistency">
        <ConsistencyTrend history={streakState.history} />
      </Section>

      <Section title="Energy & friction">
        <EnergyAndFriction
          energyByHour={analytics.energyByHour}
          frictionCounts={analytics.frictionCounts}
        />
      </Section>

      <Section title="Planned vs actual (last 30 days)">
        <PlannedVsActual
          buckets={analytics.plannedVsActual}
          categories={templates.blueprint.categories}
        />
      </Section>

      <Section title="Patterns (last 30 days)">
        <PatternBreakdown
          byDayOfWeek={analytics.dayOfWeek}
          byFlexibility={analytics.flexibility}
        />
      </Section>

      <Section title="By hour of day (last 30 days)">
        <DropoffHeatmap buckets={analytics.hourlyDropoff} />
      </Section>

      <Section title="By category (last 30 days)">
        <CategoryBreakdown
          buckets={analytics.categoryBreakdown}
          categories={templates.blueprint.categories}
        />
      </Section>
    </div>
  );
}
