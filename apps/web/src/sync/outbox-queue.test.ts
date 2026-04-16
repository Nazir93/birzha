import { describe, expect, it } from "vitest";

import {
  clearOutboxSync,
  enqueueSync,
  loadOutboxSync,
  outboxLengthSync,
  peekHeadSync,
} from "./outbox-queue.js";

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

describe("outbox-queue", () => {
  it("FIFO: enqueue сохраняет порядок", () => {
    const s = memoryStorage();
    clearOutboxSync(s);
    enqueueSync(
      {
        actionType: "create_trip",
        payload: { id: "t1", tripNumber: "A" },
      },
      s,
    );
    enqueueSync(
      {
        actionType: "create_trip",
        payload: { id: "t2", tripNumber: "B" },
      },
      s,
    );
    const q = loadOutboxSync(s);
    expect(q).toHaveLength(2);
    expect(q[0]?.payload).toEqual({ id: "t1", tripNumber: "A" });
    expect(peekHeadSync(s)?.payload).toEqual({ id: "t1", tripNumber: "A" });
    expect(outboxLengthSync(s)).toBe(2);
  });
});
