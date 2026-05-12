import { describe, expect, it, vi } from "vitest";

import { isLikelyNetworkOrOfflineFailure } from "./is-network-or-offline-failure.js";

describe("isLikelyNetworkOrOfflineFailure", () => {
  it("возвращает true при navigator.onLine === false", () => {
    vi.stubGlobal("navigator", { onLine: false });
    expect(isLikelyNetworkOrOfflineFailure(new Error("HTTP 500"))).toBe(true);
    vi.unstubAllGlobals();
  });

  it("возвращает false для TypeError без признаков сети", () => {
    vi.stubGlobal("navigator", { onLine: true });
    expect(isLikelyNetworkOrOfflineFailure(new TypeError("object is not iterable"))).toBe(false);
    vi.unstubAllGlobals();
  });

  it("возвращает true для TypeError Failed to fetch", () => {
    vi.stubGlobal("navigator", { onLine: true });
    expect(isLikelyNetworkOrOfflineFailure(new TypeError("Failed to fetch"))).toBe(true);
    vi.unstubAllGlobals();
  });

  it("возвращает false для обычной бизнес-ошибки HTTP", () => {
    vi.stubGlobal("navigator", { onLine: true });
    expect(isLikelyNetworkOrOfflineFailure(new Error("/api/x: HTTP 409"))).toBe(false);
    vi.unstubAllGlobals();
  });
});
