import { AlertCircle, Check, CloudOff, RefreshCw } from "lucide-react";
import type { SyncStatus } from "../../types/gist";
import { cx } from "../../lib/cx";

interface SyncIndicatorProps {
  status: SyncStatus;
  /** Hidden entirely until sync is set up — an icon reporting on a
   * feature you haven't configured is noise, not information. */
  isConfigured: boolean;
  onClick: () => void;
}

/**
 * A small always-visible sync state in the header. Without it, the only
 * way to know whether your devices were actually in step was to open
 * Settings and read the status line — which defeats "seamless", because
 * you end up checking manually anyway.
 *
 * Deliberately quiet: a synced state is a muted tick, not a badge. It
 * only draws attention when something is wrong.
 */
export function SyncIndicator({ status, isConfigured, onClick }: SyncIndicatorProps) {
  if (!isConfigured) return null;

  const { icon, tone, label } = describe(status);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Sync: ${label}`}
      title={label}
      className={cx(
        "flex items-center gap-1 rounded-md px-1.5 py-1 text-xs transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800",
        tone,
      )}
    >
      {icon}
    </button>
  );
}

function describe(status: SyncStatus): {
  icon: React.ReactNode;
  tone: string;
  label: string;
} {
  switch (status.state) {
    case "syncing":
      return {
        icon: <RefreshCw className="size-3.5 animate-spin" />,
        tone: "text-neutral-400 dark:text-neutral-500",
        label: "Syncing…",
      };
    case "synced":
      return {
        icon: <Check className="size-3.5" />,
        tone: "text-neutral-400 dark:text-neutral-600",
        label: `Synced ${new Date(status.lastSyncedAt).toLocaleTimeString()}`,
      };
    case "offline":
      return {
        icon: <CloudOff className="size-3.5" />,
        tone: "text-amber-500",
        label: "Offline — changes are saved locally and will sync later",
      };
    case "error":
      return {
        icon: <AlertCircle className="size-3.5" />,
        tone: "text-red-500",
        label: `Sync problem: ${status.message}`,
      };
    case "conflict":
      return {
        icon: <AlertCircle className="size-3.5" />,
        tone: "text-amber-500",
        label: "Both this device and another one changed — needs a decision",
      };
    case "idle":
      return {
        icon: <RefreshCw className="size-3.5" />,
        tone: "text-neutral-300 dark:text-neutral-700",
        label: "Not synced yet",
      };
  }
}
