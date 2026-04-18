/**
 * Создание пользователя и глобальной роли в PostgreSQL (одноразово на сервере / локально).
 * Запуск из каталога apps/api при заполненном .env (DATABASE_URL).
 *
 *   pnpm exec tsx scripts/create-user.ts --login admin --password 'ВашПароль' --role admin
 */
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { eq } from "drizzle-orm";
import dotenv from "dotenv";

import { hashPassword } from "../src/auth/password-scrypt.js";
import { createDb } from "../src/db/client.js";
import * as schema from "../src/db/schema.js";

const ROLE_CODES = [
  "admin",
  "manager",
  "purchaser",
  "warehouse",
  "logistics",
  "receiver",
  "seller",
  "accountant",
] as const;

/** Как в `drizzle/0009_users_roles.sql` — `db:push` не выполняет INSERT из миграций. */
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

/** Аргументы после `node` / `tsx` и пути к скрипту; `pnpm … --` даёт лишний `--`. */
function parseArgs(argv: string[]): { login: string; password: string; role: string } {
  let login = "";
  let password = "";
  let role = "admin";
  const args = argv.slice(2).filter((a) => a !== "--");
  let i = 0;
  if (args[0]?.endsWith(".ts") || args[0]?.includes("create-user")) {
    i = 1;
  }
  for (; i < args.length; i++) {
    const a = args[i];
    if (a === "--login" && args[i + 1]) {
      login = args[++i] ?? "";
    } else if (a === "--password" && args[i + 1]) {
      password = args[++i] ?? "";
    } else if (a === "--role" && args[i + 1]) {
      role = args[++i] ?? "admin";
    }
  }
  return { login, password, role };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const { login, password, role } = parseArgs(process.argv);

if (!process.env.DATABASE_URL) {
  console.error("Нет DATABASE_URL в apps/api/.env");
  process.exit(1);
}

if (!login.trim() || !password) {
  console.error(
    "Использование: pnpm exec tsx scripts/create-user.ts --login ЛОГИН --password ПАРОЛЬ [--role admin|manager|...]",
  );
  process.exit(1);
}

if (!ROLE_CODES.includes(role as (typeof ROLE_CODES)[number])) {
  console.error(`Неизвестная роль: ${role}. Допустимо: ${ROLE_CODES.join(", ")}`);
  process.exit(1);
}

const { db, sql } = createDb(process.env.DATABASE_URL);

try {
  await db.transaction(async (tx) => {
    await tx.insert(schema.roles).values(ROLE_SEED).onConflictDoNothing();

    const existing = await tx.select().from(schema.users).where(eq(schema.users.login, login.trim()));
    if (existing.length > 0) {
      throw new Error(`USER_EXISTS:${login.trim()}`);
    }

    const id = randomUUID();
    await tx.insert(schema.users).values({
      id,
      login: login.trim(),
      passwordHash: hashPassword(password),
      isActive: true,
    });
    await tx.insert(schema.userRoles).values({
      userId: id,
      roleCode: role,
      scopeType: "global",
      scopeId: "",
    });

    console.log(`Создан пользователь: login=${login.trim()}, role=${role}, id=${id}`);
  });
} catch (e) {
  const msg = e instanceof Error ? e.message : "";
  if (msg.startsWith("USER_EXISTS:")) {
    const l = msg.slice("USER_EXISTS:".length);
    console.error(`Пользователь с логином "${l}" уже есть. Выберите другой --login.`);
    process.exit(1);
  }
  const err = e as { code?: string };
  if (err.code === "42P01") {
    console.error(
      'Нет таблицы в БД (схема не применена). Выполните из каталога apps/api: pnpm db:push — затем снова create-user.',
    );
    process.exit(1);
  }
  throw e;
} finally {
  await sql.end({ timeout: 5 });
}
