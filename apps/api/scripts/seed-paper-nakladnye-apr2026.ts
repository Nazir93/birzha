/**
 * Закупочные накладные с бумажных форм (18.04.2026): 5 шаблонов × 3 склада = 15 документов.
 * На первом складе (Манас) — оригинальные имена «От кого»; на Каякент и Дербент — альтернативные (10 шт.).
 *
 *   cd apps/api
 *   pnpm db:seed-paper-nak2026
 *
 * Нужны DATABASE_URL и JWT_SECRET в apps/api/.env.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import { like } from "drizzle-orm";
import {
  numberToDecimalStringForKopecks,
  purchaseLineAmountKopecksFromDecimalStrings,
} from "@birzha/contracts";

import { loadEnv } from "../src/config.js";
import { createDb } from "../src/db/client.js";
import * as schema from "../src/db/schema.js";
import { buildApp } from "../src/app.js";
import type { FastifyInstance } from "fastify";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const DOC_PREFIX = "18.04-2026-";

const WH_MANAS = "wh-manas";
const WH_KAYAKENT = "wh-kayakent";
const WH_DERBENT = "wh-derbent";

type LineSeed = {
  productGradeId: string;
  netKg: number;
  packageCount: number;
  pricePerKg: number;
};

type TemplateSeed = {
  key: string;
  supplierOriginal: string;
  supplierAlt: string;
  lines: LineSeed[];
};

/** Пять бумажных накладных с фото. */
const TEMPLATES: TemplateSeed[] = [
  {
    key: "abdurakhim",
    supplierOriginal: "Абдурахим",
    supplierAlt: "ИП Абдурахим",
    lines: [
      { productGradeId: "pg-n5", netKg: 126, packageCount: 17, pricePerKg: 190 },
      { productGradeId: "pg-n6", netKg: 178, packageCount: 26, pricePerKg: 180 },
      { productGradeId: "pg-n7", netKg: 81, packageCount: 13, pricePerKg: 140 },
    ],
  },
  {
    key: "hanifa",
    supplierOriginal: "Ханифа",
    supplierAlt: "Теплица Ханифа",
    lines: [
      { productGradeId: "pg-n5", netKg: 74, packageCount: 10, pricePerKg: 190 },
      { productGradeId: "pg-n6", netKg: 97, packageCount: 14, pricePerKg: 180 },
      { productGradeId: "pg-n7", netKg: 57, packageCount: 9, pricePerKg: 140 },
    ],
  },
  {
    key: "marina",
    supplierOriginal: "Марина",
    supplierAlt: "Огород Марина",
    lines: [
      { productGradeId: "pg-n5", netKg: 65, packageCount: 9, pricePerKg: 190 },
      { productGradeId: "pg-n6", netKg: 295, packageCount: 44, pricePerKg: 180 },
      { productGradeId: "pg-n7", netKg: 242, packageCount: 40, pricePerKg: 140 },
    ],
  },
  {
    key: "nizali",
    supplierOriginal: "Низали",
    supplierAlt: "Низали поставка",
    lines: [
      { productGradeId: "pg-n5", netKg: 680, packageCount: 85, pricePerKg: 190 },
      { productGradeId: "pg-n6", netKg: 632, packageCount: 85, pricePerKg: 180 },
      { productGradeId: "pg-n7", netKg: 108, packageCount: 18, pricePerKg: 140 },
      { productGradeId: "pg-nsm", netKg: 34, packageCount: 5, pricePerKg: 130 },
    ],
  },
  {
    key: "umar",
    supplierOriginal: "Умар",
    supplierAlt: "Умар (накл. №12)",
    lines: [
      { productGradeId: "pg-n5", netKg: 983, packageCount: 121, pricePerKg: 190 },
      { productGradeId: "pg-n6", netKg: 1130, packageCount: 163, pricePerKg: 180 },
      { productGradeId: "pg-n7", netKg: 188, packageCount: 30, pricePerKg: 140 },
      { productGradeId: "pg-n8", netKg: 26, packageCount: 5, pricePerKg: 80 },
      { productGradeId: "pg-nsm", netKg: 65, packageCount: 9, pricePerKg: 130 },
    ],
  },
];

const WAREHOUSES: { id: string; code: string; name: string; useOriginalNames: boolean }[] = [
  { id: WH_MANAS, code: "MAN", name: "Манас", useOriginalNames: true },
  { id: WH_KAYAKENT, code: "KAY", name: "Каякент", useOriginalNames: false },
  { id: WH_DERBENT, code: "DER", name: "Дербент", useOriginalNames: false },
];

function lineKop(kg: number, rubPerKg: number): number {
  return purchaseLineAmountKopecksFromDecimalStrings(
    numberToDecimalStringForKopecks(kg, 6),
    numberToDecimalStringForKopecks(rubPerKg, 4),
  );
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
  console.error("Нужен JWT_SECRET не короче 32 символов.");
  process.exit(1);
}

const { db, sql } = createDb(process.env.DATABASE_URL);

try {
  const existing = await db
    .select({ n: schema.purchaseDocuments.documentNumber })
    .from(schema.purchaseDocuments)
    .where(like(schema.purchaseDocuments.documentNumber, `${DOC_PREFIX}%`))
    .limit(1);
  if (existing.length > 0) {
    console.error(`Уже есть накладные с префиксом «${DOC_PREFIX}». Сначала очистите или смените префикс.`);
    process.exit(2);
  }

  console.log(">>> склад Дербент (если нет)");
  await sql`
    INSERT INTO warehouses (id, code, name)
    VALUES (${WH_DERBENT}, 'DERBENT', 'Дербент')
    ON CONFLICT (id) DO NOTHING
  `;

  const env = loadEnv({
    DATABASE_URL: process.env.DATABASE_URL,
    JWT_SECRET: process.env.JWT_SECRET,
    NODE_ENV: "development",
    REQUIRE_API_AUTH: "false",
  });

  const app = await buildApp({ env, db });

  let created = 0;
  let renamed = 0;

  for (const wh of WAREHOUSES) {
    let seq = 1;
    for (const tpl of TEMPLATES) {
      const docId = `paper-${wh.code.toLowerCase()}-${tpl.key}`;
      const documentNumber = `${DOC_PREFIX}${wh.code}-${String(seq).padStart(2, "0")}`;
      const supplierName = wh.useOriginalNames ? tpl.supplierOriginal : tpl.supplierAlt;
      if (!wh.useOriginalNames) {
        renamed += 1;
      }

      await injectJson(app, documentNumber, "POST", "/purchase-documents", {
        id: docId,
        documentNumber,
        docDate: "2026-04-18",
        warehouseId: wh.id,
        supplierName,
        extraCostKopecks: 0,
        lines: tpl.lines.map((line) => ({
          productGradeId: line.productGradeId,
          grossKg: line.netKg + line.packageCount * 0.5,
          packageCount: line.packageCount,
          pricePerKg: line.pricePerKg,
          lineTotalKopecks: lineKop(line.netKg, line.pricePerKg),
        })),
      });

      console.log(`  ✓ ${documentNumber} · ${wh.name} · ${supplierName}`);
      created += 1;
      seq += 1;
    }
  }

  await app.close();

  console.log("");
  console.log(`Готово: ${created} закупочных накладных (${WAREHOUSES.length} склада × ${TEMPLATES.length} шт.).`);
  console.log(`  Оригинальные имена: ${created - renamed} (склад Манас)`);
  console.log(`  Изменённые имена: ${renamed} (Каякент + Дербент)`);
} finally {
  await sql.end({ timeout: 5 });
}
