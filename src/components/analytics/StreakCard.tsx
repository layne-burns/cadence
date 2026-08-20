import { Flame, Trophy } from "lucide-react";
import { Card } from "../common/Card";
import type { StreakState } from "../../types/adherence";

interface StreakCardProps {
  streakState: StreakState;
}

/** A KPI row of two stat tiles — per the dataviz method, "a handful of
 * headline numbers" is a stat-tile row, not a chart. */
export function StreakCard({ streakState }: StreakCardProps) {
  return (
    <Card className="flex items-center justify-around gap-4 p-6 text-center">
      <div className="flex flex-col items-center gap-1">
        <Flame className="size-6 text-indigo-500" />
        <p className="text-3xl font-semibold">{streakState.currentStreak}</p>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">Current streak</p>
      </div>
      <div className="h-12 w-px bg-neutral-200 dark:bg-neutral-800" />
      <div className="flex flex-col items-center gap-1">
        <Trophy className="size-6 text-neutral-400 dark:text-neutral-600" />
        <p className="text-3xl font-semibold">{streakState.longestStreak}</p>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">Longest streak</p>
      </div>
    </Card>
  );
}
