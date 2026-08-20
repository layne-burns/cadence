import { AppearancePanel } from "./AppearancePanel";
import { GistConfigPanel } from "./GistConfigPanel";
import { ImportExportPanel } from "./ImportExportPanel";
import { StreakRulesPanel } from "./StreakRulesPanel";
import type { UseSyncResult } from "../../hooks/useSync";
import type { UseThemeResult } from "../../hooks/useTheme";
import type { UseSettingsResult } from "../../hooks/useSettings";

interface SettingsScreenProps {
  sync: UseSyncResult;
  theme: UseThemeResult;
  settings: UseSettingsResult;
}

/**
 * Settings as a full nav destination rather than the header-icon modal it
 * started as. The modal was fine for three panels; it doesn't scale to a
 * settings surface that's expected to keep growing, and a scrolling
 * dialog on a phone is a worse place to live than a screen.
 */
export function SettingsScreen({ sync, theme, settings }: SettingsScreenProps) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4">
      <AppearancePanel theme={theme} />
      <hr className="border-neutral-200 dark:border-neutral-800" />
      {settings.loading ? (
        <p className="text-sm text-neutral-400 dark:text-neutral-600">Loading…</p>
      ) : (
        <StreakRulesPanel
          streak={settings.settings.streak}
          onChange={(patch) => void settings.updateStreakSettings(patch)}
        />
      )}
      <hr className="border-neutral-200 dark:border-neutral-800" />
      <GistConfigPanel sync={sync} />
      <hr className="border-neutral-200 dark:border-neutral-800" />
      <ImportExportPanel />
    </div>
  );
}
