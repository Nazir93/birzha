/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  apiFetch,
  apiPostJsonOr403,
  assertOkResponse,
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

  it("assertOkResponse не бросает при 200", async () => {
    const res = new Response(null, { status: 200 });
    await expect(assertOkResponse(res)).resolves.toBeUndefined();
  });

  it("assertOkResponse бросает с телом при ошибке", async () => {
    const res = new Response("bad thing", { status: 400 });
    await expect(assertOkResponse(res)).rejects.toThrow("bad thing");
  });

  it("assertOkResponse с подписью включает её в сообщение", async () => {
    const res = new Response("x", { status: 500 });
    await expect(assertOkResponse(res, "/api/x")).rejects.toThrow("/api/x: x");
  });

  it("apiPostJsonOr403 при 403 бросает переданный текст", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(apiPostJsonOr403("/api/x", {}, "Нет прав")).rejects.toThrow("Нет прав");
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
