import { Modal } from "../common/Modal";
import { Button } from "../common/Button";
import type { PushDeltaMinutes } from "../../engine/timeShifter";

const DELTAS: readonly PushDeltaMinutes[] = [15, 30, 45, 60];

interface TimeShifterModalProps {
  open: boolean;
  onClose: () => void;
  onPush: (delta: PushDeltaMinutes) => void;
}

/** The single-tap "running late" tool — a plain grid of delta buttons, no
 * confirmation step. Applying a push is cheap and reversible enough (it's
 * a session-local override — see useCalendar's pushToday) that a second
 * "are you sure" tap would just be friction for someone already behind. */
export function TimeShifterModal({ open, onClose, onPush }: TimeShifterModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="Running late?">
      <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
        Push everything remaining today forward. Fixed appointments won't
        move — flexible blocks shift around them.
      </p>
      <div className="grid grid-cols-2 gap-2">
        {DELTAS.map((delta) => (
          <Button
            key={delta}
            variant="secondary"
            onClick={() => {
              onPush(delta);
              onClose();
            }}
          >
            +{delta} min
          </Button>
        ))}
      </div>
    </Modal>
  );
}
