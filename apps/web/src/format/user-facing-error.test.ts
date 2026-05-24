import { describe, expect, it } from "vitest";

import { humanizeErrorMessage } from "./user-facing-error.js";

describe("humanizeErrorMessage", () => {
  it("парсит JSON message из API", () => {
    expect(humanizeErrorMessage(new Error('{"message":"Выберите оптовика из списка"}'))).toBe(
      "Выберите оптовика из списка",
    );
  });

  it("убирает префикс URL", () => {
    expect(humanizeErrorMessage(new Error("/api/batches/x/sell-from-trip: Не больше 5 ящ."))).toBe(
      "Не больше 5 ящ.",
    );
  });

  it("сеть", () => {
    expect(humanizeErrorMessage(new Error("Failed to fetch"))).toMatch(/связи с сервером/i);
  });
});
