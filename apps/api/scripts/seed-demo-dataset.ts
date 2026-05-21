/**
 * Заполняет PostgreSQL **демонстрационными** данными: много закупочных накладных (2 склада),
 * рейсы, отгрузки с ящиками, продажи — для проверки UI продавца, архива и отчётов.
 *
 * Условия:
 * - `DATABASE_URL` и `JWT_SECRET` в `apps/api/.env`
 * - Схема: `pnpm db:push`
 * - Чистая БД: **`pnpm db:reset-test-data`**
 *
 *   cd apps/api
 *   BIRZHA_DEMO_SEED_PASSWORD='ВашПароль10+' pnpm db:seed-demo
 *
 * Повторный запуск при наличии `DEMO-*` накладных — ошибка (сначала reset).
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

const DEMO_SELLER_PASSWORD = process.env.BIRZHA_DEMO_SEED_PASSWORD ?? "DemoSeed2026!!";

const WH_MANAS = "wh-manas";
const WH_KAYAKENT = "wh-kayakent";

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

type DocLineSeed = {
  productGradeId: string;
  totalKg: number;
  pricePerKg: number;
  packageCount?: number;
};

type DocSeed = {
  id: string;
  documentNumber: string;
  docDate: string;
  warehouseId: string;
  supplierName: string;
  extraCostKopecks?: number;
  lines: DocLineSeed[];
};

type TripSeed = {
  id: string;
  tripNumber: string;
  vehicleLabel: string;
  driverName?: string;
  departedAt: string;
  sellerLogin?: "demo-seed-seller-1" | "demo-seed-seller-2" | "demo-seed-seller-3";
};

type ShipSeed = {
  docId: string;
  gradeCode: string;
  tripId: string;
  kg: number;
  packageCount?: number;
};

type SaleSeed = {
  docId: string;
  gradeCode: string;
  tripId: string;
  saleId: string;
  kg: number;
  pricePerKg: number;
  packageCount?: number;
  paymentKind?: "cash" | "debt" | "mixed" | "card_transfer";
  saleChannel?: "retail" | "wholesale";
  clientLabel: string;
  cashKopecksMixed?: string;
  cardTransferKopecks?: string;
};

const DOCUMENTS: DocSeed[] = [
  {
    id: "demo-pd-manas-01",
    documentNumber: `${DEMO_DOC_PREFIX}NKL-Манас-01`,
    docDate: "2026-01-10",
    warehouseId: WH_MANAS,
    supplierName: "ООО Поставщик Альфа",
    extraCostKopecks: 12_000,
    lines: [
      { productGradeId: "pg-n5", totalKg: 2400, packageCount: 480, pricePerKg: 47 },
      { productGradeId: "pg-n6", totalKg: 1600, pricePerKg: 45 },
    ],
  },
  {
    id: "demo-pd-manas-02",
    documentNumber: `${DEMO_DOC_PREFIX}NKL-Манас-02`,
    docDate: "2026-01-22",
    warehouseId: WH_MANAS,
    supplierName: "ИП Север",
    lines: [
      { productGradeId: "pg-n7", totalKg: 2000, packageCount: 400, pricePerKg: 51 },
      { productGradeId: "pg-n8", totalKg: 1200, pricePerKg: 53 },
    ],
  },
  {
    id: "demo-pd-manas-03",
    documentNumber: `${DEMO_DOC_PREFIX}NKL-Манас-03`,
    docDate: "2026-02-05",
    warehouseId: WH_MANAS,
    supplierName: "ООО Гамма",
    lines: [
      { productGradeId: "pg-nsm", totalKg: 800, packageCount: 160, pricePerKg: 39 },
      { productGradeId: "pg-nsp", totalKg: 600, pricePerKg: 41 },
    ],
  },
  {
    id: "demo-pd-manas-04",
    documentNumber: `${DEMO_DOC_PREFIX}NKL-Манас-04`,
    docDate: "2026-02-18",
    warehouseId: WH_MANAS,
    supplierName: "ТД Юг",
    lines: [
      { productGradeId: "pg-n5", totalKg: 1800, packageCount: 360, pricePerKg: 48 },
      { productGradeId: "pg-om", totalKg: 400, pricePerKg: 35 },
    ],
  },
  {
    id: "demo-pd-manas-05",
    documentNumber: `${DEMO_DOC_PREFIX}NKL-Манас-05`,
    docDate: "2026-03-01",
    warehouseId: WH_MANAS,
    supplierName: "Агро-Манас",
    lines: [
      { productGradeId: "pg-n6", totalKg: 2200, packageCount: 440, pricePerKg: 46 },
      { productGradeId: "pg-n7", totalKg: 900, pricePerKg: 50 },
    ],
  },
  {
    id: "demo-pd-kayakent-01",
    documentNumber: `${DEMO_DOC_PREFIX}NKL-Каякент-01`,
    docDate: "2026-01-14",
    warehouseId: WH_KAYAKENT,
    supplierName: "ИП Бета",
    lines: [
      { productGradeId: "pg-n7", totalKg: 3500, packageCount: 700, pricePerKg: 52 },
      { productGradeId: "pg-n8", totalKg: 1400, pricePerKg: 54 },
    ],
  },
  {
    id: "demo-pd-kayakent-02",
    documentNumber: `${DEMO_DOC_PREFIX}NKL-Каякент-02`,
    docDate: "2026-01-28",
    warehouseId: WH_KAYAKENT,
    supplierName: "ООО Каякент-Фуд",
    extraCostKopecks: 8_500,
    lines: [
      { productGradeId: "pg-n5", totalKg: 2800, packageCount: 560, pricePerKg: 49 },
      { productGradeId: "pg-n6", totalKg: 1100, pricePerKg: 47 },
    ],
  },
  {
    id: "demo-pd-kayakent-03",
    documentNumber: `${DEMO_DOC_PREFIX}NKL-Каякент-03`,
    docDate: "2026-02-12",
    warehouseId: WH_KAYAKENT,
    supplierName: "Хасавюрт Опт",
    lines: [
      { productGradeId: "pg-nsm", totalKg: 950, packageCount: 190, pricePerKg: 40 },
      { productGradeId: "pg-nsp", totalKg: 700, pricePerKg: 42 },
    ],
  },
  {
    id: "demo-pd-kayakent-04",
    documentNumber: `${DEMO_DOC_PREFIX}NKL-Каякент-04`,
    docDate: "2026-02-25",
    warehouseId: WH_KAYAKENT,
    supplierName: "ИП Восток",
    lines: [
      { productGradeId: "pg-n8", totalKg: 2600, packageCount: 520, pricePerKg: 55 },
      { productGradeId: "pg-om", totalKg: 500, pricePerKg: 36 },
    ],
  },
  {
    id: "demo-pd-kayakent-05",
    documentNumber: `${DEMO_DOC_PREFIX}NKL-Каякент-05`,
    docDate: "2026-03-08",
    warehouseId: WH_KAYAKENT,
    supplierName: "Теплица-2",
    lines: [
      { productGradeId: "pg-n5", totalKg: 1500, packageCount: 300, pricePerKg: 50 },
      { productGradeId: "pg-n7", totalKg: 2000, packageCount: 400, pricePerKg: 53 },
      { productGradeId: "pg-n6", totalKg: 800, pricePerKg: 48 },
    ],
  },
];

function lineKop(kg: number, rubPerKg: number): number {
  return purchaseLineAmountKopecksFromDecimalStrings(
    numberToDecimalStringForKopecks(kg, 6),
    numberToDecimalStringForKopecks(rubPerKg, 4),
  );
}

const TRIPS: TripSeed[] = [
  {
    id: "demo-trip-r101",
    tripNumber: "Р-101",
    vehicleLabel: "Манас → Махачкала",
    driverName: "Иванов",
    departedAt: "2026-01-20T06:00:00.000Z",
    sellerLogin: "demo-seed-seller-1",
  },
  {
    id: "demo-trip-r102",
    tripNumber: "Р-102",
    vehicleLabel: "Каякент → Хасавюрт",
    driverName: "Петров",
    departedAt: "2026-02-08T07:30:00.000Z",
    sellerLogin: "demo-seed-seller-2",
  },
  {
    id: "demo-trip-r103",
    tripNumber: "Р-103",
    vehicleLabel: "Манас → Дербент",
    driverName: "Сидоров",
    departedAt: "2026-02-20T05:00:00.000Z",
    sellerLogin: "demo-seed-seller-1",
  },
  {
    id: "demo-trip-r104",
    tripNumber: "Р-104",
    vehicleLabel: "Каякент → Кизляр",
    driverName: "Алиев",
    departedAt: "2026-03-02T06:15:00.000Z",
    sellerLogin: "demo-seed-seller-3",
  },
  {
    id: "demo-trip-r105",
    tripNumber: "Р-105",
    vehicleLabel: "Смешанный Манас+Каякент",
    driverName: "Магомедов",
    departedAt: "2026-03-15T04:30:00.000Z",
    sellerLogin: "demo-seed-seller-2",
  },
  {
    id: "demo-trip-r106",
    tripNumber: "Р-106",
    vehicleLabel: "Резерв / тест ящиков",
    departedAt: "2026-03-20T08:00:00.000Z",
    sellerLogin: "demo-seed-seller-3",
  },
];

const SHIPMENTS: ShipSeed[] = [
  { docId: "demo-pd-manas-01", gradeCode: "№5", tripId: "demo-trip-r101", kg: 1800, packageCount: 360 },
  { docId: "demo-pd-manas-01", gradeCode: "№6", tripId: "demo-trip-r101", kg: 600 },
  { docId: "demo-pd-manas-02", gradeCode: "№7", tripId: "demo-trip-r103", kg: 1500, packageCount: 300 },
  { docId: "demo-pd-manas-03", gradeCode: "НС-", tripId: "demo-trip-r103", kg: 500, packageCount: 100 },
  { docId: "demo-pd-manas-04", gradeCode: "№5", tripId: "demo-trip-r105", kg: 1200, packageCount: 240 },
  { docId: "demo-pd-manas-05", gradeCode: "№6", tripId: "demo-trip-r105", kg: 1400, packageCount: 280 },
  { docId: "demo-pd-kayakent-01", gradeCode: "№7", tripId: "demo-trip-r102", kg: 2600, packageCount: 520 },
  { docId: "demo-pd-kayakent-01", gradeCode: "№8", tripId: "demo-trip-r102", kg: 800 },
  { docId: "demo-pd-kayakent-02", gradeCode: "№5", tripId: "demo-trip-r104", kg: 2000, packageCount: 400 },
  { docId: "demo-pd-kayakent-03", gradeCode: "НС-", tripId: "demo-trip-r104", kg: 600, packageCount: 120 },
  { docId: "demo-pd-kayakent-04", gradeCode: "№8", tripId: "demo-trip-r106", kg: 1800, packageCount: 360 },
  { docId: "demo-pd-kayakent-05", gradeCode: "№7", tripId: "demo-trip-r106", kg: 1600, packageCount: 320 },
  { docId: "demo-pd-kayakent-05", gradeCode: "№5", tripId: "demo-trip-r105", kg: 900, packageCount: 180 },
];

const SALES: SaleSeed[] = [
  {
    docId: "demo-pd-manas-01",
    gradeCode: "№5",
    tripId: "demo-trip-r101",
    saleId: "demo-sale-r101-1",
    kg: 420,
    packageCount: 84,
    pricePerKg: 72,
    paymentKind: "cash",
    clientLabel: "Розница рынок №1",
  },
  {
    docId: "demo-pd-manas-01",
    gradeCode: "№5",
    tripId: "demo-trip-r101",
    saleId: "demo-sale-r101-2",
    kg: 280,
    packageCount: 56,
    pricePerKg: 70,
    paymentKind: "debt",
    clientLabel: "Опт Махачкала",
  },
  {
    docId: "demo-pd-kayakent-01",
    gradeCode: "№7",
    tripId: "demo-trip-r102",
    saleId: "demo-sale-r102-1",
    kg: 900,
    packageCount: 180,
    pricePerKg: 68,
    paymentKind: "debt",
    clientLabel: "ТД Восток",
  },
  {
    docId: "demo-pd-kayakent-02",
    gradeCode: "№5",
    tripId: "demo-trip-r104",
    saleId: "demo-sale-r104-1",
    kg: 550,
    packageCount: 110,
    pricePerKg: 74,
    paymentKind: "cash",
    clientLabel: "Рынок Кизляр",
  },
  {
    docId: "demo-pd-manas-02",
    gradeCode: "№7",
    tripId: "demo-trip-r103",
    saleId: "demo-sale-r103-1",
    kg: 400,
    packageCount: 80,
    pricePerKg: 66,
    paymentKind: "card_transfer",
    cardTransferKopecks: String(lineKop(400, 66) / 2n),
    clientLabel: "Перевод + нал",
  },
  {
    docId: "demo-pd-kayakent-04",
    gradeCode: "№8",
    tripId: "demo-trip-r106",
    saleId: "demo-sale-r106-1",
    kg: 350,
    packageCount: 70,
    pricePerKg: 71,
    paymentKind: "mixed",
    cashKopecksMixed: String(lineKop(350, 71) / 2n),
    clientLabel: "Смешанная оплата",
  },
];

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
      `В базе уже есть накладные ${DEMO_DOC_PREFIX}…. Сначала: pnpm db:reset-test-data`,
    );
    process.exit(2);
  }

  console.log("Создание продавцов demo-seed-seller-1..3 …");
  const sellerIds: Record<string, string> = {
    "demo-seed-seller-1": await ensureSeller(db, "demo-seed-seller-1", DEMO_SELLER_PASSWORD),
    "demo-seed-seller-2": await ensureSeller(db, "demo-seed-seller-2", DEMO_SELLER_PASSWORD),
    "demo-seed-seller-3": await ensureSeller(db, "demo-seed-seller-3", DEMO_SELLER_PASSWORD),
  };

  const env = loadEnv({
    DATABASE_URL: process.env.DATABASE_URL,
    JWT_SECRET: process.env.JWT_SECRET,
    NODE_ENV: "development",
    REQUIRE_API_AUTH: "false",
  });

  const app = await buildApp({ env, db });

  type DocLine = { batchId: string; lineNo: number; productGradeCode: string };
  const batchByDocGrade = new Map<string, string>();

  console.log(`Накладные ДЕМО (${DOCUMENTS.length} шт., 2 склада) …`);
  for (const doc of DOCUMENTS) {
    await injectJson(app, doc.documentNumber, "POST", "/purchase-documents", {
      id: doc.id,
      documentNumber: doc.documentNumber,
      docDate: doc.docDate,
      warehouseId: doc.warehouseId,
      supplierName: doc.supplierName,
      extraCostKopecks: doc.extraCostKopecks,
      lines: doc.lines.map((line) => ({
        productGradeId: line.productGradeId,
        totalKg: line.totalKg,
        packageCount: line.packageCount,
        pricePerKg: line.pricePerKg,
        lineTotalKopecks: lineKop(line.totalKg, line.pricePerKg),
      })),
    });
    const detail = await injectJson<{ lines: DocLine[] }>(app, `get ${doc.id}`, "GET", `/purchase-documents/${doc.id}`);
    for (const line of detail.lines) {
      batchByDocGrade.set(`${doc.id}:${line.productGradeCode}`, line.batchId);
    }
  }

  console.log(`Рейсы ДЕМО (${TRIPS.length} шт.) …`);
  for (const trip of TRIPS) {
    await injectJson(app, trip.tripNumber, "POST", "/trips", {
      id: trip.id,
      tripNumber: trip.tripNumber,
      vehicleLabel: trip.vehicleLabel,
      driverName: trip.driverName ?? null,
      departedAt: trip.departedAt,
    });
    if (trip.sellerLogin) {
      await injectJson(app, `assign ${trip.tripNumber}`, "POST", `/trips/${trip.id}/assign-seller`, {
        sellerUserId: sellerIds[trip.sellerLogin],
      });
    }
  }

  console.log(`Отгрузка в рейсы (${SHIPMENTS.length} шт.) …`);
  for (const s of SHIPMENTS) {
    const batchId = batchByDocGrade.get(`${s.docId}:${s.gradeCode}`);
    if (!batchId) {
      throw new Error(`Нет партии ${s.docId} / ${s.gradeCode}`);
    }
    await injectJson(app, `ship ${s.tripId}`, "POST", `/batches/${encodeURIComponent(batchId)}/ship-to-trip`, {
      tripId: s.tripId,
      kg: s.kg,
      packageCount: s.packageCount,
    });
  }

  console.log(`Продажи с рейса (${SALES.length} шт., остаток для ручных продаж) …`);
  for (const sale of SALES) {
    const batchId = batchByDocGrade.get(`${sale.docId}:${sale.gradeCode}`);
    if (!batchId) {
      throw new Error(`Нет партии для продажи ${sale.docId} / ${sale.gradeCode}`);
    }
    await injectJson(app, sale.saleId, "POST", `/batches/${encodeURIComponent(batchId)}/sell-from-trip`, {
      tripId: sale.tripId,
      kg: sale.kg,
      saleId: sale.saleId,
      pricePerKg: sale.pricePerKg,
      packageCount: sale.packageCount,
      paymentKind: sale.paymentKind,
      saleChannel: sale.saleChannel,
      clientLabel: sale.clientLabel,
      cashKopecksMixed: sale.cashKopecksMixed,
      cardTransferKopecks: sale.cardTransferKopecks,
    });
  }

  await injectJson(app, "shortage demo", "POST", `/batches/${encodeURIComponent(batchByDocGrade.get("demo-pd-manas-01:№6")!)}/record-trip-shortage`, {
    tripId: "demo-trip-r101",
    kg: 15,
    reason: "Демо: недостача при приёмке",
  });

  await app.close();

  console.log("");
  console.log("Готово:");
  console.log(`  • ${DOCUMENTS.length} накладных (Манас: 5, Каякент: 5)`);
  console.log(`  • ${TRIPS.length} открытых рейсов с назначенными продавцами`);
  console.log(`  • ${SHIPMENTS.length} отгрузок, ${SALES.length} продаж (остаток — продавайте в /s)`);
  console.log(`  • Продавцы: demo-seed-seller-1 / 2 / 3 — пароль: BIRZHA_DEMO_SEED_PASSWORD или DemoSeed2026!!`);
} finally {
  await sql.end({ timeout: 5 });
}
