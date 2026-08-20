import { Plus } from "lucide-react";
import { useState } from "react";
import type { DailyInstance, RenderedBlock } from "../../types/schedule";
import type { AdherenceLog } from "../../types/adherence";
import type { NewEventInput } from "../../hooks/useSchedule";
import { TimeblockCard } from "./TimeblockCard";
import { TimeGridRuler } from "./TimeGridRuler";
import { EventForm } from "./EventForm";
import { Modal } from "../common/Modal";
import { cx } from "../../lib/cx";
import { dayNumber, formatDateLabel, formatWeekdayShort, minutesSinceMidnight } from "../../lib/time";

// Denser than the single-day view — several columns share the width, and
// a narrow column can't show much text anyway, so the detail modal does
// more of the work here. Still raised from 48 to 64 so a 30-minute block
// clears TimeblockCard's title threshold instead of rendering as a bare
// colour bar.
const PIXELS_PER_MINUTE = 64 / 60;
const MIN_BLOCK_HEIGHT_PX = 3;

interface MultiDayViewProps {
  dates: string[];
  instances: Record<string, DailyInstance>;
  today: string;
  now: Date;
  getLogForBlock: (date: string, blockId: string) => AdherenceLog | undefined;
  onToggleComplete: (date: string, block: RenderedBlock) => void;
  onAddEvent: (date: string, values: NewEventInput) => void;
  onOpenBlockDetail: (date: string, block: RenderedBlock) => void;
}

export function MultiDayView({
  dates,
  instances,
  today,
  now,
  getLogForBlock,
  onToggleComplete,
  onAddEvent,
  onOpenBlockDetail,
}: MultiDayViewProps) {
  const [addingEventFor, setAddingEventFor] = useState<string | null>(null);

  // Days can have different wake/wind-down times (each day's template is
  // independently configurable), so the shared ruler spans the union of
  // every visible day's range rather than assuming they match.
  const rangeWake = Math.min(...dates.map((date) => instances[date]?.wakeMinutes ?? 7 * 60));
  const rangeWindDown = Math.max(
    ...dates.map((date) => instances[date]?.windDownMinutes ?? 22 * 60),
  );
  const height = Math.max(rangeWindDown - rangeWake, 0) * PIXELS_PER_MINUTE;
  const nowMinutes = minutesSinceMidnight(now);

  return (
    <div className="flex flex-col gap-2 p-4">
      <div className="flex">
        <div className="w-14 shrink-0" />
        {dates.map((date) => {
          const isToday = date === today;
          return (
            <div key={date} className="flex flex-1 flex-col items-center gap-0.5 px-1">
              <span
                className={cx(
                  "text-xs font-medium",
                  isToday
                    ? "text-indigo-500"
                    : "text-neutral-500 dark:text-neutral-400",
                )}
              >
                {formatWeekdayShort(date)}
              </span>
              <span
                className={cx(
                  "flex size-6 items-center justify-center rounded-full text-sm",
                  isToday && "bg-indigo-500 text-white",
                )}
              >
                {dayNumber(date)}
              </span>
              <button
                type="button"
                onClick={() => setAddingEventFor(date)}
                aria-label={`Add event on ${formatDateLabel(date)}`}
                className="text-neutral-300 hover:text-neutral-500 dark:text-neutral-700 dark:hover:text-neutral-400"
              >
                <Plus className="size-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      <div className="relative flex" style={{ height }}>
        <TimeGridRuler
          wakeMinutes={rangeWake}
          windDownMinutes={rangeWindDown}
          pixelsPerMinute={PIXELS_PER_MINUTE}
        />
        {dates.map((date) => {
          const instance = instances[date];
          const showNowLine =
            date === today && nowMinutes >= rangeWake && nowMinutes <= rangeWindDown;
          return (
            <div
              key={date}
              className="relative flex-1 border-l border-neutral-100 px-0.5 dark:border-neutral-900"
            >
              {instance?.blocks.map((block) => {
                const blockHeight = Math.max(
                  (block.endMinutes - block.startMinutes) * PIXELS_PER_MINUTE,
                  MIN_BLOCK_HEIGHT_PX,
                );
                return (
                  <div
                    key={block.id}
                    className="absolute inset-x-0 px-0.5"
                    style={{
                      top: (block.startMinutes - rangeWake) * PIXELS_PER_MINUTE,
                      height: blockHeight,
                    }}
                  >
                    <TimeblockCard
                      block={block}
                      completed={getLogForBlock(date, block.id)?.completed ?? false}
                      heightPx={blockHeight}
                      onToggleComplete={() => onToggleComplete(date, block)}
                      onOpenDetail={() => onOpenBlockDetail(date, block)}
                    />
                  </div>
                );
              })}
              {showNowLine && (
                <div
                  className="pointer-events-none absolute inset-x-0 border-t-2 border-red-500"
                  style={{ top: (nowMinutes - rangeWake) * PIXELS_PER_MINUTE }}
                />
              )}
            </div>
          );
        })}
      </div>

      <Modal
        open={addingEventFor !== null}
        onClose={() => setAddingEventFor(null)}
        title={addingEventFor ? `Add event — ${formatDateLabel(addingEventFor)}` : "Add event"}
      >
        {/* key forces a fresh form per open (and per target date) — see
            DayTemplateEditor's BlockForm comment for why. */}
        <EventForm
          key={addingEventFor ?? "closed"}
          onCancel={() => setAddingEventFor(null)}
          onSubmit={(values) => {
            if (!addingEventFor) return;
            onAddEvent(addingEventFor, values);
            setAddingEventFor(null);
          }}
        />
      </Modal>
    </div>
  );
}
