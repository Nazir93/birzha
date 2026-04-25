import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearDistributionShipPayload,
  readDistributionShipPayload,
  saveDistributionShipPayload,
} from "./distribution-ship-payload.js";

const mem = new Map<string, string>();
beforeEach(() => {
  mem.clear();
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => {
      mem.set(k, v);
    },
    removeItem: (k: string) => {
      mem.delete(k);
    },
  } as Storage);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("distribution-ship-payload", () => {
  it("save + read, дедуп id", () => {
    saveDistributionShipPayload({ v: 1, batchIds: ["a", "a", "b"] });
    const p = readDistributionShipPayload();
    expect(p).toEqual({ v: 1, batchIds: ["a", "b"] });
  });

  it("clear", () => {
    saveDistributionShipPayload({ v: 1, batchIds: ["x"] });
    clearDistributionShipPayload();
    expect(readDistributionShipPayload()).toBeNull();
  });
});
