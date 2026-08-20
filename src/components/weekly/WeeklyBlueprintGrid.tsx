import { useState } from "react";
import { DAYS_OF_WEEK, type DayOfWeek } from "../../types/schedule";
import type { UseTemplatesResult } from "../../hooks/useTemplates";
import { DayTemplateEditor } from "./DayTemplateEditor";
import { cx } from "../../lib/cx";

const DAY_LABELS: Record<DayOfWeek, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
};

function todaysDayOfWeek(): DayOfWeek {
  // getDay(): 0=Sunday..6=Saturday
  const order: DayOfWeek[] = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
  return order[new Date().getDay()] as DayOfWeek;
}

interface WeeklyBlueprintGridProps {
  templates: UseTemplatesResult;
}

/** The Blueprint tab: a day-of-week tab strip over `DayTemplateEditor`.
 * Opens on today's weekday by default since that's the day someone
 * opening the editor is most likely here to adjust. */
export function WeeklyBlueprintGrid({ templates }: WeeklyBlueprintGridProps) {
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>(todaysDayOfWeek);

  if (templates.loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-neutral-400 dark:text-neutral-600">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex gap-1 overflow-x-auto border-b border-neutral-200 px-4 pb-2 pt-3 dark:border-neutral-800">
        {DAYS_OF_WEEK.map((day) => (
          <button
            key={day}
            type="button"
            onClick={() => setSelectedDay(day)}
            className={cx(
              "shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              selectedDay === day
                ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                : "text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800",
            )}
          >
            {DAY_LABELS[day]}
          </button>
        ))}
      </div>

      <DayTemplateEditor
        day={selectedDay}
        template={templates.blueprint.days[selectedDay]}
        categories={templates.blueprint.categories}
        onUpdateWindow={(wake, windDown) =>
          void templates.updateDayWindow(selectedDay, wake, windDown)
        }
        onAddBlock={(block) => void templates.addBlock(selectedDay, block)}
        onUpdateBlock={(blockId, patch) =>
          void templates.updateBlock(selectedDay, blockId, patch)
        }
        onRemoveBlock={(blockId) => void templates.removeBlock(selectedDay, blockId)}
        onAddCategory={(name, color) => void templates.addCategory(name, color)}
        onUpdateCategory={(id, patch) => void templates.updateCategory(id, patch)}
        onRemoveCategory={templates.removeCategory}
      />
    </div>
  );
}
