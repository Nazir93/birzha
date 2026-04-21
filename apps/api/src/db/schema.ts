import { sql } from "drizzle-orm";
import { bigint, boolean, date, integer, numeric, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

/** Склад поступления (Манас, Каякент и т.д.). */
export const warehouses = pgTable("warehouses", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
});

/** Коммерческий калибр / код строки накладной (№5, НС-, …). Опционально `product_group` — вид товара (помидоры, огурцы…). */
export const productGrades = pgTable("product_grades", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  displayName: text("display_name").notNull(),
  /** Группа номенклатуры для списка в накладной (у разных товаров разные калибры). */
  productGroup: text("product_group"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
});

/**
 * Закупочная накладная (шапка). Строки — `purchase_document_lines`; на каждую строку создаётся партия.
 */
export const purchaseDocuments = pgTable("purchase_documents", {
  id: text("id").primaryKey(),
  documentNumber: text("document_number").notNull(),
  docDate: date("doc_date", { mode: "date" }).notNull(),
  supplierName: text("supplier_name"),
  buyerLabel: text("buyer_label"),
  warehouseId: text("warehouse_id")
    .notNull()
    .references(() => warehouses.id),
  /** default через sql — иначе drizzle-kit push падает на JSON.stringify(BigInt). */
  extraCostKopecks: bigint("extra_cost_kopecks", { mode: "bigint" }).notNull().default(sql`0`),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

/**
 * Справочник контрагентов (клиенты для продаж с рейса). Подпись в строке продажи — снимок `display_name` в `trip_batch_sales.client_label`.
 */
export const counterparties = pgTable("counterparties", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

/**
 * Персистентная модель партии. Масса — в граммах (bigint), без float.
 * Маппинг из доменного Batch — в application/repositories (следующие этапы).
 */
export const batches = pgTable("batches", {
  id: text("id").primaryKey(),
  purchaseId: text("purchase_id").notNull(),
  totalGrams: bigint("total_grams", { mode: "bigint" }).notNull(),
  pendingInboundGrams: bigint("pending_inbound_grams", { mode: "bigint" }).notNull(),
  onWarehouseGrams: bigint("on_warehouse_grams", { mode: "bigint" }).notNull(),
  inTransitGrams: bigint("in_transit_grams", { mode: "bigint" }).notNull(),
  soldGrams: bigint("sold_grams", { mode: "bigint" }).notNull(),
  writtenOffGrams: bigint("written_off_grams", { mode: "bigint" }).notNull(),
  pricePerKg: numeric("price_per_kg", { precision: 18, scale: 6 }).notNull(),
  warehouseId: text("warehouse_id").references(() => warehouses.id, { onDelete: "set null" }),
});

/** Строка закупочной накладной; одна строка — одна партия (`batch_id`). */
export const purchaseDocumentLines = pgTable("purchase_document_lines", {
  id: text("id").primaryKey(),
  documentId: text("document_id")
    .notNull()
    .references(() => purchaseDocuments.id, { onDelete: "cascade" }),
  lineNo: integer("line_no").notNull(),
  productGradeId: text("product_grade_id")
    .notNull()
    .references(() => productGrades.id),
  quantityGrams: bigint("quantity_grams", { mode: "bigint" }).notNull(),
  packageCount: bigint("package_count", { mode: "bigint" }),
  pricePerKg: numeric("price_per_kg", { precision: 18, scale: 6 }).notNull(),
  lineTotalKopecks: bigint("line_total_kopecks", { mode: "bigint" }).notNull(),
  batchId: text("batch_id")
    .notNull()
    .unique()
    .references(() => batches.id),
});

export const trips = pgTable("trips", {
  id: text("id").primaryKey(),
  tripNumber: text("trip_number").notNull(),
  status: text("status").notNull(),
});

/** Строка журнала: отгрузка массы партии в рейс (сходимость отчёта по рейсу). */
export const tripBatchShipments = pgTable("trip_batch_shipments", {
  id: text("id").primaryKey(),
  tripId: text("trip_id")
    .notNull()
    .references(() => trips.id),
  batchId: text("batch_id")
    .notNull()
    .references(() => batches.id),
  grams: bigint("grams", { mode: "bigint" }).notNull(),
  /** Ящики по строке отгрузки (опционально); суммируются в отчёте по рейсу. */
  packageCount: bigint("package_count", { mode: "bigint" }),
});

/** Недостача / списание массы из пути по рейсу (приёмка и т.п.). */
export const tripBatchShortages = pgTable("trip_batch_shortages", {
  id: text("id").primaryKey(),
  tripId: text("trip_id")
    .notNull()
    .references(() => trips.id),
  batchId: text("batch_id")
    .notNull()
    .references(() => batches.id),
  grams: bigint("grams", { mode: "bigint" }).notNull(),
  reason: text("reason").notNull(),
});

/** Продажа массы партии в контексте рейса (для отчёта и лимита «не больше отгруженного»). */
export const tripBatchSales = pgTable("trip_batch_sales", {
  id: text("id").primaryKey(),
  tripId: text("trip_id")
    .notNull()
    .references(() => trips.id),
  batchId: text("batch_id")
    .notNull()
    .references(() => batches.id),
  saleId: text("sale_id").notNull(),
  grams: bigint("grams", { mode: "bigint" }).notNull(),
  /** Цена за кг в копейках (фиксация на момент продажи). */
  pricePerKgKopecks: bigint("price_per_kg_kopecks", { mode: "bigint" }).notNull(),
  /** Выручка по строке в копейках (согласована с grams и ценой). */
  revenueKopecks: bigint("revenue_kopecks", { mode: "bigint" }).notNull(),
  /** Часть выручки наличными (остальное — долг). */
  cashKopecks: bigint("cash_kopecks", { mode: "bigint" }).notNull(),
  debtKopecks: bigint("debt_kopecks", { mode: "bigint" }).notNull(),
  /** Произвольная подпись клиента на строке продажи (до справочника контрагентов). */
  clientLabel: text("client_label"),
  /** Ссылка на справочник; при продаже по справочнику дублируется снимок имени в `client_label`. */
  counterpartyId: text("counterparty_id").references(() => counterparties.id, { onDelete: "set null" }),
});

/** Успешно обработанные офлайн-действия (идемпотентность по устройству). */
export const syncProcessedActions = pgTable(
  "sync_processed_actions",
  {
    deviceId: text("device_id").notNull(),
    localActionId: text("local_action_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.deviceId, t.localActionId] })],
);

/** Учётные записи; вход — JWT (`/auth/login`). См. `docs/architecture/data-model/table-catalog.md`. */
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  login: text("login").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true, mode: "date" }),
});

/** Справочник ролей; `code` стабилен для API и проверок прав. */
export const roles = pgTable("roles", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
});

/**
 * Связь пользователь ↔ роль с опциональной областью (склад, рынок и т.д.).
 * Для глобальной роли: `scope_type = 'global'`, `scope_id = ''`.
 */
export const userRoles = pgTable(
  "user_roles",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleCode: text("role_code")
      .notNull()
      .references(() => roles.code, { onDelete: "cascade" }),
    scopeType: text("scope_type").notNull().default("global"),
    scopeId: text("scope_id").notNull().default(""),
  },
  (t) => [primaryKey({ columns: [t.userId, t.roleCode, t.scopeType, t.scopeId] })],
);