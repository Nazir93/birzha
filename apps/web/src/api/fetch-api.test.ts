/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  apiFetch,
  getStoredApiToken,
  onApiUnauthorized,
  setStoredApiToken,
} from "./fetch-api.js";

describe("apiFetch", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it("при 401 очищает токен и вызывает подписчиков", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    setStoredApiToken("bad-token");
    const listener = vi.fn();
    const off = onApiUnauthorized(listener);

    try {
      await apiFetch("/api/meta");
      expect(getStoredApiToken()).toBeNull();
      expect(listener).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalled();
    } finally {
      off();
    }
  });

  it("при 200 не уведомляет и не трогает токен", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    setStoredApiToken("ok");
    const listener = vi.fn();
    const off = onApiUnauthorized(listener);

    try {
      await apiFetch("/api/meta");
      expect(getStoredApiToken()).toBe("ok");
      expect(listener).not.toHaveBeenCalled();
    } finally {
      off();
    }
  });
});
