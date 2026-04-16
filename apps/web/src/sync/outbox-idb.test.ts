import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it } from "vitest";

import { resetDefaultOutboxBackendCacheForTests } from "./outbox-backend.js";
import { enqueue, loadOutbox } from "./outbox-api.js";
import { OUTBOX_STORAGE_KEY } from "./outbox-queue.js";
import { resetOutboxIdbForTests } from "./outbox-idb.js";

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
  await resetOutboxIdbForTests();
  resetDefaultOutboxBackendCacheForTests();
  installLocalStorage();
  globalThis.localStorage.removeItem(OUTBOX_STORAGE_KEY);
});

describe("outbox IndexedDB", () => {
  it("FIFO: порядок enqueue сохраняется", async () => {
    await enqueue({
      actionType: "create_trip",
      payload: { id: "t1", tripNumber: "A" },
      localActionId: "a1",
    });
    await enqueue({
      actionType: "create_trip",
      payload: { id: "t2", tripNumber: "B" },
      localActionId: "a2",
    });
    const q = await loadOutbox();
    expect(q).toHaveLength(2);
    expect(q[0]?.payload).toEqual({ id: "t1", tripNumber: "A" });
    expect(q[1]?.payload).toEqual({ id: "t2", tripNumber: "B" });
  });

  it("однократно переносит legacy localStorage и очищает ключ", async () => {
    const legacy = [
      {
        localActionId: "m1",
        createdAt: 42,
        actionType: "create_trip" as const,
        payload: { id: "t0", tripNumber: "Z" },
      },
    ];
    globalThis.localStorage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify(legacy));

    const q = await loadOutbox();
    expect(q).toHaveLength(1);
    expect(q[0]?.localActionId).toBe("m1");
    expect(globalThis.localStorage.getItem(OUTBOX_STORAGE_KEY)).toBeNull();

    const q2 = await loadOutbox();
    expect(q2).toHaveLength(1);
  });
});
