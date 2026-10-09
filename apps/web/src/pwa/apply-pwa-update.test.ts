import { describe, expect, it, vi } from "vitest";

import { applyPwaUpdate } from "./apply-pwa-update.js";

describe("applyPwaUpdate", () => {
  it("шлёт SKIP_WAITING waiting-воркеру и reload по controllerchange", async () => {
    const waiting = { postMessage: vi.fn() };
    const updateServiceWorker = vi.fn(async () => undefined);
    const reload = vi.fn();
    let controllerListener: (() => void) | undefined;

    await applyPwaUpdate({
      updateServiceWorker,
      registration: { waiting } as unknown as ServiceWorkerRegistration,
      reload,
      onControllerChange: (listener) => {
        controllerListener = listener;
      },
      scheduleFallback: () => {
        /* без авто-reload в этом кейсе */
      },
    });

    expect(updateServiceWorker).toHaveBeenCalledWith(true);
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
    expect(reload).not.toHaveBeenCalled();

    controllerListener?.();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("fallback reload, если controlling не пришёл", async () => {
    const updateServiceWorker = vi.fn(async () => undefined);
    const reload = vi.fn();
    let fallback: (() => void) | undefined;

    await applyPwaUpdate({
      updateServiceWorker,
      reload,
      onControllerChange: () => {
        /* silent */
      },
      scheduleFallback: (fn) => {
        fallback = fn;
      },
      fallbackMs: 50,
    });

    expect(reload).not.toHaveBeenCalled();
    fallback?.();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("reload только один раз", async () => {
    const reload = vi.fn();
    let controllerListener: (() => void) | undefined;
    let fallback: (() => void) | undefined;

    await applyPwaUpdate({
      updateServiceWorker: async () => undefined,
      reload,
      onControllerChange: (listener) => {
        controllerListener = listener;
      },
      scheduleFallback: (fn) => {
        fallback = fn;
      },
    });

    controllerListener?.();
    fallback?.();
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
