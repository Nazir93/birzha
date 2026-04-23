import { ResourceInUseError, WarehouseNotFoundError } from "../errors.js";
import type { BatchRepository } from "../ports/batch-repository.port.js";
import type { PurchaseDocumentRepository } from "../ports/purchase-document-repository.port.js";
import type { WarehouseRepository } from "../ports/warehouse-repository.port.js";

export class DeleteWarehouseUseCase {
  constructor(
    private readonly warehouses: WarehouseRepository,
    private readonly purchaseDocuments: PurchaseDocumentRepository,
    private readonly batches: BatchRepository,
  ) {}

  async execute(warehouseId: string): Promise<void> {
    if (!(await this.warehouses.findById(warehouseId))) {
      throw new WarehouseNotFoundError(warehouseId);
    }
    const docs = await this.purchaseDocuments.listSummaries();
    if (docs.some((d) => d.warehouseId === warehouseId)) {
      throw new ResourceInUseError(
        "warehouse",
        "Склад используется в накладных; сначала удалите или измените накладные.",
      );
    }
    for (const b of await this.batches.list()) {
      const w = b.getWarehouseId();
      if (w && w === warehouseId) {
        throw new ResourceInUseError(
          "warehouse",
          "Склад указан в партиях; сначала уберите привязку или удалите накладные, породившие партии.",
        );
      }
    }
    await this.warehouses.deleteById(warehouseId);
  }
}
