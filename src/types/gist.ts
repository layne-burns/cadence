/**
 * Shapes for the GitHub Gist sync layer (services/gistSync.ts). The Gist
 * itself holds one JSON file, `cadence-data.json`, whose contents are
 * `GistPayload` — everything needed to fully restore local state on
 * another device. The user's PAT and Gist ID are deliberately NOT part of
 * this payload: they live only in the browser's localStorage on each
 * device (see CLAUDE.md security note) and are never written to the synced
 * data itself.
 */

import type { WeeklyBlueprint } from "./template";
import type { OneOffEvent } from "./schedule";
import type { AdherenceLog, StreakState } from "./adherence";
import type { AppSettings } from "./settings";

export interface GistPayload {
  /** Schema version, bumped on breaking shape changes so a future
   * gistSync.ts can migrate an older payload instead of guessing. */
  version: 1;
  exportedAt: string;
  blueprint: WeeklyBlueprint;
  events: OneOffEvent[];
  adherenceLogs: AdherenceLog[];
  streakState: StreakState;
  /**
   * Optional, and deliberately not a version bump: files written before
   * settings existed are still perfectly valid, and a missing value just
   * means "use the defaults". Adding an *optional* field is backward
   * compatible in both directions — an older build reading a newer file
   * ignores it, a newer build reading an older file defaults it — so
   * forcing version 2 would break old files for no benefit.
   */
  settings?: AppSettings;
}

/**
 * Sync status as a discriminated union rather than a status string +
 * separate error/timestamp fields — it makes "which fields are valid in
 * which state" a compile-time fact instead of a runtime convention (e.g.
 * you can't accidentally read `lastSyncedAt` while `state` is `"error"`).
 */
export type SyncStatus =
  | { state: "idle" }
  | { state: "syncing" }
  | { state: "synced"; lastSyncedAt: string }
  | { state: "offline" }
  | { state: "error"; message: string }
  /**
   * Both sides changed since the last successful sync: this device has
   * edits that never reached the remote, *and* the remote moved on
   * (another device pushed). Neither copy is safely discardable, so the
   * app stops and asks rather than picking a winner — whole-payload
   * last-write-wins here would silently destroy a day's check-ins.
   */
  | { state: "conflict"; remoteUpdatedAt: string };
