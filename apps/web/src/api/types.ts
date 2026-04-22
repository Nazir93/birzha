/** Ответ `GET /batches` (согласовано с `batch-serialize.ts`). */

export type BatchListItem = {
  id: string;
  purchaseId: string;
  totalKg: number;
  pricePerKg: number;
  pendingInboundKg: number;
  onWarehouseKg: number;
  inTransitKg: number;
  soldKg: number;
  writtenOffKg: number;
  /** Если партия из строки закупочной накладной (PostgreSQL). */
  nakladnaya?: {
    documentId: string | null;
    /** Склад поступления по накладной (для фильтров в «Распределении»). */
    warehouseId: string | null;
    productGradeCode: string | null;
    /** Вид товара из справочника (помидоры, огурцы…). */
    productGroup: string | null;
    documentNumber: string | null;
  };
  /** Качество и направление (MVP) — `PATCH /api/batches/:id/allocation` при PostgreSQL. */
  allocation?: {
    qualityTier: string | null;
    destination: string | null;
  };
};

export type BatchesListResponse = {
  batches: BatchListItem[];
};

export type WarehouseJson = { id: string; code: string; name: string };
export type WarehousesListResponse = { warehouses: WarehouseJson[] };
export type CreateWarehouseResponse = { warehouse: WarehouseJson };

export type ProductGradeJson = {
  id: string;
  code: string;
  displayName: string;
  /** Вид товара для групп в накладной (помидоры, огурцы…); у разных групп свои калибры. */
  productGroup: string | null;
  sortOrder: number;
};
export type ProductGradesListResponse = { productGrades: ProductGradeJson[] };
export type CreateProductGradeResponse = { productGrade: ProductGradeJson };

export type PurchaseDocumentSummary = {
  id: string;
  documentNumber: string;
  docDate: string;
  warehouseId: string;
  lineCount: number;
};

/** Строка `GET /purchase-documents/:id` — согласовано с `PurchaseDocumentDetail` в API. */
export type PurchaseDocumentLineDetail = {
  lineNo: number;
  productGradeId: string;
  productGradeCode: string;
  batchId: string;
  totalKg: number;
  packageCount: string | null;
  pricePerKg: number;
  lineTotalKopecks: string;
};

export type PurchaseDocumentDetail = {
  id: string;
  documentNumber: string;
  docDate: string;
  supplierName: string | null;
  buyerLabel: string | null;
  warehouseId: string;
  extraCostKopecks: string;
  createdAt: string | null;
  lines: PurchaseDocumentLineDetail[];
};

export type PurchaseDocumentsListResponse = { purchaseDocuments: PurchaseDocumentSummary[] };

export type CreatePurchaseDocumentResponse = { documentId: string };

/** Ответы `/trips` и `/trips/:id/shipment-report` (согласовано с `register-trip-routes`). */

export type TripJson = {
  id: string;
  tripNumber: string;
  status: string;
};

export type TripsListResponse = {
  trips: TripJson[];
};

export type CounterpartyJson = {
  id: string;
  displayName: string;
};

export type CounterpartiesListResponse = {
  counterparties: CounterpartyJson[];
};

export type LedgerBlock = {
  totalGrams: string;
  byBatch: { batchId: string; grams: string }[];
};

/** Блок `shipment` в отчёте по рейсу: отгрузка с опциональным учётом ящиков. */
export type ShipmentLedgerBlock = {
  totalGrams: string;
  totalPackageCount: string;
  byBatch: { batchId: string; grams: string; packageCount: string }[];
};

export type SalesBlock = {
  totalGrams: string;
  totalRevenueKopecks: string;
  totalCashKopecks: string;
  totalDebtKopecks: string;
  byBatch: {
    batchId: string;
    grams: string;
    revenueKopecks: string;
    cashKopecks: string;
    debtKopecks: string;
  }[];
  byClient: {
    clientLabel: string;
    grams: string;
    revenueKopecks: string;
    cashKopecks: string;
    debtKopecks: string;
  }[];
};

export type FinancialsBlock = {
  revenueKopecks: string;
  costOfSoldKopecks: string;
  costOfShortageKopecks: string;
  grossProfitKopecks: string;
};

export type ShipmentReportResponse = {
  trip: TripJson;
  shipment: ShipmentLedgerBlock;
  sales: SalesBlock;
  shortage: LedgerBlock;
  financials: FinancialsBlock;
};
