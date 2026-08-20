/**
 * The only module allowed to touch IndexedDB. Everything else — hooks,
 * gistSync.ts, transfer.ts — goes through the functions here.
 *
 * Uses `idb` (a ~1KB typed Promise wrapper around the raw IndexedDB
 * callback API) rather than hand-rolling promise wrapping around
 * `IDBRequest` — that's exactly the "lightweight typed wrapper" the spec
 * calls for, not a full ORM.
 *
 * Four stores:
 *   - `blueprint` / `streak` — singleton stores (always exactly one row,
 *     under a fixed key) since there's only ever one weekly blueprint and
 *     one streak state per user.
 *   - `events` / `adherenceLogs` — one row per record, indexed by date so
 *     "give me everything for this day" doesn't require a full scan.
 */

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { OneOffEvent } from "../types/schedule";
import type { WeeklyBlueprint } from "../types/template";
import { createEmptyBlueprint } from "../types/template";
import type { AdherenceLog, StreakState } from "../types/adherence";
import { createEmptyStreakState } from "../types/adherence";

const DB_NAME = "cadence";
const DB_VERSION = 1;
const SINGLETON_KEY = "current";

interface CadenceDB extends DBSchema {
  blueprint: {
    key: string;
    value: WeeklyBlueprint;
  };
  events: {
    key: string;
    value: OneOffEvent;
    indexes: { "by-date": string };
  };
  adherenceLogs: {
    key: string;
    value: AdherenceLog;
    indexes: { "by-date": string };
  };
  streak: {
    key: string;
    value: StreakState;
  };
}

let dbPromise: Promise<IDBPDatabase<CadenceDB>> | null = null;

/** Lazily opens (and caches) the database connection. Tests reset this via
 * `__resetDbConnectionForTests` so each test gets a fresh `fake-indexeddb`
 * database instead of reusing a connection from a previous test's DB. */
function getDb(): Promise<IDBPDatabase<CadenceDB>> {
  if (!dbPromise) {
    dbPromise = openDB<CadenceDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore("blueprint");
        const events = db.createObjectStore("events", { keyPath: "id" });
        events.createIndex("by-date", "date");
        const logs = db.createObjectStore("adherenceLogs", { keyPath: "id" });
        logs.createIndex("by-date", "date");
        db.createObjectStore("streak");
      },
    });
  }
  return dbPromise;
}

export async function __resetDbConnectionForTests(): Promise<void> {
  if (dbPromise) {
    (await dbPromise).close();
  }
  dbPromise = null;
}

// ---- Blueprint -------------------------------------------------------

export async function getBlueprint(): Promise<WeeklyBlueprint> {
  const db = await getDb();
  const stored = await db.get("blueprint", SINGLETON_KEY);
  return stored ?? createEmptyBlueprint();
}

export async function saveBlueprint(blueprint: WeeklyBlueprint): Promise<void> {
  const db = await getDb();
  await db.put("blueprint", blueprint, SINGLETON_KEY);
}

// ---- One-off events ----------------------------------------------------

export async function getAllEvents(): Promise<OneOffEvent[]> {
  const db = await getDb();
  return db.getAll("events");
}

export async function getEventsForDate(date: string): Promise<OneOffEvent[]> {
  const db = await getDb();
  return db.getAllFromIndex("events", "by-date", date);
}

export async function saveEvent(event: OneOffEvent): Promise<void> {
  const db = await getDb();
  await db.put("events", event);
}

export async function deleteEvent(id: string): Promise<void> {
  const db = await getDb();
  await db.delete("events", id);
}

// ---- Adherence logs ------------------------------------------------------

export async function getAllAdherenceLogs(): Promise<AdherenceLog[]> {
  const db = await getDb();
  return db.getAll("adherenceLogs");
}

export async function getAdherenceLogsForDate(
  date: string,
): Promise<AdherenceLog[]> {
  const db = await getDb();
  return db.getAllFromIndex("adherenceLogs", "by-date", date);
}

export async function saveAdherenceLog(log: AdherenceLog): Promise<void> {
  const db = await getDb();
  await db.put("adherenceLogs", log);
}

export async function deleteAdherenceLog(id: string): Promise<void> {
  const db = await getDb();
  await db.delete("adherenceLogs", id);
}

// ---- Streak state ------------------------------------------------------

export async function getStreakState(): Promise<StreakState> {
  const db = await getDb();
  const stored = await db.get("streak", SINGLETON_KEY);
  return stored ?? createEmptyStreakState();
}

export async function saveStreakState(state: StreakState): Promise<void> {
  const db = await getDb();
  await db.put("streak", state, SINGLETON_KEY);
}

// ---- Bulk export/import -------------------------------------------------
//
// Shared by two callers that both need "everything, as one object": Gist
// sync (services/gistSync.ts builds a GistPayload from this) and manual
// JSON backup (services/transfer.ts, Phase 7). Kept here rather than
// duplicated in both because it's fundamentally a database operation —
// reading/writing all four stores as one unit — not a sync or
// file-format concern.

export interface AllLocalData {
  blueprint: WeeklyBlueprint;
  events: OneOffEvent[];
  adherenceLogs: AdherenceLog[];
  streakState: StreakState;
}

export async function exportAllData(): Promise<AllLocalData> {
  const [blueprint, events, adherenceLogs, streakState] = await Promise.all([
    getBlueprint(),
    getAllEvents(),
    getAllAdherenceLogs(),
    getStreakState(),
  ]);
  return { blueprint, events, adherenceLogs, streakState };
}

/** Replaces every store's contents with `data`, atomically per store. Used
 * when pulling a Gist that's newer than local, or restoring a JSON backup —
 * both are "the incoming data IS the new truth" operations, not merges. */
export async function replaceAllData(data: AllLocalData): Promise<void> {
  const db = await getDb();

  await db.put("blueprint", data.blueprint, SINGLETON_KEY);
  await db.put("streak", data.streakState, SINGLETON_KEY);

  const eventsTx = db.transaction("events", "readwrite");
  await eventsTx.store.clear();
  await Promise.all(data.events.map((event) => eventsTx.store.put(event)));
  await eventsTx.done;

  const logsTx = db.transaction("adherenceLogs", "readwrite");
  await logsTx.store.clear();
  await Promise.all(
    data.adherenceLogs.map((log) => logsTx.store.put(log)),
  );
  await logsTx.done;
}
