import { describe, expect, it } from "vitest";

import { humanizeErrorMessage, isLoadingManifestNotFoundError } from "./user-facing-error.js";

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

describe("isLoadingManifestNotFoundError", () => {
  it("распознаёт код loading_manifest_not_found", () => {
    expect(isLoadingManifestNotFoundError(new Error("loading_manifest_not_found"))).toBe(true);
  });

  it("не путает с другими ошибками", () => {
    expect(isLoadingManifestNotFoundError(new Error("Network error"))).toBe(false);
  });
});
