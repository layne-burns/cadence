import { useState } from "react";
import { Button } from "../common/Button";
import { formatDateLabel } from "../../lib/time";
import { SUCCESS_THRESHOLD } from "../../engine/streaks";
import type { DayOutcome } from "../../types/adherence";

interface ConsistencyTrendProps {
  /** Chronological, oldest first — StreakState.history as-is. */
  history: DayOutcome[];
}

const WIDTH = 600;
const HEIGHT = 120;
const PADDING = 12;

/** Single-series line chart (no legend needed — one color, and the
 * section heading above it already names what's plotted), toggled
 * between the spec's 7-day and 30-day windows. Dot color distinguishes
 * a plain success, a miss, and a grace-day save — three states beyond
 * just "on the line or not." */
export function ConsistencyTrend({ history }: ConsistencyTrendProps) {
  const [windowDays, setWindowDays] = useState<7 | 30>(7);
  const slice = history.slice(-windowDays);

  if (slice.length === 0) {
    return (
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        No days recorded yet — check back after your first full day using Cadence.
      </p>
    );
  }

  const innerWidth = WIDTH - PADDING * 2;
  const innerHeight = HEIGHT - PADDING * 2;
  const stepX = slice.length > 1 ? innerWidth / (slice.length - 1) : 0;

  const points = slice.map((day, i) => ({
    x: PADDING + i * stepX,
    y: PADDING + innerHeight * (1 - day.completionRatio),
    day,
  }));
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const thresholdY = PADDING + innerHeight * (1 - SUCCESS_THRESHOLD);

  return (
    <div>
      <div className="mb-2 flex justify-end gap-1">
        <Button
          size="sm"
          variant={windowDays === 7 ? "primary" : "secondary"}
          onClick={() => setWindowDays(7)}
        >
          7 days
        </Button>
        <Button
          size="sm"
          variant={windowDays === 30 ? "primary" : "secondary"}
          onClick={() => setWindowDays(30)}
        >
          30 days
        </Button>
      </div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        role="img"
        aria-label={`Consistency over the last ${windowDays} days`}
      >
        <line
          x1={PADDING}
          y1={thresholdY}
          x2={WIDTH - PADDING}
          y2={thresholdY}
          className="stroke-neutral-200 dark:stroke-neutral-800"
          strokeWidth={1}
          strokeDasharray="2 2"
        />
        <path
          d={linePath}
          fill="none"
          className="stroke-indigo-500"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {points.map((p) => (
          <circle
            key={p.day.date}
            cx={p.x}
            cy={p.y}
            r={4}
            strokeWidth={2}
            className={
              p.day.usedGraceDay
                ? "fill-amber-500 stroke-white dark:stroke-neutral-900"
                : p.day.succeeded
                  ? "fill-indigo-500 stroke-white dark:stroke-neutral-900"
                  : "fill-neutral-300 stroke-white dark:fill-neutral-700 dark:stroke-neutral-900"
            }
          >
            <title>
              {`${formatDateLabel(p.day.date)}: ${Math.round(p.day.completionRatio * 100)}%${p.day.usedGraceDay ? " (grace day)" : ""}`}
            </title>
          </circle>
        ))}
      </svg>
      <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-600">
        Dashed line marks the {Math.round(SUCCESS_THRESHOLD * 100)}% success threshold.
        Amber dots used a grace day.
      </p>
    </div>
  );
}
