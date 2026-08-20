import { Download, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "../common/Button";
import * as db from "../../services/db";
import {
  buildExportPayload,
  downloadJsonFile,
  exportFilename,
  parseImportFile,
  readFileAsText,
  serializeExport,
} from "../../services/transfer";

type PendingImport = {
  fileName: string;
  data: db.AllLocalData;
};

/**
 * Manual JSON backup/restore — the fallback path when Gist sync isn't
 * set up, and the escape hatch when it is.
 *
 * Import is destructive (it replaces everything, not merges), so it runs
 * as validate → summarize → confirm rather than applying straight from
 * the file picker. On confirm the app hard-reloads: every hook read its
 * slice of the database at mount, and re-seeding all of them from here
 * would mean threading a "data was replaced" signal through the whole
 * tree for something that happens approximately never.
 */
export function ImportExportPanel() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [pending, setPending] = useState<PendingImport | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleExport() {
    setBusy(true);
    try {
      const data = await db.exportAllData();
      downloadJsonFile(serializeExport(buildExportPayload(data)), exportFilename());
    } finally {
      setBusy(false);
    }
  }

  async function handleFileChosen(file: File) {
    setErrors([]);
    setPending(null);
    const result = parseImportFile(await readFileAsText(file));
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setPending({
      fileName: file.name,
      data: {
        blueprint: result.payload.blueprint,
        events: result.payload.events,
        adherenceLogs: result.payload.adherenceLogs,
        streakState: result.payload.streakState,
      },
    });
  }

  async function confirmImport() {
    if (!pending) return;
    setBusy(true);
    // Not silent: a restored backup should propagate up to the Gist too.
    await db.replaceAllData(pending.data);
    window.location.reload();
  }

  const blockCount = pending
    ? Object.values(pending.data.blueprint.days).reduce(
        (total, day) => total + day.blocks.length,
        0,
      )
    : 0;

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-medium">Backup</h3>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Save everything to a JSON file, or restore from one. Same format the Gist
          uses, so the two are interchangeable.
        </p>
      </div>

      <div className="flex gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => void handleExport()}
        >
          <Download className="size-4" /> Export
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="size-4" /> Import
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFileChosen(file);
            // Reset so re-picking the same file fires `change` again.
            event.target.value = "";
          }}
        />
      </div>

      {errors.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950">
          <p className="text-xs font-medium text-red-700 dark:text-red-300">
            That file can't be imported:
          </p>
          <ul className="mt-1 list-inside list-disc text-xs text-red-600 dark:text-red-400">
            {errors.slice(0, 5).map((error) => (
              <li key={error}>{error}</li>
            ))}
            {errors.length > 5 && <li>…and {errors.length - 5} more</li>}
          </ul>
        </div>
      )}

      {pending && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950">
          <p className="text-xs text-amber-800 dark:text-amber-200">
            <strong>{pending.fileName}</strong> looks valid: {blockCount} routine block
            {blockCount === 1 ? "" : "s"}, {pending.data.events.length} event
            {pending.data.events.length === 1 ? "" : "s"},{" "}
            {pending.data.adherenceLogs.length} check-in
            {pending.data.adherenceLogs.length === 1 ? "" : "s"}.
          </p>
          <p className="mt-1 text-xs font-medium text-amber-800 dark:text-amber-200">
            Importing replaces everything currently in this browser. This can't be undone
            — export first if you're unsure.
          </p>
          <div className="mt-2 flex gap-2">
            <Button
              size="sm"
              variant="danger"
              disabled={busy}
              onClick={() => void confirmImport()}
            >
              Replace my data
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPending(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
