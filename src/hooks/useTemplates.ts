/**
 * Loads and persists the `WeeklyBlueprint`, plus the CRUD surface the
 * Phase 6 blueprint editor actually needs: categories and per-day
 * routine blocks. Everything here is built on top of one primitive,
 * `updateBlueprint(updater)`, so each mutation is a small pure function
 * over the current blueprint rather than its own bespoke read-modify-
 * write.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import * as db from "../services/db";
import { createEmptyBlueprint, type WeeklyBlueprint } from "../types/template";
import type { Category, DayOfWeek, RoutineBlock } from "../types/schedule";

export interface UseTemplatesResult {
  blueprint: WeeklyBlueprint;
  loading: boolean;
  updateBlueprint: (
    updater: (current: WeeklyBlueprint) => WeeklyBlueprint,
  ) => Promise<void>;
  addCategory: (name: string, color: string) => Promise<Category>;
  updateCategory: (id: string, patch: Partial<Omit<Category, "id">>) => Promise<void>;
  /** Returns false (and makes no change) if the category is still in use
   * by a block on any day — RoutineBlock.categoryId is required, so
   * deleting an in-use category would leave a dangling reference. */
  removeCategory: (id: string) => Promise<boolean>;
  updateDayWindow: (
    day: DayOfWeek,
    wakeMinutes: number,
    windDownMinutes: number,
  ) => Promise<void>;
  addBlock: (day: DayOfWeek, block: Omit<RoutineBlock, "id">) => Promise<void>;
  updateBlock: (
    day: DayOfWeek,
    blockId: string,
    patch: Partial<Omit<RoutineBlock, "id">>,
  ) => Promise<void>;
  removeBlock: (day: DayOfWeek, blockId: string) => Promise<void>;
  /**
   * Copies `from`'s blocks and wake/wind-down times onto each day in
   * `to`, replacing whatever those days held.
   *
   * Copies, not links: the pasted blocks get fresh ids and thereafter
   * have no relationship to the source. Linking would mean editing
   * Monday silently rewrites Tuesday through Friday, which needs an
   * unlink concept and a way to see what's linked before it's
   * predictable. Copies are dumber and never surprise anyone.
   */
  copyDayTo: (from: DayOfWeek, to: DayOfWeek[]) => Promise<void>;
}

export function useTemplates(): UseTemplatesResult {
  const [blueprint, setBlueprint] = useState<WeeklyBlueprint>(() =>
    createEmptyBlueprint(),
  );
  const [loading, setLoading] = useState(true);
  // Lets updateBlueprint read the latest value without depending on
  // `blueprint` in its own useCallback deps (which would change its
  // identity — and thus any effect depending on it — on every edit).
  const blueprintRef = useRef(blueprint);
  useEffect(() => {
    blueprintRef.current = blueprint;
  });

  useEffect(() => {
    let cancelled = false;
    void db.getBlueprint().then((loaded) => {
      if (cancelled) return;
      setBlueprint(loaded);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const updateBlueprint = useCallback(
    async (updater: (current: WeeklyBlueprint) => WeeklyBlueprint) => {
      const next = updater(blueprintRef.current);
      setBlueprint(next);
      await db.saveBlueprint(next);
    },
    [],
  );

  const addCategory = useCallback(
    async (name: string, color: string) => {
      const category: Category = { id: crypto.randomUUID(), name, color };
      await updateBlueprint((current) => ({
        ...current,
        categories: [...current.categories, category],
      }));
      return category;
    },
    [updateBlueprint],
  );

  const updateCategory = useCallback(
    async (id: string, patch: Partial<Omit<Category, "id">>) => {
      await updateBlueprint((current) => ({
        ...current,
        categories: current.categories.map((category) =>
          category.id === id ? { ...category, ...patch } : category,
        ),
      }));
    },
    [updateBlueprint],
  );

  const removeCategory = useCallback(
    async (id: string) => {
      const current = blueprintRef.current;
      const inUse = Object.values(current.days).some((day) =>
        day.blocks.some((block) => block.categoryId === id),
      );
      if (inUse) return false;
      await updateBlueprint((c) => ({
        ...c,
        categories: c.categories.filter((category) => category.id !== id),
      }));
      return true;
    },
    [updateBlueprint],
  );

  const updateDayWindow = useCallback(
    async (day: DayOfWeek, wakeMinutes: number, windDownMinutes: number) => {
      await updateBlueprint((current) => ({
        ...current,
        days: {
          ...current.days,
          [day]: { ...current.days[day], wakeMinutes, windDownMinutes },
        },
      }));
    },
    [updateBlueprint],
  );

  const addBlock = useCallback(
    async (day: DayOfWeek, block: Omit<RoutineBlock, "id">) => {
      const newBlock: RoutineBlock = { ...block, id: crypto.randomUUID() };
      await updateBlueprint((current) => ({
        ...current,
        days: {
          ...current.days,
          [day]: {
            ...current.days[day],
            blocks: [...current.days[day].blocks, newBlock],
          },
        },
      }));
    },
    [updateBlueprint],
  );

  const updateBlock = useCallback(
    async (day: DayOfWeek, blockId: string, patch: Partial<Omit<RoutineBlock, "id">>) => {
      await updateBlueprint((current) => ({
        ...current,
        days: {
          ...current.days,
          [day]: {
            ...current.days[day],
            blocks: current.days[day].blocks.map((block) =>
              block.id === blockId ? { ...block, ...patch } : block,
            ),
          },
        },
      }));
    },
    [updateBlueprint],
  );

  const removeBlock = useCallback(
    async (day: DayOfWeek, blockId: string) => {
      await updateBlueprint((current) => ({
        ...current,
        days: {
          ...current.days,
          [day]: {
            ...current.days[day],
            blocks: current.days[day].blocks.filter((block) => block.id !== blockId),
          },
        },
      }));
    },
    [updateBlueprint],
  );

  const copyDayTo = useCallback(
    async (from: DayOfWeek, to: DayOfWeek[]) => {
      await updateBlueprint((current) => {
        const source = current.days[from];
        const days = { ...current.days };
        for (const target of to) {
          if (target === from) continue; // copying a day onto itself is a no-op
          days[target] = {
            ...source,
            day: target,
            // Fresh ids: block ids must be unique across the blueprint,
            // and reusing the source's would make two days' blocks
            // indistinguishable to adherence logging, which keys check-ins
            // by the rendered id derived from them.
            blocks: source.blocks.map((block) => ({
              ...block,
              id: crypto.randomUUID(),
            })),
          };
        }
        return { ...current, days };
      });
    },
    [updateBlueprint],
  );

  return {
    blueprint,
    loading,
    updateBlueprint,
    addCategory,
    updateCategory,
    removeCategory,
    updateDayWindow,
    addBlock,
    updateBlock,
    removeBlock,
    copyDayTo,
  };
}
