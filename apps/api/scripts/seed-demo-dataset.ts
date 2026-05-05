/**
 * Заполняет PostgreSQL **демонстрационными** данными: закупочные накладные (несколько дат и складов),
 * рейсы, три продавца, отгрузки в рейс и продажи — чтобы в UI масштабно смотреть отчёты и формы.
 *
 * Условия:
 * - `DATABASE_URL` и `JWT_SECRET` в `apps/api/.env` (как для обычного API).
 * - Схема применена: `pnpm db:push`.
 * - Желательно чистые хозяйственные таблицы: **`pnpm db:reset-test-data`** (пользователей не трогает).
 *
 * Повторный запуск: если уже есть накладная с номером, начинающимся с **`DEMO-`**, скрипт завершится с кодом 2.
 *
 *   cd apps/api
 *   pnpm db:seed-demo
 *
 * Пароль учёток `demo-seed-seller-1..3`: переменная **`BIRZHA_DEMO_SEED_PASSWORD`** (≥10 символов)
 * или значение по умолчанию в коде (см. `DEMO_SELLER_PASSWORD`).
 *
 * Внутри временно отключается проверка JWT на HTTP (`REQUIRE_API_AUTH=false` только для этого процесса).
 */
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { eq } from "drizzle-orm";
import dotenv from "dotenv";
import {
  numberToDecimalStringForKopecks,
  purchaseLineAmountKopecksFromDecimalStrings,
} from "@birzha/contracts";

import { hashPassword } from "../src/auth/password-scrypt.js";
import { loadEnv } from "../src/config.js";
import { createDb } from "../src/db/client.js";
import * as schema from "../src/db/schema.js";
import { buildApp } from "../src/app.js";
import type { FastifyInstance } from "fastify";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const DEMO_DOC_PREFIX = "DEMO-";

/** Дефолт только для локальной демо-БД; в проде задайте BIRZHA_DEMO_SEED_PASSWORD. */
const DEMO_SELLER_PASSWORD = process.env.BIRZHA_DEMO_SEED_PASSWORD ?? "DemoSeed2026!!";

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

function lineKop(kg: number, rubPerKg: number): number {
  return purchaseLineAmountKopecksFromDecimalStrings(
    numberToDecimalStringForKopecks(kg, 6),
    numberToDecimalStringForKopecks(rubPerKg, 4),
  );
}

async function ensureSeller(db: ReturnType<typeof createDb>["db"], login: string, password: string): Promise<string> {
  const rows = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.login, login));
  if (rows[0]) {
    console.log(`  продавец уже есть: ${login} (${rows[0].id})`);
    return rows[0].id;
  }
  const id = randomUUID();
  await db.insert(schema.users).values({
    id,
    login,
    passwordHash: hashPassword(password),
    isActive: true,
  });
  await db.insert(schema.userRoles).values({
    userId: id,
    roleCode: "seller",
    scopeType: "global",
    scopeId: "",
  });
  console.log(`  создан продавец: ${login} (${id})`);
  return id;
}

async function injectJson<T>(app: FastifyInstance, label: string, method: string, url: string, payload?: unknown): Promise<T> {
  const res = await app.inject({ method, url, payload });
  if (res.statusCode >= 400) {
    console.error(`${label} ${method} ${url} → ${res.statusCode}`, res.body);
    throw new Error(`${label}: HTTP ${res.statusCode}`);
  }
  return JSON.parse(res.body) as T;
}

if (!process.env.DATABASE_URL) {
  console.error("Нет DATABASE_URL в apps/api/.env");
  process.exit(1);
}
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error("Нужен JWT_SECRET не короче 32 символов (как для API).");
  process.exit(1);
}
if (DEMO_SELLER_PASSWORD.length < 10) {
  console.error("BIRZHA_DEMO_SEED_PASSWORD должен быть не короче 10 символов.");
  process.exit(1);
}

const { db, sql } = createDb(process.env.DATABASE_URL);

try {
  await db.insert(schema.roles).values(ROLE_SEED).onConflictDoNothing();

  const listRes = await db.select({ n: schema.purchaseDocuments.documentNumber }).from(schema.purchaseDocuments);
  const hasDemo = listRes.some((r) => String(r.n ?? "").startsWith(DEMO_DOC_PREFIX));
  if (hasDemo) {
    console.error(
      `В базе уже есть накладные с номером ${DEMO_DOC_PREFIX}…. Сначала выполните: pnpm db:reset-test-data`,
    );
    process.exit(2);
  }

  console.log("Создание продавцов demo-seed-seller-1..3 …");
  const seller1 = await ensureSeller(db, "demo-seed-seller-1", DEMO_SELLER_PASSWORD);
  const seller2 = await ensureSeller(db, "demo-seed-seller-2", DEMO_SELLER_PASSWORD);
  const seller3 = await ensureSeller(db, "demo-seed-seller-3", DEMO_SELLER_PASSWORD);

  const env = loadEnv({
    DATABASE_URL: process.env.DATABASE_URL,
    JWT_SECRET: process.env.JWT_SECRET,
    NODE_ENV: "development",
    REQUIRE_API_AUTH: "false",
  });

  const app = await buildApp({ env, db });

  console.log("Накладные ДЕМО …");
  await injectJson(app, "nakl-A", "POST", "/purchase-documents", {
    id: "demo-pd-manas-a",
    documentNumber: `${DEMO_DOC_PREFIX}NKL-Манас-01`,
    docDate: "2026-01-15",
    warehouseId: "wh-manas",
    supplierName: "ООО Поставщик Альфа",
    extraCostKopecks: 15_000,
    lines: [
      {
        productGradeId: "pg-n5",
        totalKg: 2200,
        packageCount: 440,
        pricePerKg: 48,
        lineTotalKopecks: lineKop(2200, 48),
      },
      {
        productGradeId: "pg-n6",
        totalKg: 1400,
        pricePerKg: 46,
        lineTotalKopecks: lineKop(1400, 46),
      },
    ],
  });

  await injectJson(app, "nakl-B", "POST", "/purchase-documents", {
    id: "demo-pd-kayakent-b",
    documentNumber: `${DEMO_DOC_PREFIX}NKL-Каякент-02`,
    docDate: "2026-02-03",
    warehouseId: "wh-kayakent",
    supplierName: "ИП Бета",
    lines: [
      {
        productGradeId: "pg-n7",
        totalKg: 3200,
        packageCount: 640,
        pricePerKg: 52,
        lineTotalKopecks: lineKop(3200, 52),
      },
    ],
  });

  await injectJson(app, "nakl-C", "POST", "/purchase-documents", {
    id: "demo-pd-manas-c",
    documentNumber: `${DEMO_DOC_PREFIX}NKL-Манас-03`,
    docDate: "2026-03-12",
    warehouseId: "wh-manas",
    supplierName: "ООО Гамма",
    lines: [
      {
        productGradeId: "pg-n8",
        totalKg: 1800,
        pricePerKg: 54,
        lineTotalKopecks: lineKop(1800, 54),
      },
      {
        productGradeId: "pg-nsm",
        totalKg: 550,
        packageCount: 110,
        pricePerKg: 38,
        lineTotalKopecks: lineKop(550, 38),
      },
    ],
  });

  type DocLine = { batchId: string; lineNo: number; productGradeCode: string };
  const detailA = await injectJson<{ lines: DocLine[] }>(app, "get A", "GET", "/purchase-documents/demo-pd-manas-a");
  const detailB = await injectJson<{ lines: DocLine[] }>(app, "get B", "GET", "/purchase-documents/demo-pd-kayakent-b");
  const detailC = await injectJson<{ lines: DocLine[] }>(app, "get C", "GET", "/purchase-documents/demo-pd-manas-c");

  const batchA_n5 = detailA.lines.find((l) => l.productGradeCode === "№5")!.batchId;
  const batchA_n6 = detailA.lines.find((l) => l.productGradeCode === "№6")!.batchId;
  const batchB_n7 = detailB.lines[0]!.batchId;
  const batchC_n8 = detailC.lines.find((l) => l.productGradeCode === "№8")!.batchId;
  const batchC_ns = detailC.lines.find((l) => l.productGradeCode === "НС-")!.batchId;

  console.log("Рейсы ДЕМО …");
  await injectJson(app, "trip1", "POST", "/trips", {
    id: "demo-trip-r101",
    tripNumber: "Р-101",
    vehicleLabel: "Манас → Махачкала",
    driverName: "Иванов",
    departedAt: "2026-01-20T06:00:00.000Z",
  });
  await injectJson(app, "trip2", "POST", "/trips", {
    id: "demo-trip-r102",
    tripNumber: "Р-102",
    vehicleLabel: "Каякент → Хасавюрт",
    driverName: "Петров",
    departedAt: "2026-02-08T07:30:00.000Z",
  });
  await injectJson(app, "trip3", "POST", "/trips", {
    id: "demo-trip-r103",
    tripNumber: "Р-103",
    vehicleLabel: "Манас → излишки",
    departedAt: "2026-03-18T05:00:00.000Z",
  });

  console.log("Отгрузка в рейсы …");
  await injectJson(app, "ship A n5→r101", "POST", `/batches/${encodeURIComponent(batchA_n5)}/ship-to-trip`, {
    tripId: "demo-trip-r101",
    kg: 1600,
    packageCount: 320,
  });
  await injectJson(app, "ship A n6→r102", "POST", `/batches/${encodeURIComponent(batchA_n6)}/ship-to-trip`, {
    tripId: "demo-trip-r102",
    kg: 900,
  });
  await injectJson(app, "ship B→r102", "POST", `/batches/${encodeURIComponent(batchB_n7)}/ship-to-trip`, {
    tripId: "demo-trip-r102",
    kg: 2400,
    packageCount: 480,
  });
  await injectJson(app, "ship C n8→r103", "POST", `/batches/${encodeURIComponent(batchC_n8)}/ship-to-trip`, {
    tripId: "demo-trip-r103",
    kg: 1200,
  });
  await injectJson(app, "ship C ns→r103", "POST", `/batches/${encodeURIComponent(batchC_ns)}/ship-to-trip`, {
    tripId: "demo-trip-r103",
    kg: 400,
  });

  console.log("Закрепление продавцов …");
  await injectJson(app, "assign r101", "POST", "/trips/demo-trip-r101/assign-seller", { sellerUserId: seller1 });
  await injectJson(app, "assign r102", "POST", "/trips/demo-trip-r102/assign-seller", { sellerUserId: seller2 });
  await injectJson(app, "assign r103", "POST", "/trips/demo-trip-r103/assign-seller", { sellerUserId: seller3 });

  console.log("Продажи с рейса …");
  await injectJson(app, "sell r101", "POST", `/batches/${encodeURIComponent(batchA_n5)}/sell-from-trip`, {
    tripId: "demo-trip-r101",
    kg: 550,
    saleId: "demo-sale-r101-1",
    pricePerKg: 72,
    paymentKind: "cash",
    clientLabel: "Розница рынок №1",
  });
  await injectJson(app, "sell r102 debt", "POST", `/batches/${encodeURIComponent(batchB_n7)}/sell-from-trip`, {
    tripId: "demo-trip-r102",
    kg: 1100,
    saleId: "demo-sale-r102-1",
    pricePerKg: 68,
    paymentKind: "debt",
    clientLabel: "Опт ТД Восток",
  });
  const mixedRevenueKop = BigInt(lineKop(700, 65));
  const cashPart = mixedRevenueKop / 2n;
  await injectJson(app, "sell r103 mixed", "POST", `/batches/${encodeURIComponent(batchC_n8)}/sell-from-trip`, {
    tripId: "demo-trip-r103",
    kg: 700,
    saleId: "demo-sale-r103-1",
    pricePerKg: 65,
    paymentKind: "mixed",
    cashKopecksMixed: cashPart.toString(),
    clientLabel: "Смешанная оплата",
  });

  await injectJson(app, "shortage r102", "POST", `/batches/${encodeURIComponent(batchA_n6)}/record-trip-shortage`, {
    tripId: "demo-trip-r102",
    kg: 25,
    reason: "Демо: недостача при приёмке",
  });

  await app.close();

  console.log("");
  console.log("Готово. Войдите в UI под админом или создайте логиста — смотрите накладные, рейсы, Отгрузку и Продажи.");
  console.log(`Продавцы: demo-seed-seller-1 / demo-seed-seller-2 / demo-seed-seller-3 — пароль из BIRZHA_DEMO_SEED_PASSWORD (или дефолт скрипта).`);
} finally {
  await sql.end({ timeout: 5 });
}
