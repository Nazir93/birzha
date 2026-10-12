import { describe, expect, it } from "vitest";

import { InMemoryBatchWarehouseWriteOffLedger } from "../testing/in-memory-batch-warehouse-write-off-ledger.js";
import {
  availableGramsForLoadingManifestLine,
  batchIdsToReleaseLoadingBlocks,
  physicalFreeGramsForLoadingManifestLine,
} from "./loading-manifest-available-grams.js";
import { planAppendLoadingManifestLineGrams } from "./plan-append-loading-manifest-line-grams.js";
import { planLoadingManifestLinesReduceForReturn } from "./plan-loading-manifest-lines-reduce-for-return.js";

/**
 * Симулятор черновой ПН (без рейса): склад физически не меняется при отборе,
 * возврат из отбора уменьшает строку и ставит blocks_loading; догрузка снимает
 * блокировку (как POST …/add-batches) и снова увеличивает строку.
 */
type DraftManifestBatch = {
  batchId: string;
  warehouseId: string;
  onWarehouseGrams: bigint;
  lineGrams: bigint;
  ledger: InMemoryBatchWarehouseWriteOffLedger;
};

async function availableAfterAppendRelease(b: DraftManifestBatch): Promise<bigint> {
  /** Строка этой черновой ПН резервирует кг (как sumActive… без excludeManifestId). */
  const reserved = b.lineGrams;
  let blocking = (await b.ledger.totalBlockingLoadingGramsByBatchIds([b.batchId])).get(b.batchId) ?? 0n;
  const physicalFreeGrams = physicalFreeGramsForLoadingManifestLine({
    onWarehouseGrams: b.onWarehouseGrams,
    reservedOnOtherManifestsGrams: reserved,
  });
  let availableGrams = availableGramsForLoadingManifestLine({
    onWarehouseGrams: b.onWarehouseGrams,
    reservedOnOtherManifestsGrams: reserved,
    blockingReturnGrams: blocking,
  });
  const releaseIds = batchIdsToReleaseLoadingBlocks(
    [{ batchId: b.batchId, physicalFreeGrams, availableGrams }],
    "when_blocking_reduces_free",
  );
  if (releaseIds.length > 0) {
    await b.ledger.clearBlocksLoadingByBatchIds(releaseIds);
    blocking = 0n;
    availableGrams = availableGramsForLoadingManifestLine({
      onWarehouseGrams: b.onWarehouseGrams,
      reservedOnOtherManifestsGrams: reserved,
      blockingReturnGrams: blocking,
    });
  }
  return availableGrams;
}

/** Возврат из отбора: урезать строку ПН + журнал с blocks_loading. */
async function returnFromSelection(b: DraftManifestBatch, returnGrams: bigint, writeOffId: string): Promise<void> {
  const plan = planLoadingManifestLinesReduceForReturn({
    returnGrams,
    lines: [
      {
        manifestId: "m1",
        batchId: b.batchId,
        lineNo: 1,
        grams: b.lineGrams,
        packageCount: null,
        tripId: null,
        shipmentGramsOnTrip: 0n,
      },
    ],
  });
  expect(plan.length).toBeGreaterThan(0);
  const item = plan[0]!;
  expect(item.reduceGrams).toBe(returnGrams);
  b.lineGrams = item.newGrams;
  await b.ledger.append({
    id: writeOffId,
    batchId: b.batchId,
    grams: returnGrams,
    reason: "quality_reject",
    blocksLoading: true,
  });
}

/** Догрузка в ту же ПН: как add-batches — снять блок, увеличить строку, очистить журнал. */
async function appendToSameManifest(b: DraftManifestBatch): Promise<bigint> {
  const available = await availableAfterAppendRelease(b);
  const linePlan = planAppendLoadingManifestLineGrams({
    existingLineGrams: b.lineGrams > 0n ? b.lineGrams : null,
    availableWarehouseGrams: available,
  });
  if (linePlan.kind === "skip") {
    return 0n;
  }
  b.lineGrams = linePlan.targetGrams;
  await b.ledger.clearBlocksLoadingByBatchIds([b.batchId]);
  await b.ledger.deleteQualityRejectByBatchIds([b.batchId]);
  return linePlan.addGrams;
}

function createBatch(input: {
  batchId: string;
  warehouseId: string;
  totalGrams: bigint;
}): DraftManifestBatch {
  return {
    batchId: input.batchId,
    warehouseId: input.warehouseId,
    onWarehouseGrams: input.totalGrams,
    lineGrams: input.totalGrams,
    ledger: new InMemoryBatchWarehouseWriteOffLedger(),
  };
}

describe("цикл возврат из отбора → догрузка в ту же ПН", () => {
  it("вернул → догрузил → вернул → догрузил (полный объём, 3 круга)", async () => {
    const b = createBatch({
      batchId: "b-cycle",
      warehouseId: "wh-manas",
      totalGrams: 100_000n,
    });
    expect(b.lineGrams).toBe(100_000n);

    for (let round = 1; round <= 3; round += 1) {
      await returnFromSelection(b, 100_000n, `wo-full-${round}`);
      expect(b.lineGrams, `после возврата круг ${round}`).toBe(0n);
      const blocking = (await b.ledger.totalBlockingLoadingGramsByBatchIds([b.batchId])).get(b.batchId) ?? 0n;
      expect(blocking, `блок после возврата круг ${round}`).toBe(100_000n);

      // Новая ПН (режим never) — полностью возвращённую не берёт.
      const blockedForNew = availableGramsForLoadingManifestLine({
        onWarehouseGrams: b.onWarehouseGrams,
        reservedOnOtherManifestsGrams: 0n,
        blockingReturnGrams: blocking,
      });
      expect(blockedForNew, `новая ПН не берёт возврат круг ${round}`).toBe(0n);
      expect(
        batchIdsToReleaseLoadingBlocks(
          [{ batchId: b.batchId, physicalFreeGrams: 100_000n, availableGrams: 0n }],
          "never",
        ),
      ).toEqual([]);

      const added = await appendToSameManifest(b);
      expect(added, `догрузка круг ${round}`).toBe(100_000n);
      expect(b.lineGrams, `строка после догрузки круг ${round}`).toBe(100_000n);
      const blockingAfter =
        (await b.ledger.totalBlockingLoadingGramsByBatchIds([b.batchId])).get(b.batchId) ?? 0n;
      expect(blockingAfter, `журнал очищен круг ${round}`).toBe(0n);
    }
  });

  it("частичный возврат → догрузка хвоста несколько раз", async () => {
    const b = createBatch({
      batchId: "b-partial",
      warehouseId: "wh-manas",
      totalGrams: 200_000n,
    });

    for (let round = 1; round <= 4; round += 1) {
      await returnFromSelection(b, 50_000n, `wo-part-${round}`);
      expect(b.lineGrams).toBe(150_000n);

      const added = await appendToSameManifest(b);
      expect(added).toBe(50_000n);
      expect(b.lineGrams).toBe(200_000n);
      const blocking =
        (await b.ledger.totalBlockingLoadingGramsByBatchIds([b.batchId])).get(b.batchId) ?? 0n;
      expect(blocking).toBe(0n);
    }
  });

  it("два склада: каждый свой цикл возврат↔догрузка, без смешивания", async () => {
    const manas = createBatch({
      batchId: "b-manas",
      warehouseId: "wh-manas",
      totalGrams: 80_000n,
    });
    const derbent = createBatch({
      batchId: "b-derbent",
      warehouseId: "wh-derbent",
      totalGrams: 120_000n,
    });

    for (let round = 1; round <= 2; round += 1) {
      await returnFromSelection(manas, 30_000n, `wo-m-${round}`);
      await returnFromSelection(derbent, 40_000n, `wo-d-${round}`);
      expect(manas.lineGrams).toBe(50_000n);
      expect(derbent.lineGrams).toBe(80_000n);

      // Чужой склад не участвует в доступности этой партии.
      expect(manas.warehouseId).not.toBe(derbent.warehouseId);

      const addedM = await appendToSameManifest(manas);
      const addedD = await appendToSameManifest(derbent);
      expect(addedM).toBe(30_000n);
      expect(addedD).toBe(40_000n);
      expect(manas.lineGrams).toBe(80_000n);
      expect(derbent.lineGrams).toBe(120_000n);
    }

    // Полный возврат на одном складе не трогает другой.
    await returnFromSelection(manas, 80_000n, "wo-m-final");
    expect(manas.lineGrams).toBe(0n);
    expect(derbent.lineGrams).toBe(120_000n);
    const addedD = await appendToSameManifest(derbent);
    expect(addedD).toBe(0n);
    expect(derbent.lineGrams).toBe(120_000n);

    const addedM = await appendToSameManifest(manas);
    expect(addedM).toBe(80_000n);
    expect(manas.lineGrams).toBe(80_000n);
  });

  it("после догрузки снова можно вернуть меньший остаток и снова догрузить", async () => {
    const b = createBatch({
      batchId: "b-steps",
      warehouseId: "wh-a",
      totalGrams: 90_000n,
    });

    const steps = [20_000n, 45_000n, 90_000n, 10_000n, 90_000n] as const;
    for (let i = 0; i < steps.length; i += 1) {
      const ret = steps[i]!;
      await returnFromSelection(b, ret, `wo-step-${i}`);
      expect(b.lineGrams).toBe(90_000n - ret);
      const added = await appendToSameManifest(b);
      expect(added).toBe(ret);
      expect(b.lineGrams).toBe(90_000n);
    }
  });
});

describe("новая ПН vs догрузка после возврата", () => {
  it("полностью возвращённая партия: never не разблокирует, append — разблокирует", async () => {
    const ledger = new InMemoryBatchWarehouseWriteOffLedger();
    await ledger.append({
      id: "wo1",
      batchId: "b1",
      grams: 50_000n,
      reason: "quality_reject",
      blocksLoading: true,
    });
    const onWh = 50_000n;
    const blocking = (await ledger.totalBlockingLoadingGramsByBatchIds(["b1"])).get("b1") ?? 0n;
    const available = availableGramsForLoadingManifestLine({
      onWarehouseGrams: onWh,
      reservedOnOtherManifestsGrams: 0n,
      blockingReturnGrams: blocking,
    });
    expect(available).toBe(0n);
    expect(
      batchIdsToReleaseLoadingBlocks(
        [{ batchId: "b1", physicalFreeGrams: onWh, availableGrams: available }],
        "never",
      ),
    ).toEqual([]);
    expect(
      batchIdsToReleaseLoadingBlocks(
        [{ batchId: "b1", physicalFreeGrams: onWh, availableGrams: available }],
        "when_blocking_reduces_free",
      ),
    ).toEqual(["b1"]);
  });
});
