// Polyfills global indexedDB/IDBKeyRange so db.ts's `idb` calls work under
// Vitest's plain Node environment — no browser or jsdom needed.
import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it } from "vitest";
import * as db from "./db";
import { createEmptyBlueprint } from "../types/template";
import { createEmptyStreakState } from "../types/adherence";
import type { AdherenceLog } from "../types/adherence";
import type { OneOffEvent } from "../types/schedule";

function makeEvent(overrides: Partial<OneOffEvent> = {}): OneOffEvent {
  return {
    id: "evt-1",
    date: "2026-08-24",
    title: "Committee Meeting",
    startMinutes: 9 * 60,
    endMinutes: 10 * 60,
    ...overrides,
  };
}

function makeLog(overrides: Partial<AdherenceLog> = {}): AdherenceLog {
  return {
    id: "log-1",
    date: "2026-08-24",
    renderedBlockId: "research::480-540",
    blockTitle: "Research",
    categoryId: "deep-research",
    completed: true,
    loggedAt: "2026-08-24T09:05:00.000Z",
    ...overrides,
  };
}

beforeEach(async () => {
  // fake-indexeddb keeps databases around between tests unless we delete
  // them — each test gets a clean slate under its own DB connection.
  await db.__resetDbConnectionForTests();
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase("cadence");
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
});

describe("blueprint", () => {
  it("returns an empty blueprint before anything is saved", async () => {
    const blueprint = await db.getBlueprint();
    expect(blueprint).toEqual(createEmptyBlueprint());
  });

  it("round-trips a saved blueprint", async () => {
    const blueprint = createEmptyBlueprint();
    blueprint.categories.push({ id: "cat-1", name: "Research", color: "#123456" });

    await db.saveBlueprint(blueprint);
    expect(await db.getBlueprint()).toEqual(blueprint);
  });
});

describe("events", () => {
  it("saves, lists, and deletes events", async () => {
    await db.saveEvent(makeEvent({ id: "a" }));
    await db.saveEvent(makeEvent({ id: "b", date: "2026-08-25" }));

    expect(await db.getAllEvents()).toHaveLength(2);
    expect(await db.getEventsForDate("2026-08-24")).toEqual([
      makeEvent({ id: "a" }),
    ]);

    await db.deleteEvent("a");
    expect(await db.getAllEvents()).toHaveLength(1);
  });

  it("getEventsInRange returns only events within the inclusive date bounds", async () => {
    await db.saveEvent(makeEvent({ id: "before", date: "2026-08-20" }));
    await db.saveEvent(makeEvent({ id: "start-edge", date: "2026-08-24" }));
    await db.saveEvent(makeEvent({ id: "middle", date: "2026-08-26" }));
    await db.saveEvent(makeEvent({ id: "end-edge", date: "2026-08-28" }));
    await db.saveEvent(makeEvent({ id: "after", date: "2026-08-30" }));

    const inRange = await db.getEventsInRange("2026-08-24", "2026-08-28");
    expect(inRange.map((e) => e.id).sort()).toEqual([
      "end-edge",
      "middle",
      "start-edge",
    ]);
  });
});

describe("adherence logs", () => {
  it("saves, lists by date, and deletes logs", async () => {
    await db.saveAdherenceLog(makeLog({ id: "x" }));
    await db.saveAdherenceLog(makeLog({ id: "y", date: "2026-08-25" }));

    expect(await db.getAllAdherenceLogs()).toHaveLength(2);
    expect(await db.getAdherenceLogsForDate("2026-08-24")).toEqual([
      makeLog({ id: "x" }),
    ]);

    await db.deleteAdherenceLog("x");
    expect(await db.getAllAdherenceLogs()).toHaveLength(1);
  });

  it("getAdherenceLogsInRange returns only logs within the inclusive date bounds", async () => {
    await db.saveAdherenceLog(makeLog({ id: "before", date: "2026-08-20" }));
    await db.saveAdherenceLog(makeLog({ id: "in-range", date: "2026-08-25" }));
    await db.saveAdherenceLog(makeLog({ id: "after", date: "2026-08-30" }));

    const inRange = await db.getAdherenceLogsInRange("2026-08-24", "2026-08-28");
    expect(inRange.map((l) => l.id)).toEqual(["in-range"]);
  });
});

describe("streak state", () => {
  it("returns empty streak state before anything is saved", async () => {
    expect(await db.getStreakState()).toEqual(createEmptyStreakState());
  });

  it("round-trips saved streak state", async () => {
    const state = { ...createEmptyStreakState(), currentStreak: 4 };
    await db.saveStreakState(state);
    expect(await db.getStreakState()).toEqual(state);
  });
});

describe("bulk export/import", () => {
  it("exportAllData reflects everything saved across all stores", async () => {
    const blueprint = createEmptyBlueprint();
    const event = makeEvent();
    const log = makeLog();
    const streakState = { ...createEmptyStreakState(), currentStreak: 2 };

    await db.saveBlueprint(blueprint);
    await db.saveEvent(event);
    await db.saveAdherenceLog(log);
    await db.saveStreakState(streakState);

    expect(await db.exportAllData()).toEqual({
      blueprint,
      events: [event],
      adherenceLogs: [log],
      streakState,
    });
  });

  it("replaceAllData wipes prior events/logs and installs the new set", async () => {
    await db.saveEvent(makeEvent({ id: "stale" }));
    await db.saveAdherenceLog(makeLog({ id: "stale-log" }));

    const incoming: db.AllLocalData = {
      blueprint: createEmptyBlueprint(),
      events: [makeEvent({ id: "fresh" })],
      adherenceLogs: [makeLog({ id: "fresh-log" })],
      streakState: { ...createEmptyStreakState(), currentStreak: 7 },
    };

    await db.replaceAllData(incoming);

    expect(await db.exportAllData()).toEqual(incoming);
  });
});
