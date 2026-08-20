import { useState, type FormEvent } from "react";
import { Button } from "../common/Button";
import { Input } from "../common/Input";
import { minutesToTimeInputValue, parseTimeInputToMinutes } from "../../lib/time";
import type { NewEventInput } from "../../hooks/useSchedule";
import type { OneOffEvent } from "../../types/schedule";

interface EventFormProps {
  /** Present when editing an existing event; omitted when creating one.
   * Callers must give the form a changing `key` so these initial values
   * are actually re-read — see DayTemplateEditor's note on Modal keeping
   * children mounted. */
  initial?: OneOffEvent;
  submitLabel?: string;
  onSubmit: (values: NewEventInput) => void;
  onCancel: () => void;
}

export function EventForm({
  initial,
  submitLabel = "Add event",
  onSubmit,
  onCancel,
}: EventFormProps) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [start, setStart] = useState(
    minutesToTimeInputValue(initial?.startMinutes ?? 9 * 60),
  );
  const [end, setEnd] = useState(minutesToTimeInputValue(initial?.endMinutes ?? 10 * 60));
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const startMinutes = parseTimeInputToMinutes(start);
    const endMinutes = parseTimeInputToMinutes(end);

    if (!title.trim()) {
      setError("Give it a title.");
      return;
    }
    if (endMinutes <= startMinutes) {
      setError("End time must be after start time.");
      return;
    }

    onSubmit({
      title: title.trim(),
      startMinutes,
      endMinutes,
      notes: notes.trim() || undefined,
      // Preserved across an edit — the form doesn't expose these yet, and
      // dropping them would silently strip an event's category/color.
      categoryId: initial?.categoryId,
      color: initial?.color,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <Input
        label="Title"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Committee meeting"
        autoFocus
      />
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Start"
          type="time"
          value={start}
          onChange={(event) => setStart(event.target.value)}
        />
        <Input
          label="End"
          type="time"
          value={end}
          onChange={(event) => setEnd(event.target.value)}
        />
      </div>
      <Input
        label="Notes (optional)"
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
      />
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <div className="mt-1 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
