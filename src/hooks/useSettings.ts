/**
 * Loads and persists `AppSettings`. Same shape as `useTemplates`: one
 * instance at the App root, threaded down as a parameter to anything that
 * needs it, rather than each consumer calling the hook and ending up with
 * its own drifting copy.
 *
 * That matters more here than it looks: `useStreak` reads settings to
 * decide which days to exclude. If it held a separate instance from the
 * settings screen, toggling "ignore Saturdays" wouldn't affect streak
 * recalculation until a reload.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import * as db from "../services/db";
import { createDefaultSettings, type AppSettings, type StreakSettings } from "../types/settings";

export interface UseSettingsResult {
  settings: AppSettings;
  loading: boolean;
  updateStreakSettings: (patch: Partial<StreakSettings>) => Promise<void>;
}

export function useSettings(): UseSettingsResult {
  const [settings, setSettings] = useState<AppSettings>(createDefaultSettings);
  const [loading, setLoading] = useState(true);
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  });

  useEffect(() => {
    let cancelled = false;
    void db.getSettings().then((loaded) => {
      if (cancelled) return;
      setSettings(loaded);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const updateStreakSettings = useCallback(async (patch: Partial<StreakSettings>) => {
    const next: AppSettings = {
      ...settingsRef.current,
      streak: { ...settingsRef.current.streak, ...patch },
    };
    setSettings(next);
    await db.saveSettings(next);
  }, []);

  return { settings, loading, updateStreakSettings };
}
