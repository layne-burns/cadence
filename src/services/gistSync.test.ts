import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GistSyncError,
  clearCredentials,
  createGist,
  fetchGist,
  findExistingCadenceGist,
  loadStoredCredentials,
  pushGist,
  saveCredentials,
  shouldPullBeforePush,
} from "./gistSync";
import type { GistPayload } from "../types/gist";
import { createEmptyBlueprint } from "../types/template";
import { createEmptyStreakState } from "../types/adherence";

// Minimal in-memory localStorage — this module only needs get/set/remove,
// so a full jsdom environment isn't worth pulling in just for this suite.
class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

function samplePayload(): GistPayload {
  return {
    version: 1,
    exportedAt: "2026-08-24T00:00:00.000Z",
    blueprint: createEmptyBlueprint(),
    events: [],
    adherenceLogs: [],
    streakState: createEmptyStreakState(),
  };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", new MemoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("credential storage", () => {
  it("returns null when no PAT has been saved", () => {
    expect(loadStoredCredentials()).toBeNull();
  });

  it("round-trips PAT and gist id", () => {
    saveCredentials({ pat: "ghp_abc123", gistId: "gist-1" });
    expect(loadStoredCredentials()).toEqual({
      pat: "ghp_abc123",
      gistId: "gist-1",
    });
  });

  it("clears both fields", () => {
    saveCredentials({ pat: "ghp_abc123", gistId: "gist-1" });
    clearCredentials();
    expect(loadStoredCredentials()).toBeNull();
  });
});

describe("REST client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("createGist posts to /gists and returns the new id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "new-gist", updated_at: "2026-08-24T00:00:00Z" }), {
        status: 201,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("localStorage", new MemoryStorage());

    const result = await createGist("ghp_abc", samplePayload());

    expect(result).toEqual({ gistId: "new-gist", updatedAt: "2026-08-24T00:00:00Z" });
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.github.com/gists");
    expect(options.method).toBe("POST");
    expect((options.headers as Record<string, string>).Authorization).toBe(
      "Bearer ghp_abc",
    );
    const body = JSON.parse(options.body as string);
    expect(body.public).toBe(false);
    expect(Object.keys(body.files)).toEqual(["cadence-data.json"]);
  });

  it("fetchGist parses the payload out of the named file", async () => {
    const payload = samplePayload();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          updated_at: "2026-08-24T01:00:00Z",
          files: { "cadence-data.json": { content: JSON.stringify(payload) } },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchGist("ghp_abc", "gist-1");

    expect(result.updatedAt).toBe("2026-08-24T01:00:00Z");
    expect(result.payload).toEqual(payload);
  });

  it("fetchGist throws GistSyncError when the expected file is missing", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ updated_at: "x", files: {} }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchGist("ghp_abc", "gist-1")).rejects.toBeInstanceOf(GistSyncError);
  });

  it("surfaces GitHub's error message and status on a failed request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "Bad credentials" }), { status: 401 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(pushGist("bad-pat", "gist-1", samplePayload())).rejects.toMatchObject({
      message: "Bad credentials",
      status: 401,
    });
  });

  it("findExistingCadenceGist returns the id of a gist holding cadence-data.json", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          { id: "someone-elses-notes", files: { "notes.md": {} } },
          { id: "the-one", files: { "cadence-data.json": {} } },
        ]),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    expect(await findExistingCadenceGist("ghp_abc")).toBe("the-one");
  });

  it("findExistingCadenceGist returns null when the account has no Cadence gist", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{ id: "x", files: { "other.txt": {} } }]), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    expect(await findExistingCadenceGist("ghp_abc")).toBeNull();
  });

  it("findExistingCadenceGist prefers the most recently updated duplicate", async () => {
    // GitHub returns gists newest-first, so a stale duplicate from before
    // discovery existed should lose to the one in active use.
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          { id: "newer", files: { "cadence-data.json": {} } },
          { id: "older", files: { "cadence-data.json": {} } },
        ]),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    expect(await findExistingCadenceGist("ghp_abc")).toBe("newer");
  });

  it("findExistingCadenceGist surfaces a bad token instead of reporting 'none found'", async () => {
    // Swallowing a 401 into null would silently create a duplicate gist.
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "Bad credentials" }), { status: 401 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(findExistingCadenceGist("bad")).rejects.toMatchObject({ status: 401 });
  });

  it("pushGist PATCHes the gist with the encoded payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "gist-1", updated_at: "2026-08-24T02:00:00Z" }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await pushGist("ghp_abc", "gist-1", samplePayload());

    expect(result.updatedAt).toBe("2026-08-24T02:00:00Z");
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.github.com/gists/gist-1");
    expect(options.method).toBe("PATCH");
  });
});

describe("shouldPullBeforePush", () => {
  it("pulls when we've never synced before", () => {
    expect(shouldPullBeforePush(null, "2026-08-24T00:00:00Z")).toBe(true);
  });

  it("pulls when the remote is newer than our last known state", () => {
    expect(
      shouldPullBeforePush("2026-08-24T00:00:00Z", "2026-08-24T01:00:00Z"),
    ).toBe(true);
  });

  it("does not pull when the remote matches our last known state", () => {
    expect(
      shouldPullBeforePush("2026-08-24T00:00:00Z", "2026-08-24T00:00:00Z"),
    ).toBe(false);
  });

  it("does not pull when the remote is older (shouldn't happen, but not a reason to pull)", () => {
    expect(
      shouldPullBeforePush("2026-08-24T01:00:00Z", "2026-08-24T00:00:00Z"),
    ).toBe(false);
  });
});
