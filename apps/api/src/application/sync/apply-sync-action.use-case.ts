import type { BatchRepository } from "../ports/batch-repository.port.js";
import type { SyncIdempotencyRepository } from "../ports/sync-idempotency.port.js";
import type { TripRepository } from "../ports/trip-repository.port.js";
import type { TripSaleRepository } from "../ports/trip-sale-repository.port.js";
import type { TripShipmentRepository } from "../ports/trip-shipment-repository.port.js";
import type { TripShortageRepository } from "../ports/trip-shortage-repository.port.js";
import { RecordTripShortageUseCase } from "../trip/record-trip-shortage.use-case.js";
import type { RecordTripShortageTransactionRunner } from "../trip/record-trip-shortage.use-case.js";
import { CreateTripUseCase } from "../trip/create-trip.use-case.js";
import { ShipToTripUseCase } from "../trip/ship-to-trip.use-case.js";
import type { ShipToTripTransactionRunner } from "../trip/ship-to-trip.use-case.js";
import { ReceiveOnWarehouseUseCase } from "../warehouse/receive-on-warehouse.use-case.js";
import { SellFromTripUseCase } from "../sale/sell-from-trip.use-case.js";
import type { SellFromTripTransactionRunner } from "../sale/sell-from-trip.use-case.js";

import { mapErrorToSyncRejection } from "./map-sync-rejection.js";
import type { SyncRequestBody } from "./sync-request.schema.js";

export type SyncApplyResult =
  | { status: "ok"; actionId: string; duplicate?: boolean }
  | {
      status: "rejected";
      actionId: string;
      reason: string;
      resolution: string;
      errorCode?: string;
      details?: Record<string, unknown>;
    };

export class ApplySyncActionUseCase {
  private readonly sell: SellFromTripUseCase;
  private readonly shipToTrip: ShipToTripUseCase;
  private readonly recordShortage: RecordTripShortageUseCase;
  private readonly receive: ReceiveOnWarehouseUseCase;
  private readonly createTrip: CreateTripUseCase;

  constructor(
    private readonly idempotency: SyncIdempotencyRepository,
    batches: BatchRepository,
    trips: TripRepository,
    shipments: TripShipmentRepository,
    sales: TripSaleRepository,
    shortages: TripShortageRepository,
    runShipInTransaction?: ShipToTripTransactionRunner,
    runSellInTransaction?: SellFromTripTransactionRunner,
    runRecordTripShortageInTransaction?: RecordTripShortageTransactionRunner,
  ) {
    this.sell = new SellFromTripUseCase(batches, trips, shipments, sales, shortages, runSellInTransaction);
    this.shipToTrip = new ShipToTripUseCase(batches, trips, shipments, runShipInTransaction);
    this.recordShortage = new RecordTripShortageUseCase(
      batches,
      trips,
      shipments,
      sales,
      shortages,
      runRecordTripShortageInTransaction,
    );
    this.receive = new ReceiveOnWarehouseUseCase(batches);
    this.createTrip = new CreateTripUseCase(trips);
  }

  async execute(body: SyncRequestBody): Promise<SyncApplyResult> {
    const { deviceId, localActionId } = body;
    if (await this.idempotency.hasProcessed(deviceId, localActionId)) {
      return { status: "ok", actionId: localActionId, duplicate: true };
    }

    try {
      switch (body.actionType) {
        case "sell_from_trip": {
          const p = body.payload;
          const cashKopecksMixed =
            p.cashKopecksMixed === undefined
              ? undefined
              : typeof p.cashKopecksMixed === "string"
                ? BigInt(p.cashKopecksMixed)
                : BigInt(p.cashKopecksMixed);
          await this.sell.execute({
            batchId: p.batchId,
            tripId: p.tripId,
            kg: p.kg,
            saleId: p.saleId,
            pricePerKg: p.pricePerKg,
            paymentKind: p.paymentKind,
            cashKopecksMixed,
          });
          break;
        }
        case "ship_to_trip":
          await this.shipToTrip.execute(body.payload);
          break;
        case "record_trip_shortage":
          await this.recordShortage.execute(body.payload);
          break;
        case "receive_on_warehouse":
          await this.receive.execute(body.payload);
          break;
        case "create_trip":
          await this.createTrip.execute(body.payload);
          break;
      }
    } catch (error) {
      const m = mapErrorToSyncRejection(error);
      return {
        status: "rejected",
        actionId: localActionId,
        reason: m.reason,
        resolution: m.resolution,
        errorCode: m.errorCode,
        details: m.details,
      };
    }

    await this.idempotency.markProcessed(deviceId, localActionId);
    return { status: "ok", actionId: localActionId };
  }
}
