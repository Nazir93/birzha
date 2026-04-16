import { bigint, numeric, pgTable, primaryKey, text } from "drizzle-orm/pg-core";
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