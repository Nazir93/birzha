import { describe, expect, it, vi } from "vitest";

import { clearOutboxSync, enqueueSync } from "./outbox-queue.js";
import { processSyncQueueSerialized } from "./process-sync-queue-serial.js";

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear() {
      m.clear();
    },
    getItem: (k) => m.get(k) ?? null,
    key: () => null,
    removeItem: (k) => {
      m.delete(k);
    },
    setItem: (k, v) => {
      m.set(k, v);
    },
  } as Storage;
}

describe("processSyncQueueSerialized", () => {
  it("параллельные вызовы с теми же опциями — один прогон", async () => {
    const s = memoryStorage();
    clearOutboxSync(s);
    enqueueSync(
      {
        actionType: "create_trip",
        payload: { id: "t1", tripNumber: "X" },
        localActionId: "a1",
      },
      s,
    );

    const fetchImpl = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 5));
      return new Response(JSON.stringify({ status: "ok", actionId: "a1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const opts = { storage: s, fetchImpl };
    const p1 = processSyncQueueSerialized(opts);
    const p2 = processSyncQueueSerialized(opts);
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(r1).toEqual(r2);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(r1.stoppedReason).toBe("empty");
    expect(r1.processed).toBe(1);
  });
});
