import { eq } from "drizzle-orm";

import { hashPassword } from "./auth/password-scrypt.js";
import type { DbClient } from "./db/client.js";
import * as schema from "./db/schema.js";

/** Пароль тестовых пользователей `e2e_accountant` / `e2e_warehouse` (можно переопределить `E2E_TEST_PASSWORD`). */
export const E2E_DEFAULT_TEST_PASSWORD = "E2e-birzha-test-99";

const E2E_USERS: { id: string; login: string; roleCode: string }[] = [
  { id: "e2e-user-accountant", login: "e2e_accountant", roleCode: "accountant" },
  { id: "e2e-user-warehouse", login: "e2e_warehouse", roleCode: "warehouse" },
];

/**
 * Идемпотентно: удаляет прежних e2e-пользователей и создаёт заново (CI / локальный Postgres).
 */
export async function seedE2eRoleUsers(db: DbClient, plainPassword = process.env.E2E_TEST_PASSWORD ?? E2E_DEFAULT_TEST_PASSWORD): Promise<void> {
  const passwordHash = hashPassword(plainPassword);
  for (const u of E2E_USERS) {
    await db.delete(schema.userRoles).where(eq(schema.userRoles.userId, u.id));
    await db.delete(schema.users).where(eq(schema.users.id, u.id));
  }
  for (const u of E2E_USERS) {
    await db.insert(schema.users).values({
      id: u.id,
      login: u.login,
      passwordHash,
      isActive: true,
    });
    await db.insert(schema.userRoles).values({
      userId: u.id,
      roleCode: u.roleCode,
      scopeType: "global",
      scopeId: "",
    });
  }
}
