import { sql } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";

import type { BatchRepository } from "./application/ports/batch-repository.port.js";
import type { TripRepository } from "./application/ports/trip-repository.port.js";
import type { TripSaleRepository } from "./application/ports/trip-sale-repository.port.js";
import type { TripShipmentRepository } from "./application/ports/trip-shipment-repository.port.js";
import type { TripShortageRepository } from "./application/ports/trip-shortage-repository.port.js";
import type { SyncIdempotencyRepository } from "./application/ports/sync-idempotency.port.js";
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
import { registerBatchRoutes } from "./http/register-batch-routes.js";
import { registerSyncRoutes } from "./http/register-sync-routes.js";
import { registerTripRoutes } from "./http/register-trip-routes.js";
import { DrizzleBatchRepository } from "./infrastructure/persistence/drizzle-batch.repository.js";
import { DrizzleTripRepository } from "./infrastructure/persistence/drizzle-trip.repository.js";
import { DrizzleTripSaleRepository } from "./infrastructure/persistence/drizzle-trip-sale.repository.js";
import { DrizzleTripShipmentRepository } from "./infrastructure/persistence/drizzle-trip-shipment.repository.js";
import { DrizzleTripShortageRepository } from "./infrastructure/persistence/drizzle-trip-shortage.repository.js";
import { DrizzleSyncIdempotencyRepository } from "./infrastructure/persistence/drizzle-sync-idempotency.repository.js";

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

  app.get("/meta", async () => ({
    name: "@birzha/api",
    domain: "ok",
    batchesApi: batchRepository ? "enabled" : "disabled",
    tripsApi: tripRepository ? "enabled" : "disabled",
    tripShipmentLedger: shipmentRepository ? "enabled" : "disabled",
    tripSaleLedger: saleRepository ? "enabled" : "disabled",
    tripShortageLedger: shortageRepository ? "enabled" : "disabled",
    syncApi: syncIdempotency ? "enabled" : "disabled",
  }));

  if (batchRepository && tripRepository && shipmentRepository && saleRepository && shortageRepository && syncIdempotency) {
    registerTripRoutes(app, tripRepository, shipmentRepository, saleRepository, shortageRepository, batchRepository);
    registerBatchRoutes(
      app,
      batchRepository,
      tripRepository,
      shipmentRepository,
      saleRepository,
      shortageRepository,
      runShipInTransaction,
      runSellInTransaction,
      runRecordTripShortageInTransaction,
    );

    const applySync = new ApplySyncActionUseCase(
      syncIdempotency,
      batchRepository,
      tripRepository,
      shipmentRepository,
      saleRepository,
      shortageRepository,
      runShipInTransaction,
      runSellInTransaction,
      runRecordTripShortageInTransaction,
    );
    registerSyncRoutes(app, applySync);
  }

  return app;
}
