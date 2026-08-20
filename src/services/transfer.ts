/**
 * Manual JSON backup: export everything to a file the user can save, and
 * import one back. The file format is deliberately the *same*
 * `GistPayload` shape `services/gistSync.ts` writes to the Gist, so a
 * downloaded backup and a synced Gist file are interchangeable — you can
 * save a Gist's contents as a local backup, or seed a Gist from a backup,
 * with no conversion step. It also means one validator covers both paths.
 *
 * Validation is hand-rolled rather than pulling in a schema library: it's
 * one shape, checked in one place, and this codebase already prefers small
 * local helpers (see `lib/cx.ts`) over dependencies at this size. It
 * collects *all* problems rather than failing on the first, so a user
 * importing a bad file learns everything wrong with it at once.
 *
 * `parseImportFile` and everything it calls are pure and node-testable.
 * The two DOM helpers at the bottom (download / file-read) are the only
 * browser-coupled parts and are deliberately left out of the test suite.
 */

import type { GistPayload } from "../types/gist";
import type { AllLocalData } from "./db";
import { DAYS_OF_WEEK, type DayOfWeek } from "../types/schedule";

export type ImportResult =
  | { ok: true; payload: GistPayload }
  | { ok: false; errors: string[] };

// ---- Validation ------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function checkRoutineBlock(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${path} is not an object`);
    return;
  }
  if (typeof value.id !== "string") errors.push(`${path}.id must be a string`);
  if (typeof value.title !== "string") errors.push(`${path}.title must be a string`);
  if (typeof value.categoryId !== "string") {
    errors.push(`${path}.categoryId must be a string`);
  }
  if (!isFiniteNumber(value.startMinutes)) {
    errors.push(`${path}.startMinutes must be a number`);
  }
  if (!isFiniteNumber(value.endMinutes)) {
    errors.push(`${path}.endMinutes must be a number`);
  }
  if (value.flexibility !== "fixed" && value.flexibility !== "flexible") {
    errors.push(`${path}.flexibility must be "fixed" or "flexible"`);
  }
}

function checkBlueprint(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push("blueprint is not an object");
    return;
  }
  if (!Array.isArray(value.categories)) {
    errors.push("blueprint.categories must be an array");
  } else {
    value.categories.forEach((category, i) => {
      const path = `blueprint.categories[${i}]`;
      if (!isRecord(category)) {
        errors.push(`${path} is not an object`);
        return;
      }
      if (typeof category.id !== "string") errors.push(`${path}.id must be a string`);
      if (typeof category.name !== "string") errors.push(`${path}.name must be a string`);
      if (typeof category.color !== "string") errors.push(`${path}.color must be a string`);
    });
  }

  if (!isRecord(value.days)) {
    errors.push("blueprint.days must be an object");
    return;
  }
  // Every weekday must be present — the rest of the app indexes
  // `blueprint.days[dayOfWeek]` directly and never null-checks it, so a
  // payload missing a day would crash later rather than here.
  for (const day of DAYS_OF_WEEK) {
    const template = value.days[day];
    const path = `blueprint.days.${day}`;
    if (!isRecord(template)) {
      errors.push(`${path} is missing or not an object`);
      continue;
    }
    if (!isFiniteNumber(template.wakeMinutes)) {
      errors.push(`${path}.wakeMinutes must be a number`);
    }
    if (!isFiniteNumber(template.windDownMinutes)) {
      errors.push(`${path}.windDownMinutes must be a number`);
    }
    if (!Array.isArray(template.blocks)) {
      errors.push(`${path}.blocks must be an array`);
    } else {
      template.blocks.forEach((block, i) =>
        checkRoutineBlock(block, `${path}.blocks[${i}]`, errors),
      );
    }
  }
}

function checkEvents(value: unknown, errors: string[]): void {
  if (!Array.isArray(value)) {
    errors.push("events must be an array");
    return;
  }
  value.forEach((event, i) => {
    const path = `events[${i}]`;
    if (!isRecord(event)) {
      errors.push(`${path} is not an object`);
      return;
    }
    if (typeof event.id !== "string") errors.push(`${path}.id must be a string`);
    if (typeof event.date !== "string") errors.push(`${path}.date must be a string`);
    if (typeof event.title !== "string") errors.push(`${path}.title must be a string`);
    if (!isFiniteNumber(event.startMinutes)) {
      errors.push(`${path}.startMinutes must be a number`);
    }
    if (!isFiniteNumber(event.endMinutes)) {
      errors.push(`${path}.endMinutes must be a number`);
    }
  });
}

function checkAdherenceLogs(value: unknown, errors: string[]): void {
  if (!Array.isArray(value)) {
    errors.push("adherenceLogs must be an array");
    return;
  }
  value.forEach((log, i) => {
    const path = `adherenceLogs[${i}]`;
    if (!isRecord(log)) {
      errors.push(`${path} is not an object`);
      return;
    }
    if (typeof log.id !== "string") errors.push(`${path}.id must be a string`);
    if (typeof log.date !== "string") errors.push(`${path}.date must be a string`);
    if (typeof log.renderedBlockId !== "string") {
      errors.push(`${path}.renderedBlockId must be a string`);
    }
    if (typeof log.completed !== "boolean") {
      errors.push(`${path}.completed must be a boolean`);
    }
  });
}

function checkStreakState(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push("streakState is not an object");
    return;
  }
  if (!isFiniteNumber(value.currentStreak)) {
    errors.push("streakState.currentStreak must be a number");
  }
  if (!isFiniteNumber(value.longestStreak)) {
    errors.push("streakState.longestStreak must be a number");
  }
  if (!Array.isArray(value.graceDayDatesUsed)) {
    errors.push("streakState.graceDayDatesUsed must be an array");
  }
  if (!Array.isArray(value.history)) {
    errors.push("streakState.history must be an array");
  }
}

/** Optional on the wire — absent means "use defaults", which is not an
 * error. Only its *shape* is checked, and only when it's actually there. */
function checkSettings(value: unknown, errors: string[]): void {
  if (value === undefined || value === null) return;
  if (!isRecord(value)) {
    errors.push("settings is not an object");
    return;
  }
  if (value.streak === undefined) return;
  if (!isRecord(value.streak)) {
    errors.push("settings.streak is not an object");
    return;
  }
  if (value.streak.ignoredDays !== undefined) {
    if (!Array.isArray(value.streak.ignoredDays)) {
      errors.push("settings.streak.ignoredDays must be an array");
    } else if (
      !value.streak.ignoredDays.every((day) => DAYS_OF_WEEK.includes(day as DayOfWeek))
    ) {
      errors.push("settings.streak.ignoredDays must contain only weekday names");
    }
  }
  if (
    value.streak.ignoreOnlyWhenNoEvents !== undefined &&
    typeof value.streak.ignoreOnlyWhenNoEvents !== "boolean"
  ) {
    errors.push("settings.streak.ignoreOnlyWhenNoEvents must be a boolean");
  }
}

/**
 * Parses and validates the contents of a backup file. Never throws — a
 * malformed file is a normal thing for a user to hand us, so it comes
 * back as `{ ok: false, errors }` for the UI to display, not an
 * exception to catch at the call site.
 */
export function parseImportFile(raw: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, errors: ["File isn't valid JSON."] };
  }

  const errors: string[] = [];

  if (!isRecord(parsed)) {
    return { ok: false, errors: ["File's top level isn't a JSON object."] };
  }
  if (parsed.version !== 1) {
    errors.push(
      `Unsupported file version ${JSON.stringify(parsed.version)} — expected 1.`,
    );
  }

  checkBlueprint(parsed.blueprint, errors);
  checkEvents(parsed.events, errors);
  checkAdherenceLogs(parsed.adherenceLogs, errors);
  checkStreakState(parsed.streakState, errors);
  checkSettings(parsed.settings, errors);

  if (errors.length > 0) return { ok: false, errors };

  // Every field the type promises has now been checked above, so this
  // assertion is backed by the validation rather than papering over it.
  return { ok: true, payload: parsed as unknown as GistPayload };
}

// ---- Export ----------------------------------------------------------------

export function buildExportPayload(data: AllLocalData): GistPayload {
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

export function serializeExport(payload: GistPayload): string {
  // Pretty-printed on purpose: a backup someone might open, skim, or
  // hand-edit is worth more than the bytes saved by minifying it.
  return JSON.stringify(payload, null, 2);
}

/** `cadence-backup-2026-08-19.json` — dated so successive backups in a
 * downloads folder don't overwrite each other or need renaming. */
export function exportFilename(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `cadence-backup-${year}-${month}-${day}.json`;
}

// ---- DOM helpers (browser-only, not unit-tested) ---------------------------

export function downloadJsonFile(contents: string, filename: string): void {
  const blob = new Blob([contents], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  // Revoking immediately after a synthetic click is safe — the browser has
  // already taken its own reference to the blob by this point — and skipping
  // it leaks the blob for the life of the document.
  URL.revokeObjectURL(url);
}

export function readFileAsText(file: File): Promise<string> {
  return file.text();
}
