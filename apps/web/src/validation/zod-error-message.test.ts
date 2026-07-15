import { describe, expect, it } from "vitest";
import { z } from "zod";

import { zodErrorMessage } from "./zod-error-message.js";

describe("zodErrorMessage", () => {
  it("подписывает grossKg в строке накладной (не totalKg)", () => {
    const schema = z.object({
      lines: z.array(z.object({ grossKg: z.number().positive() })),
    });
    try {
      schema.parse({ lines: [{ grossKg: 0 }] });
      expect.unreachable();
    } catch (e) {
      const msg = zodErrorMessage(e as z.ZodError);
      expect(msg).toMatch(/брутто, кг/);
      expect(msg).not.toMatch(/totalKg/);
    }
  });

  it("сохраняет подпись totalKg для партии", () => {
    const schema = z.object({ totalKg: z.number().positive() });
    try {
      schema.parse({ totalKg: 0 });
      expect.unreachable();
    } catch (e) {
      expect(zodErrorMessage(e as z.ZodError)).toMatch(/totalKg, кг/);
    }
  });
});
