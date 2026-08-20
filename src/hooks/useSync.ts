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
  findExistingCadenceGist,
  loadStoredCredentials,
  pushGist,
  saveCredentials,
  shouldPullBeforePush,
} from "../services/gistSync";
import type { GistPayload, SyncStatus } from "../types/gist";
import { createDefaultSettings } from "../types/settings";

const PUSH_DEBOUNCE_MS = 2000;
/** How often to re-check the remote while the app is open and visible.
 * 60s is frequent enough that switching devices feels current, and rare
 * enough to be invisible on a phone battery. */
const REMOTE_POLL_MS = 60_000;
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
  /**
   * Explicitly one-directional, and named for what they do.
   *
   * There used to be a single "Sync now" that quietly just uploaded, so
   * pressing it on a stale device destroyed newer data from another one.
   * Rather than make one button guess the right direction, the manual
   * controls state their direction and their consequence — the automatic
   * background sync handles the ordinary case, and these exist for when
   * you need to force an outcome.
   */
  uploadNow: () => Promise<void>;
  downloadNow: () => Promise<void>;
}

export function useSync(): UseSyncResult {
  const [status, setStatus] = useState<SyncStatus>({ state: "idle" });
  const [isConfigured, setIsConfigured] = useState(
    () => loadStoredCredentials() !== null,
  );
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextPush = useRef(true); // don't push on initial mount
  /**
   * True between a local change and its push landing. Auto-pull refuses
   * to run while it's set: pulling replaces the entire local database, so
   * doing it with an unpushed edit outstanding would silently discard
   * that edit. Better to be briefly stale than to lose work.
   */
  const hasUnpushedChanges = useRef(false);
  /** Guards against overlapping checks — a focus event and the interval
   * can easily fire together. */
  const checkInFlight = useRef(false);

  const changeSignal = useSyncExternalStore(
    db.subscribeToDataChanges,
    db.getDataVersion,
    db.getDataVersion,
  );

  /**
   * Returns whether the pull actually succeeded. It reports rather than
   * throws because most callers want to set status and carry on — but
   * they must not reload on failure, which would wipe the error message
   * off the screen and make a failed sync look like a no-op. That was a
   * real bug: "Sync (download)" appeared to do nothing whenever it
   * errored, because the reload erased the evidence.
   */
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
      return true;
    } catch (error) {
      setStatus(errorToStatus(error));
      return false;
    }
  }, []);

  const pushToRemote = useCallback(async (pat: string, gistId: string) => {
    setStatus({ state: "syncing" });
    try {
      const local = await db.exportAllData();
      const { updatedAt } = await pushGist(pat, gistId, buildPayload(local));
      writeLastKnownRemoteUpdatedAt(updatedAt);
      hasUnpushedChanges.current = false;
      setStatus({ state: "synced", lastSyncedAt: new Date().toISOString() });
    } catch (error) {
      setStatus(errorToStatus(error));
    }
  }, []);

  /**
   * Checks whether the remote has moved on and pulls if so. This is what
   * makes multi-device use feel seamless: without it the app only looked
   * at the remote once per cold start, so an edit made on the laptop was
   * invisible on the phone until the phone app was fully reloaded.
   *
   * Skipped entirely when there are unpushed local changes — see
   * `hasUnpushedChanges`.
   */
  const checkRemoteForUpdates = useCallback(async () => {
    if (checkInFlight.current || hasUnpushedChanges.current) return;
    const credentials = loadStoredCredentials();
    if (!credentials?.gistId) return;
    const { pat, gistId } = credentials;

    checkInFlight.current = true;
    try {
      const { updatedAt } = await fetchGist(pat, gistId);
      if (shouldPullBeforePush(readLastKnownRemoteUpdatedAt(), updatedAt)) {
        // Every hook read its slice of the database at mount, so a pull
        // that replaced everything leaves the UI showing stale data. A
        // reload re-seeds them — but only if the pull actually worked.
        if (await pullFromRemote(pat, gistId)) window.location.reload();
      } else {
        writeLastKnownRemoteUpdatedAt(updatedAt);
        setStatus({ state: "synced", lastSyncedAt: new Date().toISOString() });
      }
    } catch (error) {
      setStatus(errorToStatus(error));
    } finally {
      checkInFlight.current = false;
    }
  }, [pullFromRemote]);

  // Auto-pull on launch, and again whenever the app comes back to the
  // foreground or has been open a while. Focus/visibility is the one that
  // matters in practice — picking the phone up after working on the
  // laptop is exactly when the local copy is stale.
  useEffect(() => {
    if (!loadStoredCredentials()?.gistId) return;

    void checkRemoteForUpdates();

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void checkRemoteForUpdates();
        return;
      }
      // Going away: flush a pending debounced push now rather than
      // gambling that the 2s timer beats the tab being frozen. Closing a
      // phone app right after ticking something off is normal, and that
      // change reaching the remote is the whole point of syncing.
      if (hasUnpushedChanges.current && pushTimer.current) {
        clearTimeout(pushTimer.current);
        pushTimer.current = null;
        const credentials = loadStoredCredentials();
        if (credentials?.gistId) {
          void pushToRemote(credentials.pat, credentials.gistId);
        }
      }
    };
    const interval = setInterval(() => {
      // Only while actually on screen; polling a backgrounded tab burns
      // the phone's battery for a change nobody is looking at.
      if (document.visibilityState === "visible") void checkRemoteForUpdates();
    }, REMOTE_POLL_MS);

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [checkRemoteForUpdates, pushToRemote]);

  // Debounced auto-push, 2s after the last local change.
  useEffect(() => {
    if (skipNextPush.current) {
      skipNextPush.current = false;
      return;
    }
    const credentials = loadStoredCredentials();
    if (!credentials?.gistId) return;
    const { pat, gistId } = credentials;

    // Set before the debounce, not after it fires: the whole point is to
    // block an auto-pull during the window where a change exists locally
    // but hasn't reached the remote yet.
    hasUnpushedChanges.current = true;

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
        // Adopt before creating. Without the discovery step, setting up a
        // second device by pasting the same token would mint a *new*
        // gist, leaving the devices syncing to different files while both
        // cheerfully reported "Synced" — a silent split that looks like
        // sync simply not working.
        const existingId = gistId || (await findExistingCadenceGist(pat));

        if (existingId) {
          saveCredentials({ pat, gistId: existingId });
          setIsConfigured(true);
          // Same rule: reload only if the pull succeeded.
          if (await pullFromRemote(pat, existingId)) window.location.reload();
          return;
        }

        const local = await db.exportAllData();
        const created = await createGist(pat, buildPayload(local));
        saveCredentials({ pat, gistId: created.gistId });
        writeLastKnownRemoteUpdatedAt(created.updatedAt);
        setStatus({ state: "synced", lastSyncedAt: new Date().toISOString() });
        setIsConfigured(true);
      } catch (error) {
        setStatus(errorToStatus(error));
      }
    },
    [pullFromRemote],
  );

  /**
   * Force this device's copy up, replacing whatever is in the cloud.
   *
   * Adopts the remote's current timestamp as our baseline *before*
   * pushing, so we aren't immediately re-flagged as conflicting with the
   * version we just deliberately overwrote.
   */
  const uploadNow = useCallback(async () => {
    const credentials = loadStoredCredentials();
    if (!credentials?.gistId) {
      setStatus({ state: "error", message: "Sync isn't set up yet." });
      return;
    }
    const { pat, gistId } = credentials;
    setStatus({ state: "syncing" });
    try {
      const { updatedAt } = await fetchGist(pat, gistId);
      writeLastKnownRemoteUpdatedAt(updatedAt);
      await pushToRemote(pat, gistId);
    } catch (error) {
      setStatus(errorToStatus(error));
    }
  }, [pushToRemote]);

  /** Force the cloud's copy down, replacing this device's data. */
  const downloadNow = useCallback(async () => {
    const credentials = loadStoredCredentials();
    if (!credentials?.gistId) {
      setStatus({ state: "error", message: "Sync isn't set up yet." });
      return;
    }
    // Deliberately discarding local edits, so stop them blocking the pull.
    hasUnpushedChanges.current = false;
    const ok = await pullFromRemote(credentials.pat, credentials.gistId);
    // Only reload on success; reloading after a failure would erase the
    // error the user needs to see.
    if (ok) window.location.reload();
  }, [pullFromRemote]);

  return { status, isConfigured, configure, uploadNow, downloadNow };
}
