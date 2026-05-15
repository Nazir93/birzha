import { beforeEach, describe, expect, it } from "vitest";

import { OUTBOX_STORAGE_KEY, clearOutboxSync, enqueueSync, loadOutboxSync } from "./outbox-queue.js";
import { processSyncQueue } from "./process-sync-queue.js";
import { syncOutboxScopeTo } from "./outbox-scope.js";

beforeEach(() => {
  syncOutboxScopeTo("default");
});

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

describe("processSyncQueue", () => {
  it("успех: снимает элемент с очереди", async () => {
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

    const fetchImpl = async () =>
      new Response(JSON.stringify({ status: "ok", actionId: "a1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    const r = await processSyncQueue({ storage: s, fetchImpl });
    expect(r.stoppedReason).toBe("empty");
    expect(r.processed).toBe(1);
    expect(loadOutboxSync(s)).toHaveLength(0);
  });

  it("rejected: очередь не укорачивается", async () => {
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

    const fetchImpl = async () =>
      new Response(
        JSON.stringify({
          status: "rejected",
          actionId: "a1",
          reason: "нет",
          resolution: "проверить",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );

    const r = await processSyncQueue({ storage: s, fetchImpl });
    expect(r.stoppedReason).toBe("rejected");
    expect(r.processed).toBe(0);
    const raw = s.getItem(OUTBOX_STORAGE_KEY);
    expect(raw).toBeTruthy();
    const q = JSON.parse(raw!) as unknown[];
    expect(q.length).toBe(1);
  });

  it("401 от /api/sync возвращает unauthorized и оставляет очередь", async () => {
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

    const fetchImpl = async () => new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });

    const r = await processSyncQueue({ storage: s, fetchImpl });
    expect(r.stoppedReason).toBe("unauthorized");
    expect(r.httpStatus).toBe(401);
    expect(loadOutboxSync(s)).toHaveLength(1);
  });

  it("batch_limit: не более maxPerRun успешных отправок за один вызов", async () => {
    const s = memoryStorage();
    clearOutboxSync(s);
    for (let i = 0; i < 3; i += 1) {
      enqueueSync(
        {
          actionType: "create_trip",
          payload: { id: `t${i}`, tripNumber: `N${i}` },
          localActionId: `a${i}`,
        },
        s,
      );
    }

    const fetchImpl = async () =>
      new Response(JSON.stringify({ status: "ok", actionId: "x" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    const r = await processSyncQueue({ storage: s, fetchImpl, maxPerRun: 2 });
    expect(r.stoppedReason).toBe("batch_limit");
    expect(r.processed).toBe(2);
    expect(loadOutboxSync(s)).toHaveLength(1);
  });
});
