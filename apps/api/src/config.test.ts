import { describe, expect, it } from "vitest";

import { loadEnv } from "./config.js";

describe("loadEnv / REQUIRE_API_AUTH", () => {
  it("production + DATABASE_URL + JWT_SECRET без явной переменной → обязательный вход", () => {
    const env = loadEnv({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://u:p@127.0.0.1:5432/b",
      JWT_SECRET: "x".repeat(32),
      REQUIRE_API_AUTH: undefined,
    });
    expect(env.REQUIRE_API_AUTH).toBe(true);
  });

  it("production явно false → вход не обязателен", () => {
    const env = loadEnv({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://u:p@127.0.0.1:5432/b",
      JWT_SECRET: "x".repeat(32),
      REQUIRE_API_AUTH: "false",
    });
    expect(env.REQUIRE_API_AUTH).toBe(false);
  });

  it("development с БД без переменной → по умолчанию без обязательного входа", () => {
    const env = loadEnv({
      NODE_ENV: "development",
      DATABASE_URL: "postgresql://u:p@127.0.0.1:5432/b",
      JWT_SECRET: "x".repeat(32),
      REQUIRE_API_AUTH: undefined,
    });
    expect(env.REQUIRE_API_AUTH).toBe(false);
  });
});
