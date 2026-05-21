/** Ящики и масса закупки по строке накладной (для оценки ящиков в рейсе). */
export type PurchaseLinePackageMeta = {
  linePackageCount: bigint;
  purchasedGrams: bigint;
};

export interface PurchaseLinePackageMetaPort {
  findByBatchId(batchId: string): Promise<PurchaseLinePackageMeta | null>;
}
