/**
 * Объединяет два `AbortSignal`: при срабатывании любого — отмена общего контроллера.
 * Нужен для таймаута `fetch` вместе с внешним `signal` из вызывающего кода.
 */
export function combineAbortSignals(a: AbortSignal, b: AbortSignal): AbortSignal {
  const out = new AbortController();
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) {
      return;
    }
    cleaned = true;
    a.removeEventListener("abort", onAbort);
    b.removeEventListener("abort", onAbort);
  };
  const onAbort = (ev: Event) => {
    const src = ev.currentTarget as AbortSignal;
    cleanup();
    out.abort(src.reason);
  };
  for (const s of [a, b]) {
    if (s.aborted) {
      out.abort(s.reason);
      return out.signal;
    }
    s.addEventListener("abort", onAbort);
  }
  out.signal.addEventListener("abort", () => cleanup(), { once: true });
  return out.signal;
}
