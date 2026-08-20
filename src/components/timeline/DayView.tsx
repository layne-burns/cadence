import { Plus } from "lucide-react";
import { useState } from "react";
import type { DailyInstance, RenderedBlock } from "../../types/schedule";
import type { AdherenceLog } from "../../types/adherence";
import type { NewEventInput } from "../../hooks/useSchedule";
import { TimeblockCard } from "./TimeblockCard";
import { TimeGridRuler } from "./TimeGridRuler";
import { EventForm } from "./EventForm";
import { Modal } from "../common/Modal";
import { Button } from "../common/Button";
import { minutesSinceMidnight } from "../../lib/time";

const PIXELS_PER_MINUTE = 64 / 60;
const MIN_BLOCK_HEIGHT_PX = 4;

interface DayViewProps {
  instance: DailyInstance;
  isToday: boolean;
  now: Date;
  getLogForBlock: (id: string) => AdherenceLog | undefined;
  onToggleComplete: (block: RenderedBlock) => void;
  onAddEvent: (values: NewEventInput) => void;
}

export function DayView({
  instance,
  isToday,
  now,
  getLogForBlock,
  onToggleComplete,
  onAddEvent,
}: DayViewProps) {
  const [addingEvent, setAddingEvent] = useState(false);
  const { wakeMinutes, windDownMinutes, blocks } = instance;
  const height = Math.max(windDownMinutes - wakeMinutes, 0) * PIXELS_PER_MINUTE;
  const nowMinutes = minutesSinceMidnight(now);
  const showNowLine = isToday && nowMinutes >= wakeMinutes && nowMinutes <= windDownMinutes;
  const scheduledCount = blocks.filter((b) => b.kind !== "buffer").length;

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
          {scheduledCount === 0 ? "Nothing scheduled" : `${scheduledCount} block${scheduledCount === 1 ? "" : "s"}`}
        </h2>
        <Button size="sm" variant="secondary" onClick={() => setAddingEvent(true)}>
          <Plus className="size-4" /> Add event
        </Button>
      </div>

      {blocks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
          No blocks yet today. The weekly blueprint editor is coming in a
          later phase — for now, add a one-off event to get started.
        </div>
      ) : (
        <div className="relative flex" style={{ height }}>
          <TimeGridRuler
            wakeMinutes={wakeMinutes}
            windDownMinutes={windDownMinutes}
            pixelsPerMinute={PIXELS_PER_MINUTE}
          />
          <div className="relative ml-2 flex-1">
            {blocks.map((block) => (
              <div
                key={block.id}
                className="absolute inset-x-0 px-0.5"
                style={{
                  top: (block.startMinutes - wakeMinutes) * PIXELS_PER_MINUTE,
                  height: Math.max(
                    (block.endMinutes - block.startMinutes) * PIXELS_PER_MINUTE,
                    MIN_BLOCK_HEIGHT_PX,
                  ),
                }}
              >
                <TimeblockCard
                  block={block}
                  completed={getLogForBlock(block.id)?.completed ?? false}
                  onToggleComplete={() => onToggleComplete(block)}
                />
              </div>
            ))}
            {showNowLine && (
              <div
                className="pointer-events-none absolute inset-x-0 border-t-2 border-red-500"
                style={{ top: (nowMinutes - wakeMinutes) * PIXELS_PER_MINUTE }}
              >
                <span className="absolute -left-1 -top-[5px] size-2.5 rounded-full bg-red-500" />
              </div>
            )}
          </div>
        </div>
      )}

      <Modal
        open={addingEvent}
        onClose={() => setAddingEvent(false)}
        title="Add one-off event"
      >
        <EventForm
          onCancel={() => setAddingEvent(false)}
          onSubmit={(values) => {
            onAddEvent(values);
            setAddingEvent(false);
          }}
        />
      </Modal>
    </div>
  );
}
