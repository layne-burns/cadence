import type { UseCalendarResult } from "../../hooks/useCalendar";
import { toIsoDate } from "../../lib/time";
import { CalendarViewSwitcher } from "./CalendarViewSwitcher";
import { DayView } from "./DayView";
import { MonthView } from "./MonthView";
import { MultiDayView } from "./MultiDayView";

interface CalendarScreenProps {
  calendar: UseCalendarResult;
  now: Date;
}

export function CalendarScreen({ calendar, now }: CalendarScreenProps) {
  const today = toIsoDate(now);

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
          getLogForBlock={(blockId) => calendar.getLogForBlock(calendar.anchorDate, blockId)}
          onToggleComplete={(block) => void calendar.toggleComplete(calendar.anchorDate, block)}
          onAddEvent={(values) => void calendar.addEvent(calendar.anchorDate, values)}
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
          getLogForBlock={calendar.getLogForBlock}
          onToggleComplete={(date, block) => void calendar.toggleComplete(date, block)}
          onAddEvent={(date, values) => void calendar.addEvent(date, values)}
        />
      )}
    </div>
  );
}
