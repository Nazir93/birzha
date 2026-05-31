import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  readPreferredLoadingDestinationCode,
  readPreferredLoadingTripId,
  writePreferredLoadingDestinationCode,
  writePreferredLoadingTripId,
} from "./ops-preferred-loading-trip.js";

describe("ops-preferred-loading-trip", () => {
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

  it("запоминает и читает рейс", () => {
    expect(readPreferredLoadingTripId()).toBeNull();
    writePreferredLoadingTripId("trip-1");
    expect(readPreferredLoadingTripId()).toBe("trip-1");
    writePreferredLoadingTripId(null);
    expect(readPreferredLoadingTripId()).toBeNull();
  });

  it("запоминает направление", () => {
    writePreferredLoadingDestinationCode("moscow");
    expect(readPreferredLoadingDestinationCode()).toBe("moscow");
  });
});
