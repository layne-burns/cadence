import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { useState } from "react";
import { Modal } from "../common/Modal";
import { Button } from "../common/Button";
import { formatMinutes } from "../../lib/time";
import { cx } from "../../lib/cx";
import type { ShiftDeltaMinutes, ShiftMagnitudeMinutes } from "../../engine/timeShifter";
import type { RoutineBlock } from "../../types/schedule";

const MAGNITUDES: readonly ShiftMagnitudeMinutes[] = [15, 30, 45, 60];

interface TimeShifterModalProps {
  open: boolean;
  onClose: () => void;
  /** Flexible blocks still ahead — the only things a shift can move.
   * Comes from the engine's own `getShiftableBlocks` so the list and the
   * operation can't disagree. */
  shiftableBlocks: RoutineBlock[];
  onShift: (delta: ShiftDeltaMinutes, blockIds: string[]) => void;
}

/**
 * Shifts the rest of today in either direction — behind schedule, or
 * ahead of it — over all remaining blocks or a chosen subset.
 *
 * Started as a one-way "running late" push. Running early is the same
 * operation with the sign flipped, and having only the apologetic
 * direction framed the tool as being for failures. Subset selection
 * came next: pushing the afternoon back while the morning stays put is
 * a normal thing to want, and shifting everything was too blunt for it.
 *
 * Selection defaults to everything, so the common case stays two taps.
 */
export function TimeShifterModal({
  open,
  onClose,
  shiftableBlocks,
  onShift,
}: TimeShifterModalProps) {
  // `null` means "all of them" rather than a pre-filled id list, so the
  // default survives the block list changing underneath (a shift applied,
  // an event added) without going stale.
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());

  const selectedIds = shiftableBlocks
    .filter((block) => !excludedIds.has(block.id))
    .map((block) => block.id);
  const allSelected = selectedIds.length === shiftableBlocks.length;
  const noneSelected = selectedIds.length === 0;

  function toggle(id: string) {
    setExcludedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function shift(delta: ShiftDeltaMinutes) {
    onShift(delta, selectedIds);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Shift today's schedule">
      {shiftableBlocks.length === 0 ? (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Nothing left to move today — a shift only affects flexible blocks that
          haven't started yet.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                Move these ({selectedIds.length} of {shiftableBlocks.length})
              </p>
              <button
                type="button"
                onClick={() =>
                  setExcludedIds(
                    allSelected ? new Set(shiftableBlocks.map((b) => b.id)) : new Set(),
                  )
                }
                className="text-xs font-medium text-indigo-500 hover:underline"
              >
                {allSelected ? "Clear all" : "Select all"}
              </button>
            </div>
            <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto">
              {shiftableBlocks.map((block) => {
                const selected = !excludedIds.has(block.id);
                return (
                  <li key={block.id}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={selected}
                      onClick={() => toggle(block.id)}
                      className={cx(
                        "flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-1.5 text-left transition-colors",
                        selected
                          ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40"
                          : "border-neutral-200 dark:border-neutral-800",
                      )}
                    >
                      <span
                        className={cx(
                          "flex size-4 shrink-0 items-center justify-center rounded border",
                          selected
                            ? "border-indigo-500 bg-indigo-500 text-white"
                            : "border-neutral-300 text-transparent dark:border-neutral-600",
                        )}
                      >
                        <Check className="size-3" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {block.title}
                      </span>
                      <span className="shrink-0 text-xs text-neutral-500 dark:text-neutral-400">
                        {formatMinutes(block.startMinutes)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

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
                  disabled={noneSelected}
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
                  disabled={noneSelected}
                  onClick={() => shift(minutes)}
                >
                  +{minutes}m
                </Button>
              ))}
            </div>
          </section>

          <p className="text-xs text-neutral-400 dark:text-neutral-600">
            Fixed appointments never move. Pulling earlier stops at the current
            time — nothing gets moved into the past.
          </p>
        </div>
      )}
    </Modal>
  );
}
