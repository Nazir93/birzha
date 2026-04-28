import { and, asc, eq } from "drizzle-orm";

import type { AuthRoleGrant } from "../../auth/role-grant.js";
import type { DbClient } from "../../db/client.js";
import { userRoles, users } from "../../db/schema.js";

export type UserWithRolesRow = {
  id: string;
  login: string;
  passwordHash: string;
  isActive: boolean;
  lastLoginAt: Date | null;
  roles: AuthRoleGrant[];
};

export async function findUserWithRolesByLogin(db: DbClient, login: string): Promise<UserWithRolesRow | null> {
  const found = await db.select().from(users).where(eq(users.login, login)).limit(1);
  const u = found[0];
  if (!u) {
    return null;
  }
  const r = await db.select().from(userRoles).where(eq(userRoles.userId, u.id));
  return {
    id: u.id,
    login: u.login,
    passwordHash: u.passwordHash,
    isActive: u.isActive,
    lastLoginAt: u.lastLoginAt,
    roles: r.map((row) => ({
      roleCode: row.roleCode,
      scopeType: row.scopeType,
      scopeId: row.scopeId,
    })),
  };
}

export async function touchUserLastLogin(db: DbClient, userId: string): Promise<void> {
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId));
}

/** Пользователи с глобальной ролью `seller` (активные) — для назначения на рейс в UI. */
export type FieldSellerOptionRow = { id: string; login: string };

export async function listGlobalSellerUsers(db: DbClient): Promise<FieldSellerOptionRow[]> {
  const rows = await db
    .select({ id: users.id, login: users.login })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(
      and(
        eq(users.isActive, true),
        eq(userRoles.roleCode, "seller"),
        eq(userRoles.scopeType, "global"),
        eq(userRoles.scopeId, ""),
      ),
    )
    .orderBy(asc(users.login));

  const seen = new Set<string>();
  const out: FieldSellerOptionRow[] = [];
  for (const r of rows) {
    if (!seen.has(r.id)) {
      seen.add(r.id);
      out.push(r);
    }
  }
  return out;
}
