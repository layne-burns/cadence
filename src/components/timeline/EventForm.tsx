import { useState, type FormEvent } from "react";
import { Button } from "../common/Button";
import { Input } from "../common/Input";
import { parseTimeInputToMinutes } from "../../lib/time";
import type { NewEventInput } from "../../hooks/useSchedule";

interface EventFormProps {
  onSubmit: (values: NewEventInput) => void;
  onCancel: () => void;
}

export function EventForm({ onSubmit, onCancel }: EventFormProps) {
  const [title, setTitle] = useState("");
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("10:00");
  const [notes, setNotes] = useState("");
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
          Add event
        </Button>
      </div>
    </form>
  );
}
