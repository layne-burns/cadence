import { useEffect, useState } from "react";
import { Download, Upload } from "lucide-react";
import { Button } from "../common/Button";
import { Input } from "../common/Input";
import type { UseSyncResult } from "../../hooks/useSync";
import type { SyncStatus } from "../../types/gist";
import {
  loadStoredCredentials,
  clearCredentials,
  findCadenceGists,
} from "../../services/gistSync";

function statusLabel(status: SyncStatus): string {
  switch (status.state) {
    case "idle":
      return "Not synced yet";
    case "syncing":
      return "Syncing…";
    case "synced":
      return `Synced at ${new Date(status.lastSyncedAt).toLocaleTimeString()}`;
    case "offline":
      return "Offline — will retry when you're back online";
    case "error":
      return status.message;
    case "conflict":
      return "This device and another both have unsynced changes";
  }
}

function statusToneClass(status: SyncStatus): string {
  if (status.state === "error") return "text-red-600 dark:text-red-400";
  if (status.state === "synced") return "text-emerald-600 dark:text-emerald-400";
  return "text-neutral-500 dark:text-neutral-400";
}

interface GistConfigPanelProps {
  sync: UseSyncResult;
}

/**
 * Settings section for private-Gist sync. Two ways in: paste a PAT alone
 * and let the app create the Gist (`POST /gists`), or paste a PAT plus an
 * existing Gist ID to adopt one already created on another device.
 *
 * The token input is `type="password"` and the stored token is never
 * echoed back into the field on reopen — only whether one exists is
 * shown. There's no reason for the UI to redisplay a secret it already
 * holds, and plenty of reason not to.
 */
export function GistConfigPanel({ sync }: GistConfigPanelProps) {
  const [pat, setPat] = useState("");
  const [gistId, setGistId] = useState("");
  const [busy, setBusy] = useState(false);
  const storedGistId = loadStoredCredentials()?.gistId ?? null;
  const [otherGists, setOtherGists] = useState<Array<{ id: string; updatedAt: string }>>(
    [],
  );

  // Look for the split-brain case: more than one Cadence gist on the
  // account means some device created its own instead of joining the
  // existing one, and the devices are silently diverging.
  useEffect(() => {
    const credentials = loadStoredCredentials();
    if (!credentials?.gistId) return;
    let cancelled = false;
    void findCadenceGists(credentials.pat)
      .then((gists) => {
        if (cancelled) return;
        // Only the ones this device *isn't* using. Having extras is only
        // a problem if another device is pointed at one of them, and the
        // ids are what let you check that across devices.
        setOtherGists(gists.filter((g) => g.id !== credentials.gistId));
      })
      .catch(() => {
        // A failure here is not worth surfacing — the real sync status
        // already reports connectivity and auth problems.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleConnect(withExistingGist: boolean) {
    // When already connected the token field isn't shown, so "Switch"
    // reuses the stored token rather than silently doing nothing.
    const token = pat.trim() || loadStoredCredentials()?.pat || "";
    if (!token) return;
    setBusy(true);
    try {
      await sync.configure(token, withExistingGist ? gistId.trim() : undefined);
      setPat(""); // don't leave the token sitting in component state
      setGistId("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-medium">Sync (private GitHub Gist)</h3>
        <p className={`text-xs ${statusToneClass(sync.status)}`}>
          {statusLabel(sync.status)}
        </p>
      </div>

      {sync.status.state === "conflict" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950">
          <p className="text-xs font-medium text-amber-800 dark:text-amber-200">
            Both copies changed since the last sync
          </p>
          <p className="mt-1 text-xs text-amber-800 dark:text-amber-200">
            This device has changes that never uploaded, and another device
            uploaded too. Pick a direction below — whichever you choose, the
            other copy's changes since the last sync are lost, so go with the
            device you've done more on today. Export a backup first if unsure.
          </p>
        </div>
      )}

      {sync.isConfigured ? (
        <>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Changes push automatically a couple of seconds after you make them,
            and Cadence checks for other devices' changes whenever you open it.
          </p>
          {/* Full id, selectable: comparing this string between devices is
              the only reliable way to confirm they're on the same file. */}
          <div className="rounded-lg bg-neutral-50 p-2.5 dark:bg-neutral-800/50">
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
              This device syncs to
            </p>
            <code className="select-all break-all text-xs text-neutral-800 dark:text-neutral-200">
              {storedGistId ?? "—"}
            </code>
            <p className="mt-1 text-[11px] text-neutral-400 dark:text-neutral-600">
              Both devices must show this exact id.
            </p>
          </div>
          {otherGists.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950">
              <p className="text-xs font-medium text-amber-800 dark:text-amber-200">
                {otherGists.length} other Cadence file
                {otherGists.length === 1 ? "" : "s"} on this account
              </p>
              <p className="mt-1 text-xs text-amber-800 dark:text-amber-200">
                Left over from a device that made its own file instead of
                joining. Harmless if every device shows the id above — but if
                another device shows one of these instead, they aren't talking
                to each other.
              </p>
              <ul className="mt-1.5 flex flex-col gap-1">
                {otherGists.map((gist) => (
                  <li key={gist.id} className="flex flex-wrap items-baseline gap-2">
                    <code className="select-all break-all text-[11px] text-amber-900 dark:text-amber-100">
                      {gist.id}
                    </code>
                    <span className="text-[11px] text-amber-700 dark:text-amber-300">
                      updated {new Date(gist.updatedAt).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-[11px] text-amber-700 dark:text-amber-300">
                Once every device shows the same id, delete the leftovers at
                gist.github.com so this stops being ambiguous.
              </p>
            </div>
          )}

          {/* Explicitly one-directional. A single "Sync now" used to just
              upload, so pressing it on a stale device wiped newer data
              from another one. Each button now names its direction and
              says what it replaces. */}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={busy || sync.status.state === "syncing"}
              onClick={() => void sync.uploadNow()}
            >
              <Upload className="size-4" /> Sync (upload)
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy || sync.status.state === "syncing"}
              onClick={() => void sync.downloadNow()}
            >
              <Download className="size-4" /> Sync (download)
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                clearCredentials();
                // A full reload is the honest way to reset every hook that
                // read credentials at mount, rather than threading a
                // "disconnected" signal through the tree for a rare action.
                window.location.reload();
              }}
            >
              Disconnect
            </Button>
          </div>
          <p className="text-xs text-neutral-400 dark:text-neutral-600">
            <strong>Upload</strong> replaces the cloud copy with this device's.{" "}
            <strong>Download</strong> replaces this device's with the cloud's.
            Everyday syncing happens on its own — these are for forcing a
            direction.
          </p>

          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Input
                label="Switch to a different Gist ID"
                value={gistId}
                onChange={(event) => setGistId(event.target.value)}
                placeholder={storedGistId ?? "Gist ID"}
              />
            </div>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy || !gistId.trim()}
              onClick={() => void handleConnect(true)}
            >
              Switch
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Paste a GitHub personal access token with the <code>gist</code> scope. It's
            stored only in this browser and sent only to api.github.com.
          </p>
          <p className="rounded-lg bg-neutral-50 p-2.5 text-xs text-neutral-600 dark:bg-neutral-800/50 dark:text-neutral-300">
            <strong>Adding another device?</strong> Paste the same token. Cadence
            finds the sync file your other device already made and joins it — you
            don't need to copy anything else across. Note that exporting a backup
            never includes your token, on purpose.
          </p>
          <Input
            label="Personal access token"
            type="password"
            value={pat}
            autoComplete="off"
            onChange={(event) => setPat(event.target.value)}
            placeholder="ghp_…"
          />
          <Input
            label="Gist ID (optional)"
            value={gistId}
            onChange={(event) => setGistId(event.target.value)}
            placeholder="Only needed to force a specific Gist"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="primary"
              disabled={busy || !pat.trim()}
              onClick={() => void handleConnect(gistId.trim().length > 0)}
            >
              {busy ? "Connecting…" : "Connect"}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
