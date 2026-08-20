import { useState } from "react";
import { Button } from "../common/Button";
import { Input } from "../common/Input";
import type { UseSyncResult } from "../../hooks/useSync";
import type { SyncStatus } from "../../types/gist";
import { loadStoredCredentials, clearCredentials } from "../../services/gistSync";

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

  async function handleConnect(withExistingGist: boolean) {
    if (!pat.trim()) return;
    setBusy(true);
    try {
      await sync.configure(pat.trim(), withExistingGist ? gistId.trim() : undefined);
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

      {sync.isConfigured ? (
        <>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Connected{storedGistId ? ` to Gist ${storedGistId.slice(0, 8)}…` : ""}. Changes
            push automatically a couple of seconds after you make them.
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={sync.status.state === "syncing"}
              onClick={() => void sync.syncNow()}
            >
              Sync now
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
        </>
      ) : (
        <>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Paste a GitHub personal access token with the <code>gist</code> scope. It's
            stored only in this browser and sent only to api.github.com.
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
            label="Existing Gist ID (optional)"
            value={gistId}
            onChange={(event) => setGistId(event.target.value)}
            placeholder="Leave blank to create a new one"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="primary"
              disabled={busy || !pat.trim()}
              onClick={() => void handleConnect(gistId.trim().length > 0)}
            >
              {gistId.trim() ? "Connect to Gist" : "Create private Gist"}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
