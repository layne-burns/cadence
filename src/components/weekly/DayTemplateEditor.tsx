import { Copy, Pencil, Plus, Settings2, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "../common/Button";
import { Input } from "../common/Input";
import { Modal } from "../common/Modal";
import { BlockForm } from "./BlockForm";
import { CategoryManager } from "./CategoryManager";
import { CopyDayModal } from "./CopyDayModal";
import { formatMinutes, minutesToTimeInputValue, parseTimeInputToMinutes } from "../../lib/time";
import { cx } from "../../lib/cx";
import type { Category, DayOfWeek, RoutineBlock } from "../../types/schedule";
import type { DayTemplate, WeeklyBlueprint } from "../../types/template";

interface DayTemplateEditorProps {
  day: DayOfWeek;
  template: DayTemplate;
  categories: Category[];
  onUpdateWindow: (wakeMinutes: number, windDownMinutes: number) => void;
  onAddBlock: (block: Omit<RoutineBlock, "id">) => void;
  onUpdateBlock: (blockId: string, patch: Partial<Omit<RoutineBlock, "id">>) => void;
  onRemoveBlock: (blockId: string) => void;
  onAddCategory: (name: string, color: string) => void;
  onUpdateCategory: (id: string, patch: Partial<Omit<Category, "id">>) => void;
  onRemoveCategory: (id: string) => Promise<boolean> | boolean;
  blueprint: WeeklyBlueprint;
  onCopyDayTo: (to: DayOfWeek[]) => void;
}

export function DayTemplateEditor({
  day,
  template,
  categories,
  onUpdateWindow,
  onAddBlock,
  onUpdateBlock,
  onRemoveBlock,
  onAddCategory,
  onUpdateCategory,
  onRemoveCategory,
  blueprint,
  onCopyDayTo,
}: DayTemplateEditorProps) {
  const [blockModal, setBlockModal] = useState<"add" | RoutineBlock | null>(null);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [copyModalOpen, setCopyModalOpen] = useState(false);

  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const sortedBlocks = [...template.blocks].sort((a, b) => a.startMinutes - b.startMinutes);

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Wake"
            type="time"
            value={minutesToTimeInputValue(template.wakeMinutes)}
            onChange={(event) =>
              onUpdateWindow(parseTimeInputToMinutes(event.target.value), template.windDownMinutes)
            }
          />
          <Input
            label="Wind-down"
            type="time"
            value={minutesToTimeInputValue(template.windDownMinutes)}
            onChange={(event) =>
              onUpdateWindow(template.wakeMinutes, parseTimeInputToMinutes(event.target.value))
            }
          />
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCategoryModalOpen(true)}
          aria-label="Manage categories"
        >
          <Settings2 className="size-4" /> Categories
        </Button>
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
          {sortedBlocks.length === 0
            ? "No blocks yet"
            : `${sortedBlocks.length} block${sortedBlocks.length === 1 ? "" : "s"}`}
        </h3>
        <div className="flex gap-2">
          {sortedBlocks.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setCopyModalOpen(true)}>
              <Copy className="size-4" /> Copy to…
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={() => setBlockModal("add")}>
            <Plus className="size-4" /> Add block
          </Button>
        </div>
      </div>

      {sortedBlocks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
          Nothing scheduled on this day yet.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {sortedBlocks.map((block) => {
            const category = categoryById.get(block.categoryId);
            return (
              <li
                key={block.id}
                className="flex items-center gap-3 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800"
              >
                <span
                  className="h-8 w-1 shrink-0 rounded-full"
                  style={{ backgroundColor: block.color ?? category?.color ?? "#a3a3a3" }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{block.title}</p>
                  <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                    {formatMinutes(block.startMinutes)} – {formatMinutes(block.endMinutes)}
                    {category ? ` · ${category.name}` : ""}
                    {block.flexibility === "fixed" ? " · Fixed" : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setBlockModal(block)}
                  aria-label={`Edit ${block.title}`}
                  className="shrink-0 rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
                >
                  <Pencil className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onRemoveBlock(block.id)}
                  aria-label={`Delete ${block.title}`}
                  className={cx(
                    "shrink-0 rounded-md p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-600 dark:text-neutral-500 dark:hover:bg-red-950 dark:hover:text-red-400",
                  )}
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={blockModal !== null}
        onClose={() => setBlockModal(null)}
        title={blockModal === "add" ? `Add block — ${day}` : `Edit block`}
      >
        <BlockForm
          // Modal keeps its children mounted permanently (it only toggles
          // the native <dialog>'s visibility, not React mount state), so
          // without a key that changes per target, BlockForm's useState
          // initializers (title, categoryId, ...) would only ever run once
          // — showing stale data when editing a different block, or a
          // wrong default category picked before any category existed at
          // the modal's original mount time. Real usage always passes
          // through "closed" between two opens (you can't click another
          // block's edit button while this modal covers the list), so a
          // simple state-derived key is enough to force a fresh mount.
          key={blockModal === null ? "closed" : blockModal === "add" ? "add" : blockModal.id}
          categories={categories}
          initial={blockModal && blockModal !== "add" ? blockModal : undefined}
          onCancel={() => setBlockModal(null)}
          onRequestNewCategory={() => {
            setBlockModal(null);
            setCategoryModalOpen(true);
          }}
          onSubmit={(values) => {
            if (blockModal && blockModal !== "add") {
              onUpdateBlock(blockModal.id, values);
            } else {
              onAddBlock(values);
            }
            setBlockModal(null);
          }}
        />
      </Modal>

      <CopyDayModal
        // Fresh selection state each time it opens.
        key={copyModalOpen ? `copy-${day}` : "copy-closed"}
        open={copyModalOpen}
        from={day}
        blueprint={blueprint}
        onClose={() => setCopyModalOpen(false)}
        onCopy={onCopyDayTo}
      />

      <CategoryManager
        open={categoryModalOpen}
        onClose={() => setCategoryModalOpen(false)}
        categories={categories}
        onAdd={onAddCategory}
        onUpdate={onUpdateCategory}
        onRemove={onRemoveCategory}
      />
    </div>
  );
}
