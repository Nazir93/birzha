import { describe, expect, it } from "vitest";

import { purchaseDocumentsListQuerySchema } from "./purchase-document-list-http.js";

describe("purchaseDocumentsListQuerySchema", () => {
  it("accepts pagination and scope", () => {
    expect(
      purchaseDocumentsListQuerySchema.parse({
        limit: "25",
        offset: "50",
        scope: "archived",
        search: "Н-1",
      }),
    ).toEqual({
      limit: 25,
      offset: 50,
      scope: "archived",
      search: "Н-1",
    });
  });
});
