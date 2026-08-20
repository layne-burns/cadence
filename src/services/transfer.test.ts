import { describe, expect, it } from "vitest";
import {
  buildExportPayload,
  exportFilename,
  parseImportFile,
  serializeExport,
} from "./transfer";
import { createEmptyBlueprint } from "../types/template";
import { createEmptyStreakState } from "../types/adherence";
import type { GistPayload } from "../types/gist";

function validPayload(): GistPayload {
  const blueprint = createEmptyBlueprint();
  blueprint.categories.push({ id: "cat-1", name: "Research", color: "#6366f1" });
  blueprint.days.monday.blocks.push({
    id: "block-1",
    title: "Deep Research",
    categoryId: "cat-1",
    startMinutes: 9 * 60,
    endMinutes: 11 * 60,
    flexibility: "flexible",
  });
  return {
    version: 1,
    exportedAt: "2026-08-19T12:00:00.000Z",
    blueprint,
    events: [
      {
        id: "evt-1",
        date: "2026-08-19",
        title: "Committee Meeting",
        startMinutes: 14 * 60,
        endMinutes: 15 * 60,
      },
    ],
    adherenceLogs: [
      {
        id: "log-1",
        date: "2026-08-19",
        renderedBlockId: "block-1::540-660",
        blockTitle: "Deep Research",
        categoryId: "cat-1",
        completed: true,
        loggedAt: "2026-08-19T11:00:00.000Z",
      },
    ],
    streakState: { ...createEmptyStreakState(), currentStreak: 3 },
  };
}

describe("parseImportFile", () => {
  it("round-trips a payload produced by serializeExport", () => {
    const payload = validPayload();
    const result = parseImportFile(serializeExport(payload));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload).toEqual(payload);
  });

  it("rejects a file that isn't JSON at all", () => {
    const result = parseImportFile("not json {{{");
    expect(result).toEqual({ ok: false, errors: ["File isn't valid JSON."] });
  });

  it("rejects valid JSON whose top level isn't an object", () => {
    const result = parseImportFile("[1, 2, 3]");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toMatch(/top level/);
  });

  it("rejects an unsupported schema version", () => {
    const payload = { ...validPayload(), version: 2 };
    const result = parseImportFile(JSON.stringify(payload));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("Unsupported file version"))).toBe(true);
    }
  });

  it("rejects a payload missing a day of the week", () => {
    const payload = validPayload();
    const days = { ...payload.blueprint.days } as Record<string, unknown>;
    delete days.thursday;
    const result = parseImportFile(
      JSON.stringify({ ...payload, blueprint: { ...payload.blueprint, days } }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("blueprint.days.thursday"))).toBe(true);
    }
  });

  it("reports a bad field with its full path, not just 'invalid'", () => {
    const payload = validPayload();
    payload.blueprint.days.monday.blocks[0]!.startMinutes = "9am" as unknown as number;
    const result = parseImportFile(JSON.stringify(payload));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain(
        "blueprint.days.monday.blocks[0].startMinutes must be a number",
      );
    }
  });

  it("rejects an invalid flexibility value", () => {
    const payload = validPayload();
    payload.blueprint.days.monday.blocks[0]!.flexibility = "maybe" as never;
    const result = parseImportFile(JSON.stringify(payload));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some((e) => e.includes("flexibility") && e.includes("flexible")),
      ).toBe(true);
    }
  });

  it("collects every problem at once rather than stopping at the first", () => {
    const broken = {
      version: 1,
      exportedAt: "2026-08-19T12:00:00.000Z",
      blueprint: "nope",
      events: "nope",
      adherenceLogs: "nope",
      streakState: "nope",
    };
    const result = parseImportFile(JSON.stringify(broken));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // One error per bad top-level section, not just the first.
      expect(result.errors.length).toBeGreaterThanOrEqual(4);
    }
  });

  it("rejects an event missing required fields", () => {
    const payload = validPayload();
    const result = parseImportFile(
      JSON.stringify({ ...payload, events: [{ id: "evt-1" }] }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.startsWith("events[0]."))).toBe(true);
    }
  });

  it("accepts an empty but structurally valid payload", () => {
    const result = parseImportFile(
      JSON.stringify({
        version: 1,
        exportedAt: "2026-08-19T12:00:00.000Z",
        blueprint: createEmptyBlueprint(),
        events: [],
        adherenceLogs: [],
        streakState: createEmptyStreakState(),
      }),
    );
    expect(result.ok).toBe(true);
  });
});

describe("buildExportPayload", () => {
  it("wraps local data with a version and an export timestamp", () => {
    const data = {
      blueprint: createEmptyBlueprint(),
      events: [],
      adherenceLogs: [],
      streakState: createEmptyStreakState(),
    };
    const payload = buildExportPayload(data);
    expect(payload.version).toBe(1);
    expect(Number.isNaN(Date.parse(payload.exportedAt))).toBe(false);
    expect(payload.blueprint).toBe(data.blueprint);
  });

  it("produces output its own parser accepts", () => {
    const payload = buildExportPayload({
      blueprint: createEmptyBlueprint(),
      events: [],
      adherenceLogs: [],
      streakState: createEmptyStreakState(),
    });
    expect(parseImportFile(serializeExport(payload)).ok).toBe(true);
  });
});

describe("exportFilename", () => {
  it("dates the filename by local calendar day", () => {
    expect(exportFilename(new Date(2026, 7, 19))).toBe("cadence-backup-2026-08-19.json");
  });
});
