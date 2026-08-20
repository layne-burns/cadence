/**
 * Owns the Gist sync lifecycle: pulls on mount if the remote is newer than
 * what we last saw, pushes 2 seconds after the last local change, and
 * exposes manual configure/sync-now actions for the settings modal.
 *
 * This hook stays blind to what "local data" actually is. It subscribes to
 * `db.subscribeToDataChanges` for the *fact* that something changed, and
 * re-reads the whole payload fresh via `db.exportAllData()` at push time.
 * Phase 3 took a `changeSignal` parameter for this and left the wiring to
 * a future caller; Phase 7 replaced that with the db-level subscription,
 * since `services/db.ts` is the one choke point every write already passes
 * through and is therefore the only place that can answer the question
 * without every feature hook remembering to report in.
 *
 * Not exhaustively unit-tested — the pure decision logic it leans on
 * (`shouldPullBeforePush`) and the network/storage calls it wraps
 * (gistSync.ts) both are. Effect timing here is verified against the real
 * settings UI in the browser, per CLAUDE.md's "verify in the browser" note.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import * as db from "../services/db";
import {
  GistSyncError,
  createGist,
  fetchGist,
  loadStoredCredentials,
  pushGist,
  saveCredentials,
  shouldPullBeforePush,
} from "../services/gistSync";
import type { GistPayload, SyncStatus } from "../types/gist";
import { createDefaultSettings } from "../types/settings";

const PUSH_DEBOUNCE_MS = 2000;
const LAST_KNOWN_REMOTE_UPDATED_AT_KEY = "cadence.lastKnownRemoteUpdatedAt";

function buildPayload(data: db.AllLocalData): GistPayload {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    blueprint: data.blueprint,
    events: data.events,
    adherenceLogs: data.adherenceLogs,
    streakState: data.streakState,
    settings: data.settings,
  };
}

function readLastKnownRemoteUpdatedAt(): string | null {
  return globalThis.localStorage.getItem(LAST_KNOWN_REMOTE_UPDATED_AT_KEY);
}

function writeLastKnownRemoteUpdatedAt(value: string): void {
  globalThis.localStorage.setItem(LAST_KNOWN_REMOTE_UPDATED_AT_KEY, value);
}

function errorToStatus(error: unknown): SyncStatus {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { state: "offline" };
  }
  if (error instanceof GistSyncError) {
    return { state: "error", message: error.message };
  }
  return {
    state: "error",
    message: error instanceof Error ? error.message : "Sync failed",
  };
}

export interface UseSyncResult {
  status: SyncStatus;
  isConfigured: boolean;
  /** With a `gistId`: adopt an existing gist and pull it immediately.
   * Without one: create a new private gist seeded from local data. */
  configure: (pat: string, gistId?: string) => Promise<void>;
  syncNow: () => Promise<void>;
}

export function useSync(): UseSyncResult {
  const [status, setStatus] = useState<SyncStatus>({ state: "idle" });
  const [isConfigured, setIsConfigured] = useState(
    () => loadStoredCredentials() !== null,
  );
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextPush = useRef(true); // don't push on initial mount

  const changeSignal = useSyncExternalStore(
    db.subscribeToDataChanges,
    db.getDataVersion,
    db.getDataVersion,
  );

  const pullFromRemote = useCallback(async (pat: string, gistId: string) => {
    setStatus({ state: "syncing" });
    try {
      const { payload, updatedAt } = await fetchGist(pat, gistId);
      await db.replaceAllData(
        {
          blueprint: payload.blueprint,
          events: payload.events,
          adherenceLogs: payload.adherenceLogs,
          streakState: payload.streakState,
          settings: payload.settings ?? createDefaultSettings(),
        },
        // Silent: this write came *from* the remote, so notifying would
        // schedule a push of the data we just pulled.
        { silent: true },
      );
      writeLastKnownRemoteUpdatedAt(updatedAt);
      setStatus({ state: "synced", lastSyncedAt: new Date().toISOString() });
    } catch (error) {
      setStatus(errorToStatus(error));
    }
  }, []);

  const pushToRemote = useCallback(async (pat: string, gistId: string) => {
    setStatus({ state: "syncing" });
    try {
      const local = await db.exportAllData();
      const { updatedAt } = await pushGist(pat, gistId, buildPayload(local));
      writeLastKnownRemoteUpdatedAt(updatedAt);
      setStatus({ state: "synced", lastSyncedAt: new Date().toISOString() });
    } catch (error) {
      setStatus(errorToStatus(error));
    }
  }, []);

  // Auto-pull on launch — runs once, deliberately not tied to the change
  // signal: this is "check what the remote has right now", independent of
  // anything changing locally.
  useEffect(() => {
    const credentials = loadStoredCredentials();
    if (!credentials?.gistId) return;
    const { pat, gistId } = credentials;

    void (async () => {
      setStatus({ state: "syncing" });
      try {
        const { updatedAt } = await fetchGist(pat, gistId);
        if (shouldPullBeforePush(readLastKnownRemoteUpdatedAt(), updatedAt)) {
          await pullFromRemote(pat, gistId);
        } else {
          writeLastKnownRemoteUpdatedAt(updatedAt);
          setStatus({ state: "synced", lastSyncedAt: new Date().toISOString() });
        }
      } catch (error) {
        setStatus(errorToStatus(error));
      }
    })();
  }, [pullFromRemote]);

  // Debounced auto-push, 2s after the last local change.
  useEffect(() => {
    if (skipNextPush.current) {
      skipNextPush.current = false;
      return;
    }
    const credentials = loadStoredCredentials();
    if (!credentials?.gistId) return;
    const { pat, gistId } = credentials;

    if (pushTimer.current) clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => {
      void pushToRemote(pat, gistId);
    }, PUSH_DEBOUNCE_MS);

    return () => {
      if (pushTimer.current) clearTimeout(pushTimer.current);
    };
    // `changeSignal` is the trigger by design — see the hook-level comment.
  }, [changeSignal, pushToRemote]);

  const configure = useCallback(
    async (pat: string, gistId?: string) => {
      setStatus({ state: "syncing" });
      try {
        if (gistId) {
          saveCredentials({ pat, gistId });
          await pullFromRemote(pat, gistId);
        } else {
          const local = await db.exportAllData();
          const created = await createGist(pat, buildPayload(local));
          saveCredentials({ pat, gistId: created.gistId });
          writeLastKnownRemoteUpdatedAt(created.updatedAt);
          setStatus({ state: "synced", lastSyncedAt: new Date().toISOString() });
        }
        setIsConfigured(true);
      } catch (error) {
        setStatus(errorToStatus(error));
      }
    },
    [pullFromRemote],
  );

  const syncNow = useCallback(async () => {
    const credentials = loadStoredCredentials();
    if (!credentials?.gistId) {
      setStatus({
        state: "error",
        message: "Gist sync isn't configured yet.",
      });
      return;
    }
    await pushToRemote(credentials.pat, credentials.gistId);
  }, [pushToRemote]);

  return { status, isConfigured, configure, syncNow };
}
