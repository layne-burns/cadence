import { useStreak } from "../../hooks/useStreak";
import { useAnalyticsData } from "../../hooks/useAnalyticsData";
import type { UseTemplatesResult } from "../../hooks/useTemplates";
import type { UseSettingsResult } from "../../hooks/useSettings";
import { StreakCard } from "./StreakCard";
import { ConsistencyTrend } from "./ConsistencyTrend";
import { DropoffHeatmap } from "./DropoffHeatmap";
import { CategoryBreakdown } from "./CategoryBreakdown";
import { Card } from "../common/Card";

interface AnalyticsScreenProps {
  templates: UseTemplatesResult;
  settings: UseSettingsResult;
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
    <div className="flex flex-col gap-4 p-4">
      <StreakCard streakState={streakState} />

      <Card className="p-4">
        <h3 className="mb-3 text-sm font-medium text-neutral-500 dark:text-neutral-400">
          Consistency
        </h3>
        <ConsistencyTrend history={streakState.history} />
      </Card>

      <Card className="p-4">
        <h3 className="mb-3 text-sm font-medium text-neutral-500 dark:text-neutral-400">
          By hour of day (last 30 days)
        </h3>
        <DropoffHeatmap buckets={analytics.hourlyDropoff} />
      </Card>

      <Card className="p-4">
        <h3 className="mb-3 text-sm font-medium text-neutral-500 dark:text-neutral-400">
          By category (last 30 days)
        </h3>
        <CategoryBreakdown
          buckets={analytics.categoryBreakdown}
          categories={templates.blueprint.categories}
        />
      </Card>
    </div>
  );
}
