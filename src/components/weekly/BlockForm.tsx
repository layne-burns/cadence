import { useState, type FormEvent } from "react";
import { Button } from "../common/Button";
import { Input } from "../common/Input";
import { Select } from "../common/Select";
import { minutesToTimeInputValue, parseTimeInputToMinutes } from "../../lib/time";
import { buildCategoryTree } from "../../lib/categories";
import type { Category, Flexibility, RoutineBlock } from "../../types/schedule";

interface BlockFormProps {
  categories: Category[];
  /** Present when editing an existing block; omitted when adding one. */
  initial?: RoutineBlock;
  onSubmit: (values: Omit<RoutineBlock, "id">) => void;
  onCancel: () => void;
  onRequestNewCategory: () => void;
}

export function BlockForm({
  categories,
  initial,
  onSubmit,
  onCancel,
  onRequestNewCategory,
}: BlockFormProps) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [start, setStart] = useState(
    minutesToTimeInputValue(initial?.startMinutes ?? 9 * 60),
  );
  const [end, setEnd] = useState(minutesToTimeInputValue(initial?.endMinutes ?? 10 * 60));
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? categories[0]?.id ?? "");
  const [flexibility, setFlexibility] = useState<Flexibility>(
    initial?.flexibility ?? "flexible",
  );
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const startMinutes = parseTimeInputToMinutes(start);
    const endMinutes = parseTimeInputToMinutes(end);

    if (!title.trim()) {
      setError("Give it a title.");
      return;
    }
    if (!categoryId) {
      setError("Pick a category (or add one first).");
      return;
    }
    if (endMinutes <= startMinutes) {
      setError("End time must be after start time.");
      return;
    }

    onSubmit({ title: title.trim(), startMinutes, endMinutes, categoryId, flexibility });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <Input
        label="Title"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Deep Research"
        autoFocus
      />
      <div className="grid grid-cols-2 gap-3">
        <Input label="Start" type="time" value={start} onChange={(event) => setStart(event.target.value)} />
        <Input label="End" type="time" value={end} onChange={(event) => setEnd(event.target.value)} />
      </div>

      {categories.length === 0 ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-neutral-300 p-3 text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
          <span>No categories yet.</span>
          <Button type="button" variant="secondary" size="sm" onClick={onRequestNewCategory}>
            Add one
          </Button>
        </div>
      ) : (
        <Select
          label="Category"
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
        >
          {/* Parents are selectable options in their own right, not just
              optgroup labels — a block is allowed to sit on "Academics"
              without picking a subcategory, so forcing a leaf here would
              contradict the data model. */}
          {buildCategoryTree(categories).map(({ category, children }) =>
            children.length === 0 ? (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ) : (
              <optgroup key={category.id} label={category.name}>
                <option value={category.id}>{category.name} (general)</option>
                {children.map((child) => (
                  <option key={child.id} value={child.id}>
                    {child.name}
                  </option>
                ))}
              </optgroup>
            ),
          )}
        </Select>
      )}

      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Flexibility
        </legend>
        <div className="flex gap-2">
          <Button
            type="button"
            variant={flexibility === "flexible" ? "primary" : "secondary"}
            size="sm"
            onClick={() => setFlexibility("flexible")}
          >
            Flexible
          </Button>
          <Button
            type="button"
            variant={flexibility === "fixed" ? "primary" : "secondary"}
            size="sm"
            onClick={() => setFlexibility("fixed")}
          >
            Fixed
          </Button>
        </div>
        <p className="text-xs text-neutral-400 dark:text-neutral-600">
          {flexibility === "flexible"
            ? "Can shift when you push a running-late schedule."
            : "Never moves, even when running late (e.g. a class or standing meeting)."}
        </p>
      </fieldset>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="mt-1 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary">
          {initial ? "Save block" : "Add block"}
        </Button>
      </div>
    </form>
  );
}
