import type { StorageLike } from "./storage-types.js";

let fallback: StorageLike | null = null;

/** Один экземпляр для среды без `localStorage` (тесты, SSR). */
export function getFallbackStorage(): StorageLike {
  if (!fallback) {
    const mem = new Map<string, string>();
    fallback = {
      getItem: (k) => mem.get(k) ?? null,
      setItem: (k, v) => {
        mem.set(k, v);
      },
    };
  }
  return fallback;
}
