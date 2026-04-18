import { beforeEach, describe, expect, it } from "vitest";

import { indexedDbNameForScope } from "./outbox-names.js";
import { resolveOutboxScopeKey, syncOutboxScopeTo } from "./outbox-scope.js";

beforeEach(() => {
  syncOutboxScopeTo("default");
});

describe("outbox scope", () => {
  it("resolveOutboxScopeKey", () => {
    expect(resolveOutboxScopeKey(false, undefined)).toBe("default");
    expect(resolveOutboxScopeKey(true, undefined)).toBe("anon");
    expect(resolveOutboxScopeKey(true, "u-1")).toBe("user:u-1");
  });

  it("indexedDbNameForScope: default сохраняет имя legacy БД", () => {
    expect(indexedDbNameForScope("default")).toBe("birzha-offline");
    expect(indexedDbNameForScope("user:abc")).toMatch(/^birzha-offline-user:abc$/);
  });

  it("syncOutboxScopeTo возвращает false при повторе", () => {
    syncOutboxScopeTo("default");
    expect(syncOutboxScopeTo("default")).toBe(false);
    expect(syncOutboxScopeTo("anon")).toBe(true);
    expect(syncOutboxScopeTo("anon")).toBe(false);
  });
});
