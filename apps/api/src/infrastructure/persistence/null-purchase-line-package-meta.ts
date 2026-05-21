import type {
  PurchaseLinePackageMeta,
  PurchaseLinePackageMetaPort,
} from "../../application/ports/purchase-line-package-meta.port.js";

/** In-memory / тесты без PostgreSQL — ящики из накладной не подставляются. */
export class NullPurchaseLinePackageMetaPort implements PurchaseLinePackageMetaPort {
  async findByBatchId(): Promise<PurchaseLinePackageMeta | null> {
    return null;
  }
}
