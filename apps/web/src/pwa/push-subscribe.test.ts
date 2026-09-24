import { describe, expect, it } from "vitest";

import { urlBase64ToUint8Array } from "./push-subscribe.js";

describe("urlBase64ToUint8Array", () => {
  it("декодирует URL-safe base64", () => {
    // "hi" in base64url
    const bytes = urlBase64ToUint8Array("aGk");
    expect(Array.from(bytes)).toEqual([104, 105]);
  });
});
