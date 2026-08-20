import { Check, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { Modal } from "../common/Modal";
import { Button } from "../common/Button";
import { Badge } from "../common/Badge";
import { EventForm } from "./EventForm";
import { formatDateLabel, formatMinutes } from "../../lib/time";
import type { Category, OneOffEvent, RenderedBlock } from "../../types/schedule";
import type { NewEventInput } from "../../hooks/useSchedule";

interface BlockDetailModalProps {
  /** The block being inspected; null when the modal is closed. */
  block: RenderedBlock | null;
  date: string;
  completed: boolean;
  categories: Category[];
  /** The underlying event, when this block came from one — that's what
   * makes editing and deleting possible. Routine blocks have no
   * equivalent here; they're edited in Blueprint. */
  sourceEvent: OneOffEvent | null;
  onClose: () => void;
  onToggleComplete: () => void;
  onUpdateEvent: (id: string, values: NewEventInput) => void;
  onDeleteEvent: (id: string) => void;
}

/**
 * The overflow surface for a timeline block: everything a short card
 * couldn't show, plus the only place a one-off event can be edited or
 * deleted. Before this existed, a typo'd event was permanent short of
 * re-importing a backup.
 */
export function BlockDetailModal({
  block,
  date,
  completed,
  categories,
  sourceEvent,
  onClose,
  onToggleComplete,
  onUpdateEvent,
  onDeleteEvent,
}: BlockDetailModalProps) {
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function close() {
    setEditing(false);
    setConfirmingDelete(false);
    onClose();
  }

  const category = block?.categoryId
    ? categories.find((c) => c.id === block.categoryId)
    : undefined;
  const durationMinutes = block ? block.endMinutes - block.startMinutes : 0;

  return (
    <Modal
      open={block !== null}
      onClose={close}
      title={editing ? "Edit event" : (block?.title ?? "Block")}
    >
      {block === null ? null : editing && sourceEvent ? (
        <EventForm
          // Fresh mount per edit target — see DayTemplateEditor's note on
          // Modal keeping its children mounted.
          key={`edit-${sourceEvent.id}`}
          initial={sourceEvent}
          submitLabel="Save changes"
          onCancel={() => setEditing(false)}
          onSubmit={(values) => {
            onUpdateEvent(sourceEvent.id, values);
            close();
          }}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            {block.partIndex !== undefined && (
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Part {block.partIndex} — split around a fixed event
              </p>
            )}
            <p className="text-sm">
              {formatMinutes(block.startMinutes)} – {formatMinutes(block.endMinutes)}
              <span className="text-neutral-500 dark:text-neutral-400">
                {" "}
                · {durationMinutes} min
              </span>
            </p>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {formatDateLabel(date)}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {category && <Badge color={category.color}>{category.name}</Badge>}
              <Badge>{block.kind === "event" ? "One-off event" : "Routine"}</Badge>
              {block.kind === "routine" && (
                <Badge>{block.flexibility === "fixed" ? "Fixed" : "Flexible"}</Badge>
              )}
            </div>
          </div>

          {sourceEvent?.notes && (
            <p className="whitespace-pre-wrap rounded-lg bg-neutral-50 p-3 text-sm text-neutral-700 dark:bg-neutral-800/50 dark:text-neutral-300">
              {sourceEvent.notes}
            </p>
          )}

          {block.kind === "routine" && (
            <p className="text-xs text-neutral-400 dark:text-neutral-600">
              This comes from your weekly blueprint. Edit it in Blueprint to change
              it on every matching day.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              variant={completed ? "secondary" : "primary"}
              size="sm"
              onClick={() => {
                onToggleComplete();
                close();
              }}
            >
              <Check className="size-4" />
              {completed ? "Mark not done" : "Mark done"}
            </Button>
            {sourceEvent && (
              <>
                <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
                  <Pencil className="size-4" /> Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmingDelete(true)}
                >
                  <Trash2 className="size-4" /> Delete
                </Button>
              </>
            )}
          </div>

          {confirmingDelete && sourceEvent && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950">
              <p className="text-xs text-red-700 dark:text-red-300">
                Delete "{sourceEvent.title}"? Routine blocks it was splitting will
                close back up.
              </p>
              <div className="mt-2 flex gap-2">
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => {
                    onDeleteEvent(sourceEvent.id);
                    close();
                  }}
                >
                  Delete event
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmingDelete(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
