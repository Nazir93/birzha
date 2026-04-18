import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as idb from "./outbox-idb.js";
import { getDefaultOutboxBackend, resetDefaultOutboxBackendCacheForTests } from "./outbox-backend.js";
import { OUTBOX_STORAGE_KEY } from "./outbox-queue.js";
import { resetOutboxIdbForTests } from "./outbox-idb.js";
import { syncOutboxScopeTo } from "./outbox-scope.js";

function installLocalStorage(): void {
  const m = new Map<string, string>();
  globalThis.localStorage = {
    get length() {
      return m.size;
    },
    clear() {
      m.clear();
    },
    getItem: (k: string) => m.get(k) ?? null,
    key: () => null,
    removeItem: (k: string) => {
      m.delete(k);
    },
    setItem: (k: string, v: string) => {
      m.set(k, v);
    },
  } as Storage;
}

beforeEach(async () => {
  syncOutboxScopeTo("default");
  await resetOutboxIdbForTests();
  resetDefaultOutboxBackendCacheForTests();
  installLocalStorage();
  globalThis.localStorage.removeItem(OUTBOX_STORAGE_KEY);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("outbox backend: IDB → localStorage fallback", () => {
  it("если getOutboxIdb отклоняется — очередь пишется в localStorage", async () => {
    vi.spyOn(idb, "getOutboxIdb").mockRejectedValue(new Error("IndexedDB unavailable"));

    const backend = getDefaultOutboxBackend();
    await backend.enqueue({
      actionType: "create_trip",
      payload: { id: "t1", tripNumber: "X" },
      localActionId: "lid-fallback-1",
    });

    const raw = globalThis.localStorage.getItem(OUTBOX_STORAGE_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!) as { localActionId: string }[];
    expect(parsed).toHaveLength(1);
    expect(parsed[0].localActionId).toBe("lid-fallback-1");
  });
});
