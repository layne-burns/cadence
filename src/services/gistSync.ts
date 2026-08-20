/**
 * The only module allowed to talk to `api.github.com`. Two things live
 * here: a thin GitHub Gist REST client, and credential storage. Both are
 * intentionally simple functions rather than a class — there's no
 * internal state to manage beyond "what's in localStorage right now."
 *
 * Security note (see CLAUDE.md): the PAT and Gist ID are read from and
 * written to `globalThis.localStorage` only, and every request goes straight
 * to `api.github.com` — this module must never send them anywhere else,
 * and nothing else in the app should read `cadence.gistPat` directly.
 */

import type { GistPayload } from "../types/gist";

const API_BASE = "https://api.github.com";
const GIST_FILENAME = "cadence-data.json";

const PAT_STORAGE_KEY = "cadence.gistPat";
const GIST_ID_STORAGE_KEY = "cadence.gistId";

export class GistSyncError extends Error {
  readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "GistSyncError";
    this.status = status;
  }
}

// ---- Credential storage --------------------------------------------------

export interface GistCredentials {
  pat: string;
  gistId: string | null;
}

export function loadStoredCredentials(): GistCredentials | null {
  const pat = globalThis.localStorage.getItem(PAT_STORAGE_KEY);
  if (!pat) return null;
  return { pat, gistId: globalThis.localStorage.getItem(GIST_ID_STORAGE_KEY) };
}

export function saveCredentials(credentials: GistCredentials): void {
  globalThis.localStorage.setItem(PAT_STORAGE_KEY, credentials.pat);
  if (credentials.gistId) {
    globalThis.localStorage.setItem(GIST_ID_STORAGE_KEY, credentials.gistId);
  } else {
    globalThis.localStorage.removeItem(GIST_ID_STORAGE_KEY);
  }
}

export function clearCredentials(): void {
  globalThis.localStorage.removeItem(PAT_STORAGE_KEY);
  globalThis.localStorage.removeItem(GIST_ID_STORAGE_KEY);
}

// ---- REST client ----------------------------------------------------------

function authHeaders(pat: string): HeadersInit {
  return {
    Authorization: `Bearer ${pat}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function parseErrorMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (
      body &&
      typeof body === "object" &&
      "message" in body &&
      typeof body.message === "string"
    ) {
      return body.message;
    }
  } catch {
    // Response wasn't JSON — fall through to the generic message below.
  }
  return `GitHub API error (${response.status})`;
}

export interface GistWriteResult {
  gistId: string;
  updatedAt: string;
}

export interface GistReadResult {
  payload: GistPayload;
  updatedAt: string;
}

/** Creates a new private Gist holding `initialPayload` and returns its id.
 * This is the "Create New Gist Automatically" button's implementation —
 * the caller is responsible for persisting the returned id via
 * `saveCredentials`. */
export async function createGist(
  pat: string,
  initialPayload: GistPayload,
): Promise<GistWriteResult> {
  const response = await fetch(`${API_BASE}/gists`, {
    method: "POST",
    headers: { ...authHeaders(pat), "Content-Type": "application/json" },
    body: JSON.stringify({
      description: "Cadence app data — do not edit by hand",
      public: false,
      files: {
        [GIST_FILENAME]: { content: JSON.stringify(initialPayload, null, 2) },
      },
    }),
  });
  if (!response.ok) {
    throw new GistSyncError(await parseErrorMessage(response), response.status);
  }
  const body = (await response.json()) as { id: string; updated_at: string };
  return { gistId: body.id, updatedAt: body.updated_at };
}

/**
 * Finds an existing Cadence gist on this account, by looking for one
 * whose files include `cadence-data.json`.
 *
 * This exists to stop a silent, unrecoverable-looking failure: setting up
 * a second device by pasting the same token used to *create a new gist*,
 * so the two devices synced to different files and never saw each other's
 * data — with both reporting "Synced" the whole time. Discovering the
 * existing gist means adding a device is just "paste the same token".
 *
 * Returns the most recently updated match, since GitHub returns gists
 * newest-first and a duplicate from before this existed should lose to
 * the one in active use.
 */
export async function findExistingCadenceGist(pat: string): Promise<string | null> {
  const response = await fetch(`${API_BASE}/gists?per_page=100`, {
    headers: authHeaders(pat),
  });
  if (!response.ok) {
    throw new GistSyncError(await parseErrorMessage(response), response.status);
  }
  const body = (await response.json()) as Array<{
    id: string;
    files: Record<string, unknown>;
  }>;
  const match = body.find((gist) => GIST_FILENAME in (gist.files ?? {}));
  return match?.id ?? null;
}

export async function fetchGist(
  pat: string,
  gistId: string,
): Promise<GistReadResult> {
  const response = await fetch(`${API_BASE}/gists/${gistId}`, {
    headers: authHeaders(pat),
  });
  if (!response.ok) {
    throw new GistSyncError(await parseErrorMessage(response), response.status);
  }
  const body = (await response.json()) as {
    updated_at: string;
    files: Record<string, { content: string } | undefined>;
  };
  const file = body.files[GIST_FILENAME];
  if (!file) {
    throw new GistSyncError(`Gist has no ${GIST_FILENAME} file`);
  }
  const payload = JSON.parse(file.content) as GistPayload;
  return { payload, updatedAt: body.updated_at };
}

export async function pushGist(
  pat: string,
  gistId: string,
  payload: GistPayload,
): Promise<GistWriteResult> {
  const response = await fetch(`${API_BASE}/gists/${gistId}`, {
    method: "PATCH",
    headers: { ...authHeaders(pat), "Content-Type": "application/json" },
    body: JSON.stringify({
      files: {
        [GIST_FILENAME]: { content: JSON.stringify(payload, null, 2) },
      },
    }),
  });
  if (!response.ok) {
    throw new GistSyncError(await parseErrorMessage(response), response.status);
  }
  const body = (await response.json()) as { id: string; updated_at: string };
  return { gistId: body.id, updatedAt: body.updated_at };
}

// ---- Reconciliation --------------------------------------------------------

/**
 * Pure decision function, deliberately separated from the fetch calls
 * above so it's unit-testable without mocking the network: given the
 * remote's `updated_at` the last time we know we were fully in sync with
 * it, and its `updated_at` right now, should we pull before pushing
 * anything local? `null` means "we've never successfully synced" — always
 * pull first in that case, since local could be behind a Gist that was
 * seeded from another device.
 */
export function shouldPullBeforePush(
  lastKnownRemoteUpdatedAt: string | null,
  currentRemoteUpdatedAt: string,
): boolean {
  if (!lastKnownRemoteUpdatedAt) return true;
  return (
    new Date(currentRemoteUpdatedAt).getTime() >
    new Date(lastKnownRemoteUpdatedAt).getTime()
  );
}
