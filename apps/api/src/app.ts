import { sql } from "drizzle-orm";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";

import type { BatchRepository } from "./application/ports/batch-repository.port.js";
import type { TripRepository } from "./application/ports/trip-repository.port.js";
import type { TripSaleRepository } from "./application/ports/trip-sale-repository.port.js";
import type { TripShipmentRepository } from "./application/ports/trip-shipment-repository.port.js";
import type { TripShortageRepository } from "./application/ports/trip-shortage-repository.port.js";
import type { CounterpartyRepository } from "./application/ports/counterparty-repository.port.js";
import type { WholesalerRepository } from "./application/ports/wholesaler-repository.port.js";
import type { SellFromTripTransactionRunner } from "./application/sale/sell-from-trip.use-case.js";
import { InMemoryTripRepository } from "./application/testing/in-memory-trip.repository.js";
import { InMemoryTripSaleRepository } from "./application/testing/in-memory-trip-sale.repository.js";
import { InMemoryTripShipmentRepository } from "./application/testing/in-memory-trip-shipment.repository.js";
import { InMemoryTripShortageRepository } from "./application/testing/in-memory-trip-shortage.repository.js";
import { RecordWarehouseWriteOffUseCase } from "./application/batch/record-warehouse-write-off.use-case.js";
import type { RecordWarehouseWriteOffTransactionRunner } from "./application/batch/record-warehouse-write-off.use-case.js";
import { ReverseWarehouseWriteOffUseCase } from "./application/batch/reverse-warehouse-write-off.use-case.js";
import type { RecordTripShortageTransactionRunner } from "./application/trip/record-trip-shortage.use-case.js";
import type { ShipToTripTransactionRunner } from "./application/trip/ship-to-trip.use-case.js";
import type { AppEnv } from "./config.js";
import type { DbClient } from "./db/client.js";
import { registerAdminUserRoutes } from "./http/register-admin-user-routes.js";
import { registerAuthRoutes } from "./http/register-auth-routes.js";
import { registerBatchRoutes } from "./http/register-batch-routes.js";
import { registerWholesalerRoutes } from "./http/register-wholesaler-routes.js";
import { registerCounterpartyRoutes } from "./http/register-counterparty-routes.js";
import { registerLoadingManifestRoutes } from "./http/register-loading-manifest-routes.js";
import { registerAdminSummaryRoutes } from "./http/register-admin-summary-routes.js";
import { registerPurchaseDocumentRoutes } from "./http/register-purchase-document-routes.js";
import { registerShipDestinationRoutes } from "./http/register-ship-destination-routes.js";
import { createBusinessRouteAuth } from "./http/route-auth.js";
import { registerTripRoutes } from "./http/register-trip-routes.js";
import { DrizzleBatchRepository } from "./infrastructure/persistence/drizzle-batch.repository.js";
import { DrizzleBatchWarehouseWriteOffLedger } from "./infrastructure/persistence/drizzle-batch-warehouse-write-off-ledger.js";
import { DrizzleTripRepository } from "./infrastructure/persistence/drizzle-trip.repository.js";
import { DrizzleTripSaleRepository } from "./infrastructure/persistence/drizzle-trip-sale.repository.js";
import { DrizzleTripShipmentRepository } from "./infrastructure/persistence/drizzle-trip-shipment.repository.js";
import { DrizzleTripShortageRepository } from "./infrastructure/persistence/drizzle-trip-shortage.repository.js";
import { DrizzleWarehouseRepository } from "./infrastructure/persistence/drizzle-warehouse.repository.js";
import { CreatePurchaseDocumentUseCase } from "./application/purchase/create-purchase-document.use-case.js";
import { DeleteProductGradeUseCase } from "./application/purchase/delete-product-grade.use-case.js";
import { DeletePurchaseDocumentUseCase } from "./application/purchase/delete-purchase-document.use-case.js";
import { UpdatePurchaseDocumentHeaderUseCase } from "./application/purchase/update-purchase-document-header.use-case.js";
import { DeleteCounterpartyUseCase } from "./application/counterparty/delete-counterparty.use-case.js";
import { DeleteWarehouseUseCase } from "./application/warehouse/delete-warehouse.use-case.js";
import { DrizzleCounterpartyRepository } from "./infrastructure/persistence/drizzle-counterparty.repository.js";
import { DrizzleProductGradeRepository } from "./infrastructure/persistence/drizzle-product-grade.repository.js";
import { DrizzlePurchaseDocumentRepository } from "./infrastructure/persistence/drizzle-purchase-document.repository.js";
import { DrizzleWholesalerRepository } from "./infrastructure/persistence/drizzle-wholesaler.repository.js";
import { listGlobalSellerUsers } from "./infrastructure/persistence/drizzle-user-auth.repository.js";
import { InMemoryCounterpartyRepository } from "./infrastructure/persistence/in-memory-counterparty.repository.js";
import { InMemoryWholesalerRepository } from "./infrastructure/persistence/in-memory-wholesaler.repository.js";
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
  /** Справочник контрагентов; при `db` по умолчанию Drizzle, при полном in-memory стеке — in-memory. */
  counterpartyRepository?: CounterpartyRepository | null;
  /** Для тестов: список полевых продавцов без PostgreSQL. */
  listAssignableFieldSellers?: () => Promise<{ id: string; login: string }[]>;
}): Promise<FastifyInstance> {
  const { env, db } = options;
  const app = Fastify({
    logger: env.NODE_ENV !== "test",
    trustProxy: env.NODE_ENV === "production",
    /** Приём тела запроса целиком; защита от «залипших» клиентов без лимита по умолчанию в Node. */
    requestTimeout: env.NODE_ENV === "test" ? 0 : 180_000,
    /** JSON-API; при необходимости больших вложений — поднять осознанно. */
    bodyLimit: 5 * 1024 * 1024,
  });

  await app.register(helmet, {
    global: true,
    /** Отдельно задаётся для SPA (Vite); здесь только JSON API. */
    contentSecurityPolicy: false,
  });
  await app.register(rateLimit, {
    global: false,
  });

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

  let wholesalerRepository: WholesalerRepository | null = null;
  if (db) {
    wholesalerRepository = new DrizzleWholesalerRepository(db);
  } else if (
    batchRepository &&
    tripRepository &&
    shipmentRepository &&
    saleRepository &&
    shortageRepository &&
    counterpartyRepository
  ) {
    wholesalerRepository = new InMemoryWholesalerRepository();
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
          await fn({
            batches: new DrizzleBatchRepository(exec),
            sales: new DrizzleTripSaleRepository(exec),
            shipments: new DrizzleTripShipmentRepository(exec),
            shortages: new DrizzleTripShortageRepository(exec),
          });
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

  const runRecordWarehouseWriteOff: RecordWarehouseWriteOffTransactionRunner | undefined = db
    ? async (fn) => {
        await db.transaction(async (tx) => {
          const exec = tx as unknown as DbClient;
          await fn(new DrizzleBatchRepository(exec), new DrizzleBatchWarehouseWriteOffLedger(exec));
        });
      }
    : undefined;

  const recordWarehouseWriteOff: RecordWarehouseWriteOffUseCase | null =
    db && batchRepository && runRecordWarehouseWriteOff
      ? new RecordWarehouseWriteOffUseCase(
          batchRepository,
          new DrizzleBatchWarehouseWriteOffLedger(db as DbClient),
          runRecordWarehouseWriteOff,
        )
      : null;

  const reverseWarehouseWriteOff: ReverseWarehouseWriteOffUseCase | null =
    db && batchRepository && runRecordWarehouseWriteOff
      ? new ReverseWarehouseWriteOffUseCase(
          batchRepository,
          new DrizzleBatchWarehouseWriteOffLedger(db as DbClient),
          runRecordWarehouseWriteOff,
        )
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

  const updatePurchaseDocumentHeaderUseCase = purchaseDocumentRepository
    ? new UpdatePurchaseDocumentHeaderUseCase(purchaseDocumentRepository)
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
    loadingManifestsApi: db ? "enabled" : "disabled",
    shipDestinationsApi: db && createPurchaseDocumentUseCase ? "enabled" : "disabled",
    warehouseWriteOffApi: db && recordWarehouseWriteOff ? "enabled" : "disabled",
    tripsApi: tripRepository ? "enabled" : "disabled",
    tripShipmentLedger: shipmentRepository ? "enabled" : "disabled",
    tripSaleLedger: saleRepository ? "enabled" : "disabled",
    tripShortageLedger: shortageRepository ? "enabled" : "disabled",
    counterpartyCatalogApi: counterpartyRepository ? "enabled" : "disabled",
    wholesalersCatalogApi: wholesalerRepository ? "enabled" : "disabled",
    authApi: db && env.JWT_SECRET ? "enabled" : "disabled",
    requireApiAuth: env.REQUIRE_API_AUTH ? "enabled" : "disabled",
    adminUsersApi:
      db && env.JWT_SECRET && env.REQUIRE_API_AUTH ? "enabled" : "disabled",
  }));

  if (db && env.JWT_SECRET) {
    await registerAuthRoutes(app, { db, env });
  }

  const routeAuth = createBusinessRouteAuth(app, env);

  if (db && env.JWT_SECRET && env.REQUIRE_API_AUTH) {
    registerAdminUserRoutes(app, db, routeAuth);
  }

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
    wholesalerRepository &&
    warehouseRepository &&
    productGradeRepository &&
    purchaseDocumentRepository &&
    createPurchaseDocumentUseCase &&
    deletePurchaseDocumentUseCase &&
    updatePurchaseDocumentHeaderUseCase &&
    deleteWarehouseUseCase &&
    deleteProductGradeUseCase
  ) {
    registerPurchaseDocumentRoutes(
      app,
      {
        db: db ?? null,
        warehouses: warehouseRepository,
        grades: productGradeRepository,
        purchaseDocuments: purchaseDocumentRepository,
        createPurchaseDocument: createPurchaseDocumentUseCase,
        deletePurchaseDocument: deletePurchaseDocumentUseCase,
        updatePurchaseDocumentHeader: updatePurchaseDocumentHeaderUseCase,
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
      options.listAssignableFieldSellers ?? (db ? () => listGlobalSellerUsers(db) : undefined),
    );
    registerBatchRoutes(
      app,
      batchRepository,
      tripRepository,
      shipmentRepository,
      saleRepository,
      shortageRepository,
      counterpartyRepository,
      wholesalerRepository,
      routeAuth,
      runShipInTransaction,
      runSellInTransaction,
      runRecordTripShortageInTransaction,
      db,
      recordWarehouseWriteOff,
      reverseWarehouseWriteOff,
    );
    if (db) {
      registerShipDestinationRoutes(app, db, routeAuth);
      registerLoadingManifestRoutes(app, db, routeAuth, tripRepository ?? undefined);
      registerWholesalerRoutes(app, wholesalerRepository, routeAuth);
      registerAdminSummaryRoutes(app, db, routeAuth);
    }
  }

  return app;
}
