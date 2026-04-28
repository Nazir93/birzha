import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readPreferredWarehouseId, writePreferredWarehouseId } from "./ops-preferred-warehouse.js";

describe("ops-preferred-warehouse", () => {
  beforeEach(() => {
    const store: Record<string, string> = {};
    vi.stubGlobal(
      "localStorage",
      {
        get length() {
          return Object.keys(store).length;
        },
        clear() {
          for (const k of Object.keys(store)) {
            delete store[k];
          }
        },
        getItem(key: string) {
          return Object.prototype.hasOwnProperty.call(store, key) ? store[key]! : null;
        },
        setItem(key: string, value: string) {
          store[key] = value;
        },
        removeItem(key: string) {
          delete store[key];
        },
        key(index: number) {
          return Object.keys(store)[index] ?? null;
        },
      } as Storage,
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("пишет и читает id склада", () => {
    writePreferredWarehouseId("wh-1");
    expect(readPreferredWarehouseId()).toBe("wh-1");
  });

  it("null сбрасывает", () => {
    writePreferredWarehouseId("x");
    writePreferredWarehouseId(null);
    expect(readPreferredWarehouseId()).toBeNull();
  });

  it("при ошибке localStorage возвращает null", () => {
    vi.spyOn(globalThis.localStorage, "getItem").mockImplementation(() => {
      throw new Error("x");
    });
    expect(readPreferredWarehouseId()).toBeNull();
  });
});
