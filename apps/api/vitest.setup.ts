/**
 * Сброс переменных из `source apps/api/.env` на VPS: иначе in-memory HTTP-тесты падают
 * (REQUIRE_API_AUTH=true + DATABASE_URL: undefined в overrides → ошибка loadEnv).
 */
delete process.env.REQUIRE_API_AUTH;
if (!process.env.TEST_DATABASE_URL) {
  delete process.env.DATABASE_URL;
  delete process.env.JWT_SECRET;
}
if (!process.env.NODE_ENV || process.env.NODE_ENV === "production") {
  process.env.NODE_ENV = "test";
}
