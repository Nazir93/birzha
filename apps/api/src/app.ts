import { sql } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";

import type { BatchRepository } from "./application/ports/batch-repository.port.js";
import type { TripRepository } from "./application/ports/trip-repository.port.js";
import type { TripSaleRepository } from "./application/ports/trip-sale-repository.port.js";
import type { TripShipmentRepository } from "./application/ports/trip-shipment-repository.port.js";
import type { TripShortageRepository } from "./application/ports/trip-shortage-repository.port.js";
import type { SyncIdempotencyRepository } from "./application/ports/sync-idempotency.port.js";
import type { CounterpartyRepository } from "./application/ports/counterparty-repository.port.js";
import type { SellFromTripTransactionRunner } from "./application/sale/sell-from-trip.use-case.js";
import { InMemoryTripRepository } from "./application/testing/in-memory-trip.repository.js";
import { InMemoryTripSaleRepository } from "./application/testing/in-memory-trip-sale.repository.js";
import { InMemoryTripShipmentRepository } from "./application/testing/in-memory-trip-shipment.repository.js";
import { InMemoryTripShortageRepository } from "./application/testing/in-memory-trip-shortage.repository.js";
import { InMemorySyncIdempotencyRepository } from "./application/testing/in-memory-sync-idempotency.repository.js";
import { ApplySyncActionUseCase } from "./application/sync/apply-sync-action.use-case.js";
import type { RecordTripShortageTransactionRunner } from "./application/trip/record-trip-shortage.use-case.js";
import type { ShipToTripTransactionRunner } from "./application/trip/ship-to-trip.use-case.js";
import type { AppEnv } from "./config.js";
import type { DbClient } from "./db/client.js";
import { registerAuthRoutes } from "./http/register-auth-routes.js";
import { registerBatchRoutes } from "./http/register-batch-routes.js";
import { registerCounterpartyRoutes } from "./http/register-counterparty-routes.js";
import { registerPurchaseDocumentRoutes } from "./http/register-purchase-document-routes.js";
import { createBusinessRouteAuth } from "./http/route-auth.js";
import { registerSyncRoutes } from "./http/register-sync-routes.js";
import { registerTripRoutes } from "./http/register-trip-routes.js";
import { DrizzleBatchRepository } from "./infrastructure/persistence/drizzle-batch.repository.js";
import { DrizzleTripRepository } from "./infrastructure/persistence/drizzle-trip.repository.js";
import { DrizzleTripSaleRepository } from "./infrastructure/persistence/drizzle-trip-sale.repository.js";
import { DrizzleTripShipmentRepository } from "./infrastructure/persistence/drizzle-trip-shipment.repository.js";
import { DrizzleTripShortageRepository } from "./infrastructure/persistence/drizzle-trip-shortage.repository.js";
import { DrizzleSyncIdempotencyRepository } from "./infrastructure/persistence/drizzle-sync-idempotency.repository.js";
import { CreatePurchaseDocumentUseCase } from "./application/purchase/create-purchase-document.use-case.js";
import { DeleteProductGradeUseCase } from "./application/purchase/delete-product-grade.use-case.js";
import { DeletePurchaseDocumentUseCase } from "./application/purchase/delete-purchase-document.use-case.js";
import { DeleteCounterpartyUseCase } from "./application/counterparty/delete-counterparty.use-case.js";
import { DeleteWarehouseUseCase } from "./application/warehouse/delete-warehouse.use-case.js";
import { DrizzleCounterpartyRepository } from "./infrastructure/persistence/drizzle-counterparty.repository.js";
import { DrizzleProductGradeRepository } from "./infrastructure/persistence/drizzle-product-grade.repository.js";
import { DrizzlePurchaseDocumentRepository } from "./infrastructure/persistence/drizzle-purchase-document.repository.js";
import { DrizzleWarehouseRepository } from "./infrastructure/persistence/drizzle-warehouse.repository.js";
import { InMemoryCounterpartyRepository } from "./infrastructure/persistence/in-memory-counterparty.repository.js";
import { InMemoryPurchaseDocumentRepository } from "./infrastructure/persistence/in-memory-purchase-document.repository.js";
import { StaticProductGradeRepository } from "./infrastructure/persistence/static-product-grade.repository.js";
import { StaticWarehouseRepository } from "./infrastructure/persistence/static-warehouse.repository.js";

export async function buildApp(options: {
  env: AppEnv;
  db: DbClient | null;
  /** Для тестов без PostgreSQL; иначе при наличии `db` создаётся Drizzle-репозиторий. */
  batchRepository?: BatchRepository | null;
  /** Если не передан: при `db` — Drizzle; при in-memory партиях — пустой in-memory рейсов. */
  tripRepository?: TripRepository | null;
  /** Журнал отгрузок партий в рейс; при in-memory контуре создаётся автоматически. */
  shipmentRepository?: TripShipmentRepository | null;
  /** Журнал продаж по рейсу; при in-memory контуре создаётся автоматически. */
  saleRepository?: TripSaleRepository | null;
  /** Журнал недостач по рейсу. */
  shortageRepository?: TripShortageRepository | null;
  /** Идемпотентность `POST /sync`; по умолчанию in-memory или Drizzle при `db`. */
  syncIdempotencyRepository?: SyncIdempotencyRepository;
  /** Справочник контрагентов; при `db` по умолчанию Drizzle, при полном in-memory стеке — in-memory. */
  counterpartyRepository?: CounterpartyRepository | null;
}): Promise<FastifyInstance> {
  const { env, db } = options;
  const app = Fastify({ logger: env.NODE_ENV !== "test" });

  const batchRepository =
    options.batchRepository !== undefined
      ? options.batchRepository
      : db
        ? new DrizzleBatchRepository(db)
        : null;

  let tripRepository: TripRepository | null =
    options.tripRepository !== undefined ? options.tripRepository : db ? new DrizzleTripRepository(db) : null;

  if (batchRepository && tripRepository === null && options.tripRepository === undefined) {
    tripRepository = new InMemoryTripRepository();
  }

  let shipmentRepository: TripShipmentRepository | null =
    options.shipmentRepository !== undefined
      ? options.shipmentRepository
      : db
        ? new DrizzleTripShipmentRepository(db)
        : null;

  if (batchRepository && tripRepository && shipmentRepository === null && options.shipmentRepository === undefined) {
    shipmentRepository = new InMemoryTripShipmentRepository();
  }

  let saleRepository: TripSaleRepository | null =
    options.saleRepository !== undefined
      ? options.saleRepository
      : db
        ? new DrizzleTripSaleRepository(db)
        : null;

  if (batchRepository && tripRepository && shipmentRepository && saleRepository === null && options.saleRepository === undefined) {
    saleRepository = new InMemoryTripSaleRepository();
  }

  let shortageRepository: TripShortageRepository | null =
    options.shortageRepository !== undefined
      ? options.shortageRepository
      : db
        ? new DrizzleTripShortageRepository(db)
        : null;

  if (
    batchRepository &&
    tripRepository &&
    shipmentRepository &&
    saleRepository &&
    shortageRepository === null &&
    options.shortageRepository === undefined
  ) {
    shortageRepository = new InMemoryTripShortageRepository();
  }

  let counterpartyRepository: CounterpartyRepository | null =
    options.counterpartyRepository !== undefined ? options.counterpartyRepository : db ? new DrizzleCounterpartyRepository(db) : null;

  if (
    counterpartyRepository === null &&
    options.counterpartyRepository === undefined &&
    batchRepository &&
    tripRepository &&
    shipmentRepository &&
    saleRepository &&
    shortageRepository
  ) {
    counterpartyRepository = new InMemoryCounterpartyRepository();
  }

  const runShipInTransaction: ShipToTripTransactionRunner | undefined = db
    ? async (fn) => {
        await db.transaction(async (tx) => {
          const exec = tx as unknown as DbClient;
          await fn(new DrizzleBatchRepository(exec), new DrizzleTripShipmentRepository(exec));
        });
      }
    : undefined;

  const runSellInTransaction: SellFromTripTransactionRunner | undefined = db
    ? async (fn) => {
        await db.transaction(async (tx) => {
          const exec = tx as unknown as DbClient;
          await fn(new DrizzleBatchRepository(exec), new DrizzleTripSaleRepository(exec));
        });
      }
    : undefined;

  const runRecordTripShortageInTransaction: RecordTripShortageTransactionRunner | undefined = db
    ? async (fn) => {
        await db.transaction(async (tx) => {
          const exec = tx as unknown as DbClient;
          await fn(new DrizzleBatchRepository(exec), new DrizzleTripShortageRepository(exec));
        });
      }
    : undefined;

  const syncStackReady =
    Boolean(batchRepository) &&
    Boolean(tripRepository) &&
    Boolean(shipmentRepository) &&
    Boolean(saleRepository) &&
    Boolean(shortageRepository);

  const syncIdempotency: SyncIdempotencyRepository | null = syncStackReady
    ? (options.syncIdempotencyRepository ??
        (db ? new DrizzleSyncIdempotencyRepository(db) : new InMemorySyncIdempotencyRepository()))
    : null;

  app.get("/health", async () => ({
    status: "ok",
    time: new Date().toISOString(),
    env: env.NODE_ENV,
  }));

  app.get("/health/ready", async (_req, reply) => {
    if (!db) {
      return reply.send({
        status: "ready",
        database: "not_configured",
        hint: "Задайте DATABASE_URL для проверки PostgreSQL",
      });
    }
    await db.execute(sql`select 1`);
    return reply.send({ status: "ready", database: "ok" });
  });

  const warehouseRepository =
    batchRepository && tripRepository && shipmentRepository && saleRepository && shortageRepository && counterpartyRepository
      ? db
        ? new DrizzleWarehouseRepository(db)
        : new StaticWarehouseRepository()
      : null;

  const productGradeRepository =
    batchRepository && tripRepository && shipmentRepository && saleRepository && shortageRepository && counterpartyRepository
      ? db
        ? new DrizzleProductGradeRepository(db)
        : new StaticProductGradeRepository()
      : null;

  const purchaseDocumentRepository =
    batchRepository &&
    tripRepository &&
    shipmentRepository &&
    saleRepository &&
    shortageRepository &&
    counterpartyRepository &&
    productGradeRepository
      ? db
        ? new DrizzlePurchaseDocumentRepository(db)
        : new InMemoryPurchaseDocumentRepository(
            batchRepository,
            productGradeRepository,
            shipmentRepository,
            saleRepository,
            shortageRepository,
          )
      : null;

  const createPurchaseDocumentUseCase =
    warehouseRepository && productGradeRepository && purchaseDocumentRepository
      ? new CreatePurchaseDocumentUseCase(warehouseRepository, productGradeRepository, purchaseDocumentRepository)
      : null;

  const deletePurchaseDocumentUseCase = purchaseDocumentRepository
    ? new DeletePurchaseDocumentUseCase(purchaseDocumentRepository)
    : null;

  const deleteWarehouseUseCase =
    warehouseRepository && purchaseDocumentRepository && batchRepository
      ? new DeleteWarehouseUseCase(warehouseRepository, purchaseDocumentRepository, batchRepository)
      : null;

  const deleteProductGradeUseCase =
    productGradeRepository && purchaseDocumentRepository
      ? new DeleteProductGradeUseCase(productGradeRepository, purchaseDocumentRepository)
      : null;

  const deleteCounterpartyUseCase =
    counterpartyRepository && saleRepository
      ? new DeleteCounterpartyUseCase(counterpartyRepository, saleRepository)
      : null;

  app.get("/meta", async () => ({
    name: "@birzha/api",
    domain: "ok",
    batchesApi: batchRepository ? "enabled" : "disabled",
    purchaseDocumentsApi: createPurchaseDocumentUseCase ? "enabled" : "disabled",
    tripsApi: tripRepository ? "enabled" : "disabled",
    tripShipmentLedger: shipmentRepository ? "enabled" : "disabled",
    tripSaleLedger: saleRepository ? "enabled" : "disabled",
    tripShortageLedger: shortageRepository ? "enabled" : "disabled",
    counterpartyCatalogApi: counterpartyRepository ? "enabled" : "disabled",
    syncApi: syncIdempotency ? "enabled" : "disabled",
    authApi: db && env.JWT_SECRET ? "enabled" : "disabled",
    requireApiAuth: env.REQUIRE_API_AUTH ? "enabled" : "disabled",
  }));

  if (db && env.JWT_SECRET) {
    await registerAuthRoutes(app, { db, env });
  }

  const routeAuth = createBusinessRouteAuth(app, env);

  if (counterpartyRepository) {
    registerCounterpartyRoutes(
      app,
      { counterparties: counterpartyRepository, deleteCounterparty: deleteCounterpartyUseCase },
      routeAuth,
    );
  }

  if (
    batchRepository &&
    tripRepository &&
    shipmentRepository &&
    saleRepository &&
    shortageRepository &&
    counterpartyRepository &&
    syncIdempotency &&
    warehouseRepository &&
    productGradeRepository &&
    purchaseDocumentRepository &&
    createPurchaseDocumentUseCase &&
    deletePurchaseDocumentUseCase &&
    deleteWarehouseUseCase &&
    deleteProductGradeUseCase
  ) {
    registerPurchaseDocumentRoutes(
      app,
      {
        warehouses: warehouseRepository,
        grades: productGradeRepository,
        purchaseDocuments: purchaseDocumentRepository,
        createPurchaseDocument: createPurchaseDocumentUseCase,
        deletePurchaseDocument: deletePurchaseDocumentUseCase,
        deleteWarehouse: deleteWarehouseUseCase,
        deleteProductGrade: deleteProductGradeUseCase,
      },
      routeAuth,
    );
    registerTripRoutes(
      app,
      tripRepository,
      shipmentRepository,
      saleRepository,
      shortageRepository,
      batchRepository,
      routeAuth,
    );
    registerBatchRoutes(
      app,
      batchRepository,
      tripRepository,
      shipmentRepository,
      saleRepository,
      shortageRepository,
      counterpartyRepository,
      routeAuth,
      runShipInTransaction,
      runSellInTransaction,
      runRecordTripShortageInTransaction,
      db,
    );

    const applySync = new ApplySyncActionUseCase(
      syncIdempotency,
      batchRepository,
      tripRepository,
      shipmentRepository,
      saleRepository,
      shortageRepository,
      counterpartyRepository,
      runShipInTransaction,
      runSellInTransaction,
      runRecordTripShortageInTransaction,
    );
    registerSyncRoutes(app, applySync, routeAuth);
  }

  return app;
}
