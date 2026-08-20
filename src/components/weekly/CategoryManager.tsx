import { Plus, Sparkles, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Modal } from "../common/Modal";
import { Button } from "../common/Button";
import { Input } from "../common/Input";
import { buildCategoryTree } from "../../lib/categories";
import { STARTER_TAXONOMY_CATEGORY_COUNT } from "../../lib/taxonomy";
import type { Category } from "../../types/schedule";

const DEFAULT_COLOR = "#6366f1";

interface CategoryManagerProps {
  open: boolean;
  onClose: () => void;
  categories: Category[];
  onAdd: (name: string, color: string, parentId?: string) => void;
  onUpdate: (id: string, patch: Partial<Omit<Category, "id">>) => void;
  /** Resolves to a reason string when removal is blocked, null on success. */
  onRemove: (id: string) => Promise<string | null> | string | null;
  onApplyTaxonomy: () => void;
}

export function CategoryManager({
  open,
  onClose,
  categories,
  onAdd,
  onUpdate,
  onRemove,
  onApplyTaxonomy,
}: CategoryManagerProps) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);
  // Which parent a new subcategory is being added under; null means the
  // bottom form is adding a top-level category.
  const [addingChildTo, setAddingChildTo] = useState<string | null>(null);
  const [childName, setChildName] = useState("");
  const [confirmingTaxonomy, setConfirmingTaxonomy] = useState(false);

  const tree = buildCategoryTree(categories);

  function handleAddTopLevel(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    onAdd(name.trim(), color);
    setName("");
    setColor(DEFAULT_COLOR);
  }

  function handleAddChild(parent: Category, event: FormEvent) {
    event.preventDefault();
    if (!childName.trim()) return;
    // Inherits the parent's colour so charts stay grouped by top-level by
    // default; it stays editable afterwards.
    onAdd(childName.trim(), parent.color, parent.id);
    setChildName("");
    setAddingChildTo(null);
  }

  async function handleRemove(category: Category) {
    setBlockedMessage(null);
    const reason = await onRemove(category.id);
    if (reason) {
      setBlockedMessage(`"${category.name}" is ${reason} — resolve that first.`);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Categories">
      <div className="flex flex-col gap-3">
        {categories.length === 0 && (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            No categories yet. Start from the suggested set below, or add your own.
          </p>
        )}

        <div className="flex max-h-[45vh] flex-col gap-3 overflow-y-auto">
          {tree.map(({ category, children }) => (
            <div key={category.id} className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  aria-label={`Color for ${category.name}`}
                  value={category.color}
                  onChange={(e) => onUpdate(category.id, { color: e.target.value })}
                  className="size-8 shrink-0 cursor-pointer rounded border border-neutral-300 dark:border-neutral-700"
                />
                <input
                  aria-label={`Name for ${category.name}`}
                  value={category.name}
                  onChange={(e) => onUpdate(category.id, { name: e.target.value })}
                  className="min-w-0 flex-1 rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-sm font-medium text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                />
                <button
                  type="button"
                  onClick={() =>
                    setAddingChildTo(addingChildTo === category.id ? null : category.id)
                  }
                  aria-label={`Add subcategory to ${category.name}`}
                  title="Add subcategory"
                  className="shrink-0 rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800"
                >
                  <Plus className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => void handleRemove(category)}
                  aria-label={`Delete ${category.name}`}
                  className="shrink-0 rounded-md p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>

              {children.length > 0 && (
                <ul className="ml-4 flex flex-col gap-1.5 border-l border-neutral-200 pl-3 dark:border-neutral-800">
                  {children.map((child) => (
                    <li key={child.id} className="flex items-center gap-2">
                      <input
                        type="color"
                        aria-label={`Color for ${child.name}`}
                        value={child.color}
                        onChange={(e) => onUpdate(child.id, { color: e.target.value })}
                        className="size-6 shrink-0 cursor-pointer rounded border border-neutral-300 dark:border-neutral-700"
                      />
                      <input
                        aria-label={`Name for ${child.name}`}
                        value={child.name}
                        onChange={(e) => onUpdate(child.id, { name: e.target.value })}
                        className="min-w-0 flex-1 rounded-lg border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                      />
                      <button
                        type="button"
                        onClick={() => void handleRemove(child)}
                        aria-label={`Delete ${child.name}`}
                        className="shrink-0 rounded-md p-1 text-neutral-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {addingChildTo === category.id && (
                <form
                  onSubmit={(e) => handleAddChild(category, e)}
                  className="ml-4 flex items-center gap-2 border-l border-neutral-200 pl-3 dark:border-neutral-800"
                >
                  <input
                    autoFocus
                    value={childName}
                    onChange={(e) => setChildName(e.target.value)}
                    placeholder={`New subcategory of ${category.name}`}
                    className="min-w-0 flex-1 rounded-lg border border-neutral-300 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                  />
                  <Button type="submit" variant="secondary" size="sm">
                    Add
                  </Button>
                </form>
              )}
            </div>
          ))}
        </div>

        {blockedMessage && (
          <p className="text-sm text-red-600 dark:text-red-400">{blockedMessage}</p>
        )}

        <form
          onSubmit={handleAddTopLevel}
          className="flex items-end gap-2 border-t border-neutral-200 pt-3 dark:border-neutral-800"
        >
          <input
            type="color"
            aria-label="New category color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="size-8 shrink-0 cursor-pointer self-center rounded border border-neutral-300 dark:border-neutral-700"
          />
          <div className="flex-1">
            <Input
              label="New top-level category"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Academics"
            />
          </div>
          <Button type="submit" variant="secondary" size="sm">
            Add
          </Button>
        </form>

        {confirmingTaxonomy ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950">
            <p className="text-xs text-amber-800 dark:text-amber-200">
              Installs {STARTER_TAXONOMY_CATEGORY_COUNT} categories and subcategories.
              Categories you already have with a matching name are kept (so your
              existing blocks keep working) and recoloured to fit the new palette.
              Anything not in the set is left alone.
            </p>
            <div className="mt-2 flex gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  onApplyTaxonomy();
                  setConfirmingTaxonomy(false);
                }}
              >
                Apply suggested set
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmingTaxonomy(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirmingTaxonomy(true)}
            className="self-start"
          >
            <Sparkles className="size-4" /> Use suggested categories
          </Button>
        )}
      </div>
    </Modal>
  );
}
