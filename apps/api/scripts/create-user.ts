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

function parseArgs(argv: string[]): { login: string; password: string; role: string } {
  let login = "";
  let password = "";
  let role = "admin";
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--login" && argv[i + 1]) {
      login = argv[++i] ?? "";
    } else if (a === "--password" && argv[i + 1]) {
      password = argv[++i] ?? "";
    } else if (a === "--role" && argv[i + 1]) {
      role = argv[++i] ?? "admin";
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
  const existing = await db.select().from(schema.users).where(eq(schema.users.login, login.trim()));
  if (existing.length > 0) {
    console.error(`Пользователь с логином "${login}" уже есть. Выберите другой --login.`);
    process.exit(1);
  }

  const id = randomUUID();
  await db.insert(schema.users).values({
    id,
    login: login.trim(),
    passwordHash: hashPassword(password),
    isActive: true,
  });
  await db.insert(schema.userRoles).values({
    userId: id,
    roleCode: role,
    scopeType: "global",
    scopeId: "",
  });

  console.log(`Создан пользователь: login=${login.trim()}, role=${role}, id=${id}`);
} finally {
  await sql.end({ timeout: 5 });
}
