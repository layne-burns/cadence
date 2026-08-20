import { useState } from "react";
import { Modal } from "../common/Modal";
import { Button } from "../common/Button";
import { DAYS_OF_WEEK, type DayOfWeek } from "../../types/schedule";
import type { WeeklyBlueprint } from "../../types/template";
import { cx } from "../../lib/cx";

const DAY_LABELS: Record<DayOfWeek, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

interface CopyDayModalProps {
  open: boolean;
  from: DayOfWeek;
  blueprint: WeeklyBlueprint;
  onClose: () => void;
  onCopy: (to: DayOfWeek[]) => void;
}

/**
 * "Copy this day to…" — the answer to building five near-identical
 * weekdays one block at a time. Overwriting is destructive, so days that
 * already have blocks are called out by name and count before you commit,
 * rather than after.
 */
export function CopyDayModal({
  open,
  from,
  blueprint,
  onClose,
  onCopy,
}: CopyDayModalProps) {
  const [selected, setSelected] = useState<DayOfWeek[]>([]);

  const targets = DAYS_OF_WEEK.filter((day) => day !== from);
  const blockCount = blueprint.days[from].blocks.length;
  const overwriting = selected.filter(
    (day) => blueprint.days[day].blocks.length > 0,
  );

  function toggle(day: DayOfWeek) {
    setSelected((current) =>
      current.includes(day) ? current.filter((d) => d !== day) : [...current, day],
    );
  }

  function close() {
    setSelected([]);
    onClose();
  }

  return (
    <Modal open={open} onClose={close} title={`Copy ${DAY_LABELS[from]} to…`}>
      <div className="flex flex-col gap-3">
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Copies {blockCount} block{blockCount === 1 ? "" : "s"} plus the wake and
          wind-down times. The copies are independent — editing {DAY_LABELS[from]}{" "}
          later won't change them.
        </p>

        <div className="flex flex-col gap-1.5">
          {targets.map((day) => {
            const active = selected.includes(day);
            const existing = blueprint.days[day].blocks.length;
            return (
              <button
                key={day}
                type="button"
                role="checkbox"
                aria-checked={active}
                onClick={() => toggle(day)}
                className={cx(
                  "flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                  active
                    ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40"
                    : "border-neutral-200 hover:border-neutral-300 dark:border-neutral-800 dark:hover:border-neutral-600",
                )}
              >
                <span className="font-medium">{DAY_LABELS[day]}</span>
                <span className="text-xs text-neutral-500 dark:text-neutral-400">
                  {existing === 0
                    ? "empty"
                    : `${existing} block${existing === 1 ? "" : "s"}`}
                </span>
              </button>
            );
          })}
        </div>

        {overwriting.length > 0 && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            This replaces everything on{" "}
            {overwriting.map((d) => DAY_LABELS[d]).join(", ")}. That can't be undone.
          </p>
        )}

        <div className="mt-1 flex justify-end gap-2">
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={selected.length === 0}
            onClick={() => {
              onCopy(selected);
              close();
            }}
          >
            Copy to {selected.length || ""} day{selected.length === 1 ? "" : "s"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
