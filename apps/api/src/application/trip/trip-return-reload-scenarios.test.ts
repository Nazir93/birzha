import { Batch, gramsToKg } from "@birzha/domain";
import { describe, expect, it } from "vitest";

import { RecordWarehouseWriteOffUseCase } from "../batch/record-warehouse-write-off.use-case.js";
import { InMemoryBatchRepository } from "../testing/in-memory-batch.repository.js";
import { InMemoryBatchWarehouseWriteOffLedger } from "../testing/in-memory-batch-warehouse-write-off-ledger.js";
import { InMemoryTripRepository } from "../testing/in-memory-trip.repository.js";
import { InMemoryTripShipmentRepository } from "../testing/in-memory-trip-shipment.repository.js";
import { kgToGrams } from "../units/mass.js";
import {
  availableGramsForLoadingManifestLine,
  batchIdsToReleaseLoadingBlocks,
  physicalFreeGramsForLoadingManifestLine,
} from "./loading-manifest-available-grams.js";
import { planAppendLoadingManifestLineGrams } from "./plan-append-loading-manifest-line-grams.js";
import { planLoadingManifestLinesReduceForReturn } from "./plan-loading-manifest-lines-reduce-for-return.js";
import { CreateTripUseCase } from "./create-trip.use-case.js";
import { ShipToTripUseCase } from "./ship-to-trip.use-case.js";
import { unshipLoadingManifestBatchesFromTrip } from "./loading-manifest-unship-from-trip.js";

/**
 * Сценарии: списал с рейса A → можно погрузить в рейс B;
 * возврат из чернового отбора не идёт в новую ПН, но догружается в ту же;
 * цифры доступности согласованы с режимами create / append.
 */
describe("сценарии: возврат с рейса → погрузка в другой рейс", () => {
  it("полный возврат с рейса A → отгрузка на рейс B (blocks_loading=false)", async () => {
    const batches = new InMemoryBatchRepository();
    const trips = new InMemoryTripRepository();
    const shipments = new InMemoryTripShipmentRepository();
    const ledger = new InMemoryBatchWarehouseWriteOffLedger();
    await new CreateTripUseCase(trips).execute({ id: "trip-a", tripNumber: "A-01" });
    await new CreateTripUseCase(trips).execute({ id: "trip-b", tripNumber: "B-01" });

    const batch = Batch.create({
      id: "b-cross",
      purchaseId: "p-1",
      totalKg: 200,
      pricePerKg: 10,
      distribution: "on_hand",
    });
    await batches.save(batch);

    const ship = new ShipToTripUseCase(batches, trips, shipments);
    await ship.execute({ batchId: "b-cross", kg: 200, tripId: "trip-a" });
    expect(gramsToKg((await batches.findById("b-cross"))!.toPersistenceState().inTransitGrams)).toBe(200);
    expect(gramsToKg((await batches.findById("b-cross"))!.toPersistenceState().onWarehouseGrams)).toBe(0);

    const writeOff = new RecordWarehouseWriteOffUseCase(batches, ledger, async (fn) => {
      await fn(batches, ledger, {
        reduceActiveLoadingManifestLines: async (batchId, grams) => {
          const plan = planLoadingManifestLinesReduceForReturn({
            returnGrams: grams,
            lines: [
              {
                manifestId: "m-a",
                batchId,
                lineNo: 1,
                grams,
                packageCount: null,
                tripId: "trip-a",
                shipmentGramsOnTrip: grams,
              },
            ],
          });
          for (const step of plan) {
            if (step.unshipGrams > 0n && step.tripId) {
              const b = await batches.findByIdForUpdate(batchId);
              b!.receiveBack(gramsToKg(step.unshipGrams), "warehouse_return_adjust_loading_manifest");
              await batches.save(b!);
              await shipments.reduceForTripAndBatch(step.tripId, batchId, step.unshipGrams, null);
            }
          }
        },
      });
    });

    await writeOff.execute({ batchId: "b-cross", kg: 200, reason: "quality_reject" });

    const afterReturn = (await batches.findById("b-cross"))!.toPersistenceState();
    expect(gramsToKg(afterReturn.onWarehouseGrams)).toBe(200);
    expect(gramsToKg(afterReturn.inTransitGrams)).toBe(0);
    const blocking = (await ledger.totalBlockingLoadingGramsByBatchIds(["b-cross"])).get("b-cross") ?? 0n;
    expect(blocking, "возврат с рейса не блокирует новую погрузку").toBe(0n);

    const forNewPn = availableGramsForLoadingManifestLine({
      onWarehouseGrams: afterReturn.onWarehouseGrams,
      reservedOnOtherManifestsGrams: 0n,
      blockingReturnGrams: blocking,
    });
    expect(forNewPn).toBe(200_000n);

    await ship.execute({ batchId: "b-cross", kg: 200, tripId: "trip-b" });
    const onB = await shipments.aggregateByTripId("trip-b");
    expect(onB.totalGrams).toBe(200_000n);
    const onA = await shipments.totalGramsForTripAndBatch("trip-a", "b-cross");
    expect(onA).toBe(0n);
  });

  it("частичный возврат с рейса A → хвост на B, остаток остаётся на A", async () => {
    const batches = new InMemoryBatchRepository();
    const trips = new InMemoryTripRepository();
    const shipments = new InMemoryTripShipmentRepository();
    const ledger = new InMemoryBatchWarehouseWriteOffLedger();
    await new CreateTripUseCase(trips).execute({ id: "trip-a", tripNumber: "A-02" });
    await new CreateTripUseCase(trips).execute({ id: "trip-b", tripNumber: "B-02" });

    const batch = Batch.create({
      id: "b-part",
      purchaseId: "p-1",
      totalKg: 100,
      pricePerKg: 10,
      distribution: "on_hand",
    });
    await batches.save(batch);
    const ship = new ShipToTripUseCase(batches, trips, shipments);
    await ship.execute({ batchId: "b-part", kg: 100, tripId: "trip-a", packageCount: 10 });

    const writeOff = new RecordWarehouseWriteOffUseCase(batches, ledger, async (fn) => {
      await fn(batches, ledger, {
        reduceActiveLoadingManifestLines: async (batchId, grams) => {
          const b = await batches.findByIdForUpdate(batchId);
          b!.receiveBack(gramsToKg(grams), "warehouse_return_adjust_loading_manifest");
          await batches.save(b!);
          await shipments.reduceForTripAndBatch("trip-a", batchId, grams, 4n);
        },
      });
    });
    await writeOff.execute({ batchId: "b-part", kg: 40, reason: "quality_reject" });

    expect(gramsToKg((await batches.findById("b-part"))!.toPersistenceState().onWarehouseGrams)).toBe(40);
    expect(gramsToKg((await batches.findById("b-part"))!.toPersistenceState().inTransitGrams)).toBe(60);
    expect(await shipments.totalGramsForTripAndBatch("trip-a", "b-part")).toBe(60_000n);

    const blocking = (await ledger.totalBlockingLoadingGramsByBatchIds(["b-part"])).get("b-part") ?? 0n;
    expect(blocking).toBe(0n);
    const freeForB = availableGramsForLoadingManifestLine({
      onWarehouseGrams: 40_000n,
      reservedOnOtherManifestsGrams: 0n,
      blockingReturnGrams: blocking,
    });
    expect(freeForB).toBe(40_000n);

    await ship.execute({ batchId: "b-part", kg: 40, tripId: "trip-b" });
    expect(await shipments.aggregateByTripId("trip-b")).toMatchObject({ totalGrams: 40_000n });
    expect(await shipments.totalGramsForTripAndBatch("trip-a", "b-part")).toBe(60_000n);
  });

  it("открепление (unship) с рейса A → полная погрузка на рейс B", async () => {
    const batches = new InMemoryBatchRepository();
    const trips = new InMemoryTripRepository();
    const shipments = new InMemoryTripShipmentRepository();
    await new CreateTripUseCase(trips).execute({ id: "trip-a", tripNumber: "A-03" });
    await new CreateTripUseCase(trips).execute({ id: "trip-b", tripNumber: "B-03" });

    const batch = Batch.create({
      id: "b-detach",
      purchaseId: "p-1",
      totalKg: 150,
      pricePerKg: 10,
      distribution: "on_hand",
    });
    batch.shipToTrip(150, "trip-a");
    await batches.save(batch);
    await shipments.append({
      id: "sh-a",
      tripId: "trip-a",
      batchId: "b-detach",
      grams: 150_000n,
      packageCount: 15n,
    });

    await unshipLoadingManifestBatchesFromTrip({
      tripId: "trip-a",
      manifestGramsByBatch: new Map([["b-detach", { grams: 150_000n, packageCount: 15n }]]),
      shipmentGramsByBatch: new Map([["b-detach", 150_000n]]),
      batches,
      shipments,
      reason: "detach",
    });

    expect(gramsToKg((await batches.findById("b-detach"))!.toPersistenceState().onWarehouseGrams)).toBe(150);
    expect(await shipments.totalGramsForTripAndBatch("trip-a", "b-detach")).toBe(0n);

    await new ShipToTripUseCase(batches, trips, shipments).execute({
      batchId: "b-detach",
      kg: 150,
      tripId: "trip-b",
    });
    expect((await shipments.aggregateByTripId("trip-b")).totalGrams).toBe(150_000n);
  });
});

describe("сценарии: вернул на склад → выборочно обратно на тот же рейс", () => {
  it("вернули 40 кг → догрузили только 15 → в строке +15, на складе хвост 25", () => {
    // Было 100 в ПН/рейсе, вернули 40 — строка 60, свободно 40.
    const existingLineGrams = 60_000n;
    const freeOnWarehouse = 40_000n;
    const partialReload = planAppendLoadingManifestLineGrams({
      existingLineGrams,
      availableWarehouseGrams: freeOnWarehouse,
      requestedAddGrams: 15_000n,
    });
    expect(partialReload).toEqual({
      kind: "increase",
      targetGrams: 75_000n,
      addGrams: 15_000n,
    });
    const leftoverFree = freeOnWarehouse - (partialReload.kind === "skip" ? 0n : partialReload.addGrams);
    expect(leftoverFree).toBe(25_000n);

    // Второй раз — ещё 25 на тот же рейс
    const second = planAppendLoadingManifestLineGrams({
      existingLineGrams: 75_000n,
      availableWarehouseGrams: 25_000n,
      requestedAddGrams: 25_000n,
    });
    expect(second).toEqual({ kind: "increase", targetGrams: 100_000n, addGrams: 25_000n });
  });

  it("просили больше хвоста — берём только доступное", () => {
    expect(
      planAppendLoadingManifestLineGrams({
        existingLineGrams: 70_000n,
        availableWarehouseGrams: 30_000n,
        requestedAddGrams: 100_000n,
      }),
    ).toEqual({ kind: "increase", targetGrams: 100_000n, addGrams: 30_000n });
  });
});

describe("сценарии: возврат из отбора vs догрузка vs новая ПН", () => {
  it("возврат из черновика блокирует новую ПН, догрузка в ту же — снимает блок и возвращает кг в строку", async () => {
    const ledger = new InMemoryBatchWarehouseWriteOffLedger();
    const onWh = 100_000n;
    let lineGrams = 100_000n;

    // Возврат из отбора
    const returnGrams = 35_000n;
    const plan = planLoadingManifestLinesReduceForReturn({
      returnGrams,
      lines: [
        {
          manifestId: "m1",
          batchId: "b1",
          lineNo: 1,
          grams: lineGrams,
          packageCount: 10n,
          tripId: null,
          shipmentGramsOnTrip: 0n,
        },
      ],
    });
    lineGrams = plan[0]!.newGrams;
    await ledger.append({
      id: "wo-sel",
      batchId: "b1",
      grams: returnGrams,
      reason: "quality_reject",
      blocksLoading: true,
    });
    expect(lineGrams).toBe(65_000n);

    const blocking = (await ledger.totalBlockingLoadingGramsByBatchIds(["b1"])).get("b1") ?? 0n;
    expect(blocking).toBe(35_000n);

    // Новая ПН (never): не берёт возвращённое
    const availNew = availableGramsForLoadingManifestLine({
      onWarehouseGrams: onWh,
      reservedOnOtherManifestsGrams: 0n,
      blockingReturnGrams: blocking,
    });
    expect(availNew).toBe(65_000n);
    expect(
      batchIdsToReleaseLoadingBlocks(
        [
          {
            batchId: "b1",
            physicalFreeGrams: onWh,
            availableGrams: availNew,
          },
        ],
        "never",
      ),
    ).toEqual([]);

    // Полный возврат из отбора — в новую ПН 0
    await ledger.append({
      id: "wo-sel-2",
      batchId: "b1",
      grams: 65_000n,
      reason: "quality_reject",
      blocksLoading: true,
    });
    lineGrams = 0n;
    const blockingFull = (await ledger.totalBlockingLoadingGramsByBatchIds(["b1"])).get("b1") ?? 0n;
    expect(
      availableGramsForLoadingManifestLine({
        onWarehouseGrams: onWh,
        reservedOnOtherManifestsGrams: 0n,
        blockingReturnGrams: blockingFull,
      }),
    ).toBe(0n);

    // Догрузка в ту же ПН: резерв = строка (0), снять блок, добавить хвост
    const reserved = lineGrams;
    let blockingNow = blockingFull;
    const physical = physicalFreeGramsForLoadingManifestLine({
      onWarehouseGrams: onWh,
      reservedOnOtherManifestsGrams: reserved,
    });
    let avail = availableGramsForLoadingManifestLine({
      onWarehouseGrams: onWh,
      reservedOnOtherManifestsGrams: reserved,
      blockingReturnGrams: blockingNow,
    });
    expect(physical).toBe(100_000n);
    expect(avail).toBe(0n);
    const release = batchIdsToReleaseLoadingBlocks(
      [{ batchId: "b1", physicalFreeGrams: physical, availableGrams: avail }],
      "when_blocking_reduces_free",
    );
    expect(release).toEqual(["b1"]);
    await ledger.clearBlocksLoadingByBatchIds(release);
    blockingNow = 0n;
    avail = availableGramsForLoadingManifestLine({
      onWarehouseGrams: onWh,
      reservedOnOtherManifestsGrams: reserved,
      blockingReturnGrams: blockingNow,
    });
    const appendPlan = planAppendLoadingManifestLineGrams({
      existingLineGrams: null,
      availableWarehouseGrams: avail,
    });
    expect(appendPlan).toEqual({ kind: "insert", targetGrams: 100_000n, addGrams: 100_000n });
    await ledger.deleteQualityRejectByBatchIds(["b1"]);
    expect((await ledger.totalBlockingLoadingGramsByBatchIds(["b1"])).get("b1") ?? 0n).toBe(0n);
  });

  it("несколько кругов: рейс A → возврат → рейс B → возврат → рейс A", async () => {
    const batches = new InMemoryBatchRepository();
    const trips = new InMemoryTripRepository();
    const shipments = new InMemoryTripShipmentRepository();
    const ledger = new InMemoryBatchWarehouseWriteOffLedger();
    await new CreateTripUseCase(trips).execute({ id: "trip-a", tripNumber: "A-loop" });
    await new CreateTripUseCase(trips).execute({ id: "trip-b", tripNumber: "B-loop" });

    const batch = Batch.create({
      id: "b-loop",
      purchaseId: "p-1",
      totalKg: 80,
      pricePerKg: 10,
      distribution: "on_hand",
    });
    await batches.save(batch);
    const ship = new ShipToTripUseCase(batches, trips, shipments);

    const returnFromTrip = async (tripId: string, kg: number) => {
      const grams = kgToGrams(kg);
      const uc = new RecordWarehouseWriteOffUseCase(batches, ledger, async (fn) => {
        await fn(batches, ledger, {
          reduceActiveLoadingManifestLines: async (batchId, g) => {
            const b = await batches.findByIdForUpdate(batchId);
            b!.receiveBack(gramsToKg(g), "warehouse_return_adjust_loading_manifest");
            await batches.save(b!);
            await shipments.reduceForTripAndBatch(tripId, batchId, g, null);
          },
        });
      });
      await uc.execute({ batchId: "b-loop", kg, reason: "quality_reject" });
      // После догрузки/новой ПН журнал с рейса чистят clear+delete; здесь имитируем готовность к новому кругу.
      await ledger.deleteQualityRejectByBatchIds(["b-loop"]);
      expect(grams).toBeGreaterThan(0n);
    };

    await ship.execute({ batchId: "b-loop", kg: 80, tripId: "trip-a" });
    await returnFromTrip("trip-a", 80);
    expect(gramsToKg((await batches.findById("b-loop"))!.toPersistenceState().onWarehouseGrams)).toBe(80);

    await ship.execute({ batchId: "b-loop", kg: 80, tripId: "trip-b" });
    expect((await shipments.aggregateByTripId("trip-b")).totalGrams).toBe(80_000n);
    await returnFromTrip("trip-b", 80);

    await ship.execute({ batchId: "b-loop", kg: 80, tripId: "trip-a" });
    expect((await shipments.aggregateByTripId("trip-a")).totalGrams).toBe(80_000n);
    expect((await shipments.aggregateByTripId("trip-b")).totalGrams).toBe(0n);
  });
});
