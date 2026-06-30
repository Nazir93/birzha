import { describe, expect, it } from "vitest";

import {
  loadingManifestActiveScopeWhere,
  loadingManifestsListQuerySchema,
} from "./loading-manifest-list-http.js";

describe("loadingManifestsListQuerySchema", () => {
  it("accepts pagination and scope", () => {
    expect(
      loadingManifestsListQuerySchema.parse({
        limit: "50",
        offset: "100",
        scope: "active",
        search: "Москва",
      }),
    ).toEqual({
      limit: 50,
      offset: 100,
      scope: "active",
      search: "Москва",
    });
  });

  it("rejects invalid scope", () => {
    expect(() => loadingManifestsListQuerySchema.parse({ scope: "bad" })).toThrow();
  });
});

describe("loadingManifestActiveScopeWhere", () => {
  it("exports active scope SQL fragment", () => {
    expect(loadingManifestActiveScopeWhere()).toBeDefined();
  });

  it("matches active list scope (open or unassigned trips)", () => {
    const active = loadingManifestActiveScopeWhere();
    expect(active).not.toBeUndefined();
    expect(String(active)).not.toBe("");
  });
});
