import { describe, expect, it } from "vitest";

import { loadingManifestsListQuerySchema } from "./loading-manifest-list-http.js";

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
