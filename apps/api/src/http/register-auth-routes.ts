import cookie from "@fastify/cookie";
import fastifyJwt from "@fastify/jwt";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { loginBodySchema } from "@birzha/contracts";

import { AUTH_ACCESS_COOKIE_NAME } from "../auth/constants.js";
import type { AuthRoleGrant } from "../auth/role-grant.js";
import { verifyPassword } from "../auth/password-scrypt.js";
import type { AppEnv } from "../config.js";
import type { DbClient } from "../db/client.js";
import { findUserWithRolesByLogin, touchUserLastLogin } from "../infrastructure/persistence/drizzle-user-auth.repository.js";

function accessCookieOptions(env: AppEnv) {
  return {
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60,
  };
}

export async function registerAuthRoutes(app: FastifyInstance, opts: { db: DbClient; env: AppEnv }): Promise<void> {
  const { db, env } = opts;

  await app.register(cookie);
  await app.register(fastifyJwt, {
    secret: env.JWT_SECRET!,
    sign: { expiresIn: "7d" },
    cookie: { cookieName: AUTH_ACCESS_COOKIE_NAME, signed: false },
  });

  app.decorate("authenticate", async function (request: FastifyRequest, reply: FastifyReply) {
    try {
      await request.jwtVerify();
    } catch {
      return reply.code(401).send({ error: "unauthorized" });
    }
  });

  app.post("/auth/login", async (req, reply) => {
    const body = loginBodySchema.parse(req.body);
    const row = await findUserWithRolesByLogin(db, body.login);
    if (!row || !verifyPassword(body.password, row.passwordHash)) {
      return reply.code(401).send({ error: "invalid_credentials" });
    }
    if (!row.isActive) {
      return reply.code(403).send({ error: "account_disabled" });
    }
    await touchUserLastLogin(db, row.id);
    const payload = { sub: row.id, login: row.login, roles: row.roles };
    const token = await reply.jwtSign(payload);
    reply.setCookie(AUTH_ACCESS_COOKIE_NAME, token, accessCookieOptions(env));
    return reply.send({
      token,
      user: { id: row.id, login: row.login, roles: row.roles },
    });
  });

  app.post("/auth/logout", async (_req, reply) => {
    reply.clearCookie(AUTH_ACCESS_COOKIE_NAME, { path: "/" });
    return reply.send({ ok: true });
  });

  app.get("/auth/me", { onRequest: [app.authenticate] }, async (req: FastifyRequest) => {
    const u = req.user as { sub: string; login: string; roles: AuthRoleGrant[] };
    return {
      user: {
        id: u.sub,
        login: u.login,
        roles: u.roles,
      },
    };
  });
}
