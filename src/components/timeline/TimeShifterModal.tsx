import { ArrowLeft, ArrowRight } from "lucide-react";
import { Modal } from "../common/Modal";
import { Button } from "../common/Button";
import type { ShiftDeltaMinutes, ShiftMagnitudeMinutes } from "../../engine/timeShifter";

const MAGNITUDES: readonly ShiftMagnitudeMinutes[] = [15, 30, 45, 60];

interface TimeShifterModalProps {
  open: boolean;
  onClose: () => void;
  onShift: (delta: ShiftDeltaMinutes) => void;
}

/**
 * Shifts the rest of today in either direction — behind schedule, or
 * ahead of it. Started as a one-way "running late" push; running early
 * is the same operation with the sign flipped, and having only the
 * apologetic direction made the tool feel like it was for failures.
 *
 * Single tap, no confirmation: it's a session-local override (see
 * useCalendar's shiftToday) and re-openable, so a second "are you sure"
 * would just be friction for someone already off-schedule.
 */
export function TimeShifterModal({ open, onClose, onShift }: TimeShifterModalProps) {
  function shift(delta: ShiftDeltaMinutes) {
    onShift(delta);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Shift today's schedule">
      <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
        Moves everything still ahead of you. Fixed appointments stay put — only
        flexible blocks move, and they shift around them.
      </p>

      <div className="flex flex-col gap-4">
        <section>
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-300">
            <ArrowLeft className="size-3.5" /> Running early — start sooner
          </p>
          <div className="grid grid-cols-4 gap-2">
            {MAGNITUDES.map((minutes) => (
              <Button
                key={`earlier-${minutes}`}
                variant="secondary"
                size="sm"
                onClick={() => shift(-minutes as ShiftDeltaMinutes)}
              >
                −{minutes}m
              </Button>
            ))}
          </div>
        </section>

        <section>
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-300">
            <ArrowRight className="size-3.5" /> Running late — push back
          </p>
          <div className="grid grid-cols-4 gap-2">
            {MAGNITUDES.map((minutes) => (
              <Button
                key={`later-${minutes}`}
                variant="secondary"
                size="sm"
                onClick={() => shift(minutes)}
              >
                +{minutes}m
              </Button>
            ))}
          </div>
        </section>
      </div>

      <p className="mt-4 text-xs text-neutral-400 dark:text-neutral-600">
        Pulling earlier stops at the current time — nothing gets moved into the
        past.
      </p>
    </Modal>
  );
}
