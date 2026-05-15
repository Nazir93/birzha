import { describe, expect, it } from "vitest";

import { combineAbortSignals } from "./abort-signal-utils.js";

describe("combineAbortSignals", () => {
  it("отменяет результат, если первый сигнал уже отменён", () => {
    const a = AbortSignal.abort(new DOMException("a"));
    const b = new AbortController().signal;
    const out = combineAbortSignals(a, b);
    expect(out.aborted).toBe(true);
  });

  it("отменяет при срабатывании любого из двух", async () => {
    const a = new AbortController();
    const b = new AbortController();
    const out = combineAbortSignals(a.signal, b.signal);
    expect(out.aborted).toBe(false);
    b.abort(new DOMException("b", "AbortError"));
    await new Promise((r) => setTimeout(r, 0));
    expect(out.aborted).toBe(true);
  });
});
