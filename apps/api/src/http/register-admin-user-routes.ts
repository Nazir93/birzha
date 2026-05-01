import { randomUUID } from "node:crypto";

import { and, asc, eq } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import { globalRoleCodes, MVP_ROLE_CODES, type MvpRoleCode } from "../auth/global-roles.js";
import { hashPassword } from "../auth/password-scrypt.js";
import type { AuthRoleGrant } from "../auth/role-grant.js";
import type { DbClient } from "../db/client.js";
import * as schema from "../db/schema.js";

import { sendMappedError } from "./map-http-error.js";
import { type BusinessRouteAuth, withPreHandlers } from "./route-auth.js";

/** Как в `scripts/create-user.ts` — `db:push` не сидит INSERT из SQL. */
const ROLE_SEED: { code: string; name: string }[] = [
  { code: "admin", name: "Администратор" },
  { code: "manager", name: "Руководитель" },
  { code: "purchaser", name: "Закупщик" },
  { code: "warehouse", name: "Кладовщик" },
  { code: "logistics", name: "Логист" },
  { code: "receiver", name: "Приёмщик" },
  { code: "seller", name: "Продавец" },
  { code: "accountant", name: "Бухгалтер" },
];

const roleCodeSchema = z.string().refine((s): s is MvpRoleCode => (MVP_ROLE_CODES as readonly string[]).includes(s), {
  message: `roleCode: одно из ${MVP_ROLE_CODES.join(", ")}`,
});

const createUserBodySchema = z.object({
  login: z.string().min(1).max(128),
  password: z.string().min(10).max(256),
  roleCode: roleCodeSchema,
});

function jwtRoles(req: FastifyRequest): AuthRoleGrant[] {
  const u = req.user as { roles?: AuthRoleGrant[] };
  return u.roles ?? [];
}

function creatorMayAssignRole(creatorRoles: AuthRoleGrant[], targetRole: MvpRoleCode): boolean {
  const codes = new Set(globalRoleCodes({ roles: creatorRoles }));
  if (codes.has("admin")) {
    return true;
  }
  if (targetRole === "admin" || targetRole === "manager") {
    return false;
  }
  return codes.has("manager");
}

function jwtSub(req: FastifyRequest): string {
  return String((req.user as { sub?: string }).sub ?? "");
}

async function globalRolesForUser(db: DbClient, userId: string): Promise<string[]> {
  const rows = await db
    .select({ roleCode: schema.userRoles.roleCode })
    .from(schema.userRoles)
    .where(
      and(eq(schema.userRoles.userId, userId), eq(schema.userRoles.scopeType, "global"), eq(schema.userRoles.scopeId, "")),
    );
  return rows.map((r) => r.roleCode);
}

function actorIsAdmin(grants: AuthRoleGrant[]): boolean {
  return globalRoleCodes({ roles: grants }).includes("admin");
}

/** Руководитель не меняет и не удаляет учётки с глобальными ролями admin/manager (кроме смены **своего** пароля). */
function managerMayModifyOtherByTargetRoles(targetRoles: string[]): boolean {
  return !targetRoles.includes("admin") && !targetRoles.includes("manager");
}

async function countDistinctGlobalAdmins(db: DbClient): Promise<number> {
  const rows = await db
    .select({ userId: schema.userRoles.userId })
    .from(schema.userRoles)
    .where(
      and(eq(schema.userRoles.roleCode, "admin"), eq(schema.userRoles.scopeType, "global"), eq(schema.userRoles.scopeId, "")),
    );
  return new Set(rows.map((r) => r.userId)).size;
}

const passwordBodySchema = z.object({
  password: z.string().min(10).max(256),
});

export function registerAdminUserRoutes(app: FastifyInstance, db: DbClient, routeAuth: BusinessRouteAuth): void {
  app.get("/admin/users", { ...withPreHandlers(routeAuth.userManagement) }, async (_req, reply) => {
    try {
      const userRows = await db
        .select({
          id: schema.users.id,
          login: schema.users.login,
          isActive: schema.users.isActive,
        })
        .from(schema.users)
        .orderBy(asc(schema.users.login));

      const roleRows = await db
        .select({
          userId: schema.userRoles.userId,
          roleCode: schema.userRoles.roleCode,
        })
        .from(schema.userRoles)
        .where(and(eq(schema.userRoles.scopeType, "global"), eq(schema.userRoles.scopeId, "")));

      const rolesByUser = new Map<string, string[]>();
      for (const r of roleRows) {
        const list = rolesByUser.get(r.userId) ?? [];
        if (!list.includes(r.roleCode)) {
          list.push(r.roleCode);
        }
        rolesByUser.set(r.userId, list);
      }

      const users = userRows.map((u) => ({
        id: u.id,
        login: u.login,
        isActive: u.isActive,
        roleCodes: rolesByUser.get(u.id) ?? [],
      }));

      return reply.send({ users });
    } catch (error) {
      return sendMappedError(reply, error);
    }
  });

  app.post("/admin/users", { ...withPreHandlers(routeAuth.userManagement) }, async (req, reply) => {
    try {
      const body = createUserBodySchema.parse(req.body);
      const login = body.login.trim();
      if (!login) {
        return reply.code(400).send({ error: "invalid_login" });
      }

      if (!creatorMayAssignRole(jwtRoles(req), body.roleCode)) {
        return reply.code(403).send({ error: "forbidden_role_assignment" });
      }

      const existing = await db.select().from(schema.users).where(eq(schema.users.login, login)).limit(1);
      if (existing.length > 0) {
        return reply.code(409).send({ error: "user_exists" });
      }

      const id = randomUUID();

      await db.transaction(async (tx) => {
        await tx.insert(schema.roles).values(ROLE_SEED).onConflictDoNothing();

        await tx.insert(schema.users).values({
          id,
          login,
          passwordHash: hashPassword(body.password),
          isActive: true,
        });
        await tx.insert(schema.userRoles).values({
          userId: id,
          roleCode: body.roleCode,
          scopeType: "global",
          scopeId: "",
        });
      });

      return reply.code(201).send({
        user: { id, login, isActive: true, roleCodes: [body.roleCode] },
      });
    } catch (error) {
      return sendMappedError(reply, error);
    }
  });

  app.patch(
    "/admin/users/:userId/password",
    { ...withPreHandlers(routeAuth.userManagement) },
    async (req, reply) => {
      try {
        const params = z.object({ userId: z.string().min(1) }).parse(req.params);
        const body = passwordBodySchema.parse(req.body);
        const actorId = jwtSub(req);
        if (!actorId) {
          return reply.code(401).send({ error: "unauthorized" });
        }

        const target = await db.select().from(schema.users).where(eq(schema.users.id, params.userId)).limit(1);
        if (target.length === 0) {
          return reply.code(404).send({ error: "user_not_found" });
        }

        const targetRoles = await globalRolesForUser(db, params.userId);
        const grants = jwtRoles(req);

        if (params.userId !== actorId && !actorIsAdmin(grants) && !managerMayModifyOtherByTargetRoles(targetRoles)) {
          return reply.code(403).send({ error: "forbidden_user_management" });
        }

        await db
          .update(schema.users)
          .set({ passwordHash: hashPassword(body.password) })
          .where(eq(schema.users.id, params.userId));

        return reply.send({ ok: true });
      } catch (error) {
        return sendMappedError(reply, error);
      }
    },
  );

  app.delete("/admin/users/:userId", { ...withPreHandlers(routeAuth.userManagement) }, async (req, reply) => {
    try {
      const params = z.object({ userId: z.string().min(1) }).parse(req.params);
      const actorId = jwtSub(req);
      if (!actorId) {
        return reply.code(401).send({ error: "unauthorized" });
      }
      if (params.userId === actorId) {
        return reply.code(400).send({ error: "cannot_delete_self" });
      }

      const target = await db.select().from(schema.users).where(eq(schema.users.id, params.userId)).limit(1);
      if (target.length === 0) {
        return reply.code(404).send({ error: "user_not_found" });
      }

      const targetRoles = await globalRolesForUser(db, params.userId);
      const grants = jwtRoles(req);

      if (!actorIsAdmin(grants) && !managerMayModifyOtherByTargetRoles(targetRoles)) {
        return reply.code(403).send({ error: "forbidden_user_management" });
      }

      if (targetRoles.includes("admin")) {
        const admins = await countDistinctGlobalAdmins(db);
        if (admins <= 1) {
          return reply.code(409).send({ error: "cannot_remove_last_admin" });
        }
      }

      await db.delete(schema.users).where(eq(schema.users.id, params.userId));
      return reply.code(204).send();
    } catch (error) {
      return sendMappedError(reply, error);
    }
  });
}
