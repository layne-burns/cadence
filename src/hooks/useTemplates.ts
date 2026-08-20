/**
 * Loads and persists the `WeeklyBlueprint`. Deliberately minimal for now —
 * a single `updateBlueprint(updater)` escape hatch rather than a full
 * CRUD surface (addBlock/removeCategory/etc.) — because the actual
 * editor UI that would call those doesn't exist until Phase 6's blueprint
 * builder. Add the convenience methods then, against a real caller,
 * instead of guessing the shape now.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import * as db from "../services/db";
import { createEmptyBlueprint, type WeeklyBlueprint } from "../types/template";

export interface UseTemplatesResult {
  blueprint: WeeklyBlueprint;
  loading: boolean;
  updateBlueprint: (
    updater: (current: WeeklyBlueprint) => WeeklyBlueprint,
  ) => Promise<void>;
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

  return { blueprint, loading, updateBlueprint };
}
