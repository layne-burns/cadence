import { Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Modal } from "../common/Modal";
import { Button } from "../common/Button";
import { Input } from "../common/Input";
import type { Category } from "../../types/schedule";

const DEFAULT_COLOR = "#6366f1";

interface CategoryManagerProps {
  open: boolean;
  onClose: () => void;
  categories: Category[];
  onAdd: (name: string, color: string) => void;
  onUpdate: (id: string, patch: Partial<Omit<Category, "id">>) => void;
  /** Returning false means the category is still in use — the caller
   * shows an explanation rather than silently ignoring the click. */
  onRemove: (id: string) => Promise<boolean> | boolean;
}

export function CategoryManager({
  open,
  onClose,
  categories,
  onAdd,
  onUpdate,
  onRemove,
}: CategoryManagerProps) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);

  function handleAdd(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    onAdd(name.trim(), color);
    setName("");
    setColor(DEFAULT_COLOR);
  }

  async function handleRemove(category: Category) {
    setBlockedMessage(null);
    const removed = await onRemove(category.id);
    if (!removed) {
      setBlockedMessage(
        `"${category.name}" is still used by a block — remove or recategorize that block first.`,
      );
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Categories">
      <div className="flex flex-col gap-3">
        {categories.length === 0 && (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            No categories yet — add one below (e.g. "Deep Research", "Chores").
          </p>
        )}
        <ul className="flex flex-col gap-2">
          {categories.map((category) => (
            <li key={category.id} className="flex items-center gap-2">
              <input
                type="color"
                aria-label={`Color for ${category.name}`}
                value={category.color}
                onChange={(event) => onUpdate(category.id, { color: event.target.value })}
                className="size-8 shrink-0 cursor-pointer rounded border border-neutral-300 dark:border-neutral-700"
              />
              <input
                aria-label={`Name for ${category.name}`}
                value={category.name}
                onChange={(event) => onUpdate(category.id, { name: event.target.value })}
                className="min-w-0 flex-1 rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900 focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
              />
              <button
                type="button"
                onClick={() => void handleRemove(category)}
                aria-label={`Delete ${category.name}`}
                className="shrink-0 rounded-md p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-600 dark:text-neutral-500 dark:hover:bg-red-950 dark:hover:text-red-400"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>

        {blockedMessage && (
          <p className="text-sm text-red-600 dark:text-red-400">{blockedMessage}</p>
        )}

        <form onSubmit={handleAdd} className="flex items-end gap-2 border-t border-neutral-200 pt-3 dark:border-neutral-800">
          <input
            type="color"
            aria-label="New category color"
            value={color}
            onChange={(event) => setColor(event.target.value)}
            className="size-8 shrink-0 cursor-pointer self-center rounded border border-neutral-300 dark:border-neutral-700"
          />
          <div className="flex-1">
            <Input
              label="New category"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Deep Research"
            />
          </div>
          <Button type="submit" variant="secondary" size="sm">
            Add
          </Button>
        </form>
      </div>
    </Modal>
  );
}
