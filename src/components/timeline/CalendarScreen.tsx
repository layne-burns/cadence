import { useState } from "react";
import type { UseCalendarResult } from "../../hooks/useCalendar";
import type { UseTemplatesResult } from "../../hooks/useTemplates";
import type { RenderedBlock } from "../../types/schedule";
import { minutesSinceMidnight, toIsoDate } from "../../lib/time";
import { BlockDetailModal } from "./BlockDetailModal";
import { CalendarViewSwitcher } from "./CalendarViewSwitcher";
import { DayView } from "./DayView";
import { MonthView } from "./MonthView";
import { MultiDayView } from "./MultiDayView";

interface CalendarScreenProps {
  calendar: UseCalendarResult;
  templates: UseTemplatesResult;
  now: Date;
}

/** Which block the detail modal is showing. Carries its date because
 * multi-day views can open a block from any visible column, and the modal
 * needs to know which day's check-in it's toggling. */
interface DetailTarget {
  date: string;
  block: RenderedBlock;
}

export function CalendarScreen({ calendar, templates, now }: CalendarScreenProps) {
  const today = toIsoDate(now);
  const nowMinutes = minutesSinceMidnight(now);
  const [detail, setDetail] = useState<DetailTarget | null>(null);

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex justify-end px-4 pt-3">
        <CalendarViewSwitcher value={calendar.viewMode} onChange={calendar.setViewMode} />
      </div>

      {calendar.loading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-neutral-400 dark:text-neutral-600">
          Loading…
        </div>
      ) : calendar.viewMode === "day" ? (
        <DayView
          // Non-null: in "day" mode, visibleDates is always exactly
          // [anchorDate], so instances always has an entry for it by the
          // time `loading` is false.
          instance={calendar.instances[calendar.anchorDate]!}
          isToday={calendar.anchorDate === today}
          now={now}
          categories={templates.blueprint.categories}
          getLogForBlock={(blockId) => calendar.getLogForBlock(calendar.anchorDate, blockId)}
          onToggleComplete={(block) => void calendar.toggleComplete(calendar.anchorDate, block)}
          onAddEvent={(values) => void calendar.addEvent(calendar.anchorDate, values)}
          onOpenBlockDetail={(block) =>
            setDetail({ date: calendar.anchorDate, block })
          }
          onPushSchedule={
            calendar.anchorDate === today
              ? (delta) => calendar.pushToday(nowMinutes, delta)
              : undefined
          }
        />
      ) : calendar.viewMode === "month" ? (
        <MonthView
          dates={calendar.visibleDates}
          instances={calendar.instances}
          anchorDate={calendar.anchorDate}
          today={today}
          getLogForBlock={calendar.getLogForBlock}
          onSelectDate={calendar.jumpToDate}
        />
      ) : (
        <MultiDayView
          dates={calendar.visibleDates}
          instances={calendar.instances}
          today={today}
          now={now}
          categories={templates.blueprint.categories}
          getLogForBlock={calendar.getLogForBlock}
          onToggleComplete={(date, block) => void calendar.toggleComplete(date, block)}
          onAddEvent={(date, values) => void calendar.addEvent(date, values)}
          onOpenBlockDetail={(date, block) => setDetail({ date, block })}
        />
      )}

      <BlockDetailModal
        block={detail?.block ?? null}
        date={detail?.date ?? today}
        completed={
          detail
            ? (calendar.getLogForBlock(detail.date, detail.block.id)?.completed ?? false)
            : false
        }
        categories={templates.blueprint.categories}
        sourceEvent={detail ? calendar.findSourceEvent(detail.block) : null}
        onClose={() => setDetail(null)}
        onToggleComplete={() => {
          if (detail) void calendar.toggleComplete(detail.date, detail.block);
        }}
        onUpdateEvent={(id, values) => void calendar.updateEvent(id, values)}
        onDeleteEvent={(id) => void calendar.removeEvent(id)}
      />
    </div>
  );
}
