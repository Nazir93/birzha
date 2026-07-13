import { describe, expect, it } from "vitest";

import { InMemoryBatchRepository } from "../testing/in-memory-batch.repository.js";
import { InMemoryTripSaleRepository } from "../testing/in-memory-trip-sale.repository.js";
import { InMemoryTripShipmentRepository } from "../testing/in-memory-trip-shipment.repository.js";
import { InMemoryTripShortageRepository } from "../testing/in-memory-trip-shortage.repository.js";
import { InMemoryPurchaseDocumentRepository } from "../../infrastructure/persistence/in-memory-purchase-document.repository.js";
import { StaticProductGradeRepository } from "../../infrastructure/persistence/static-product-grade.repository.js";
import { StaticWarehouseRepository } from "../../infrastructure/persistence/static-warehouse.repository.js";
import { CreatePurchaseDocumentUseCase } from "./create-purchase-document.use-case.js";
import {
  type PurchaseDocumentLinesLockChecker,
  ReplacePurchaseDocumentLinesUseCase,
} from "./replace-purchase-document-lines.use-case.js";
import { PurchaseDocumentLinesLockedError } from "../errors.js";

function emptyLocks(): PurchaseDocumentLinesLockChecker {
  return {
    async batchIdsInLoadingManifests() {
      return [];
    },
    async batchIdsWithQualityRejectReturns() {
      return [];
    },
  };
}

describe("ReplacePurchaseDocumentLinesUseCase", () => {
  async function setup() {
    const batches = new InMemoryBatchRepository();
    const grades = new StaticProductGradeRepository();
    const warehouses = new StaticWarehouseRepository();
    const purchaseDocuments = new InMemoryPurchaseDocumentRepository(
      batches,
      grades,
      new InMemoryTripShipmentRepository(),
      new InMemoryTripSaleRepository(),
      new InMemoryTripShortageRepository(),
    );
    const create = new CreatePurchaseDocumentUseCase(warehouses, grades, purchaseDocuments);
    await create.execute({
      id: "doc-edit",
      documentNumber: "НФ-EDIT",
      docDate: "2026-07-01",
      warehouseId: "wh-manas",
      supplierName: "Тест",
      extraCostKopecks: 0,
      lines: [
        {
          productGradeId: "pg-n5",
          totalKg: 10,
          packageCount: 2,
          pricePerKg: 50,
          lineTotalKopecks: 50_000,
        },
      ],
    });
    return { batches, grades, purchaseDocuments };
  }

  it("меняет кг и цену строк до попадания в ПН", async () => {
    const { batches, grades, purchaseDocuments } = await setup();
    const detail = await purchaseDocuments.findByIdWithLines("doc-edit");
    const batchId = detail!.lines[0]!.batchId;
    const uc = new ReplacePurchaseDocumentLinesUseCase(
      purchaseDocuments,
      grades,
      batches,
      emptyLocks(),
    );

    await uc.execute("doc-edit", {
      lines: [
        {
          batchId,
          productGradeId: "pg-n5",
          totalKg: 12,
          packageCount: 3,
          pricePerKg: 40,
          lineTotalKopecks: 48_000,
        },
      ],
    });

    const after = await purchaseDocuments.findByIdWithLines("doc-edit");
    expect(after!.lines).toHaveLength(1);
    expect(after!.lines[0]!.totalKg).toBe(12);
    expect(after!.lines[0]!.pricePerKg).toBe(40);
    expect(after!.lines[0]!.batchId).toBe(batchId);
    const batch = await batches.findById(batchId);
    expect(batch?.toPersistenceState().totalGrams).toBe(12_000n);
  });

  it("блокирует правку, если партия в погрузочной", async () => {
    const { batches, grades, purchaseDocuments } = await setup();
    const detail = await purchaseDocuments.findByIdWithLines("doc-edit");
    const batchId = detail!.lines[0]!.batchId;
    const uc = new ReplacePurchaseDocumentLinesUseCase(purchaseDocuments, grades, batches, {
      async batchIdsInLoadingManifests() {
        return [batchId];
      },
      async batchIdsWithQualityRejectReturns() {
        return [];
      },
    });

    await expect(
      uc.execute("doc-edit", {
        lines: [
          {
            batchId,
            productGradeId: "pg-n5",
            totalKg: 11,
            pricePerKg: 50,
            lineTotalKopecks: 55_000,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(PurchaseDocumentLinesLockedError);
  });
});
