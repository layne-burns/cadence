import { Modal } from "../common/Modal";
import { AppearancePanel } from "./AppearancePanel";
import { GistConfigPanel } from "./GistConfigPanel";
import { ImportExportPanel } from "./ImportExportPanel";
import type { UseSyncResult } from "../../hooks/useSync";
import type { UseThemeResult } from "../../hooks/useTheme";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  sync: UseSyncResult;
  theme: UseThemeResult;
}

/**
 * One settings modal with three sections, rather than the separate
 * `GistConfigModal` and `ImportExportModal` the original spec's file list
 * named. Two entry points into two modals would need its own menu to
 * choose between them, and sync and backup are the same mental category
 * ("where does my data live") — so they're panels here instead. Same
 * components, one container.
 */
export function SettingsModal({ open, onClose, sync, theme }: SettingsModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="Settings">
      <div className="flex flex-col gap-5">
        <AppearancePanel theme={theme} />
        <hr className="border-neutral-200 dark:border-neutral-800" />
        <GistConfigPanel sync={sync} />
        <hr className="border-neutral-200 dark:border-neutral-800" />
        <ImportExportPanel />
      </div>
    </Modal>
  );
}
