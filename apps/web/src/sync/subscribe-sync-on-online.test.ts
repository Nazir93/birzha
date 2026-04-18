/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { processSyncQueueSerialized } = vi.hoisted(() => ({
  processSyncQueueSerialized: vi.fn(),
}));

vi.mock("./process-sync-queue-serial.js", () => ({
  processSyncQueueSerialized,
}));

import { subscribeSyncOnOnline } from "./subscribe-sync-on-online.js";

describe("subscribeSyncOnOnline", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    processSyncQueueSerialized.mockResolvedValue({
      processed: 0,
      stoppedReason: "empty",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    processSyncQueueSerialized.mockReset();
  });

  it("при periodicIntervalMs вызывает синк по интервалу на видимой вкладке", () => {
    const unsub = subscribeSyncOnOnline({ periodicIntervalMs: 10_000 });
    const before = processSyncQueueSerialized.mock.calls.length;
    vi.advanceTimersByTime(10_000);
    expect(processSyncQueueSerialized.mock.calls.length).toBeGreaterThan(before);
    unsub();
  });
});
