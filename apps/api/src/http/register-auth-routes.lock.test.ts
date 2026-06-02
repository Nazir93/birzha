import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { hashPassword } from "../auth/password-scrypt.js";
import { registerAuthRoutes } from "./register-auth-routes.js";

const findUserWithRolesByLoginMock = vi.fn();
const touchUserLastLoginMock = vi.fn();

vi.mock("../infrastructure/persistence/drizzle-user-auth.repository.js", () => ({
  findUserWithRolesByLogin: (...args: unknown[]) => findUserWithRolesByLoginMock(...args),
  touchUserLastLogin: (...args: unknown[]) => touchUserLastLoginMock(...args),
}));

describe("registerAuthRoutes login lock", () => {
  beforeEach(() => {
    findUserWithRolesByLoginMock.mockReset();
    touchUserLastLoginMock.mockReset();
  });

  it("locks identity after repeated invalid credentials", async () => {
    findUserWithRolesByLoginMock.mockResolvedValue(null);
    const app = Fastify();
    await app.register(rateLimit, { global: false });
    await registerAuthRoutes(app, {
      db: {} as never,
      env: {
        NODE_ENV: "test",
        PORT: 3000,
        HOST: "0.0.0.0",
        DATABASE_URL: undefined,
        JWT_SECRET: "k".repeat(32),
        REQUIRE_API_AUTH: false,
      },
    });

    for (let i = 0; i < 4; i++) {
      const res = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { login: "lock-user", password: `bad-${i}` },
      });
      expect(res.statusCode).toBe(401);
    }

    const fifth = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { login: "lock-user", password: "bad-5" },
    });
    expect(fifth.statusCode).toBe(429);
    expect(fifth.json()).toEqual({ error: "too_many_attempts" });
    expect(fifth.headers["retry-after"]).toBeTruthy();

    const sixth = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { login: "lock-user", password: "bad-6" },
    });
    expect(sixth.statusCode).toBe(429);

    await app.close();
  });

  it("resets lock state after successful login", async () => {
    const password = "good-password";
    const passwordHash = hashPassword(password);
    findUserWithRolesByLoginMock.mockImplementation(async (_db: unknown, login: string) => {
      if (login === "reset-user") {
        return {
          id: "u-1",
          login: "reset-user",
          passwordHash,
          isActive: true,
          lastLoginAt: null,
          roles: [{ roleCode: "admin", scopeType: "global", scopeId: "" }],
        };
      }
      return null;
    });

    const app = Fastify();
    await app.register(rateLimit, { global: false });
    await registerAuthRoutes(app, {
      db: {} as never,
      env: {
        NODE_ENV: "test",
        PORT: 3000,
        HOST: "0.0.0.0",
        DATABASE_URL: undefined,
        JWT_SECRET: "k".repeat(32),
        REQUIRE_API_AUTH: false,
      },
    });

    for (let i = 0; i < 4; i++) {
      const bad = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { login: "reset-user", password: `bad-${i}` },
      });
      expect(bad.statusCode).toBe(401);
    }

    const ok = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { login: "reset-user", password },
    });
    expect(ok.statusCode).toBe(200);
    expect(touchUserLastLoginMock).toHaveBeenCalledWith(expect.anything(), "u-1");

    const badAfterSuccess = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { login: "reset-user", password: "bad-after-success" },
    });
    expect(badAfterSuccess.statusCode).toBe(401);

    await app.close();
  });
});
