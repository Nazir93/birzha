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

  it("переводит сырой код batch_not_found", () => {
    expect(humanizeErrorMessage(new Error("batch_not_found"))).toBe("Партия не найдена.");
  });

  it("поясняет конфликт кода калибра", () => {
    expect(humanizeErrorMessage(new Error('{"error":"product_grade_code_conflict","code":"Ом."}'))).toMatch(
      /уже есть/i,
    );
    expect(humanizeErrorMessage(new Error("product_grade_code_conflict"))).toMatch(/уже есть/i);
  });

  it("поясняет блокировку входа", () => {
    expect(humanizeErrorMessage(new Error('{"error":"too_many_attempts"}'))).toMatch(/15 минут/i);
    expect(humanizeErrorMessage(new Error("invalid_credentials"))).toMatch(/логин или пароль/i);
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
