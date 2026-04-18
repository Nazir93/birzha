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
    productGradeCode: string | null;
    documentNumber: string | null;
  };
};

export type BatchesListResponse = {
  batches: BatchListItem[];
};

export type WarehouseJson = { id: string; code: string; name: string };
export type WarehousesListResponse = { warehouses: WarehouseJson[] };

export type ProductGradeJson = {
  id: string;
  code: string;
  displayName: string;
  sortOrder: number;
};
export type ProductGradesListResponse = { productGrades: ProductGradeJson[] };

export type PurchaseDocumentSummary = {
  id: string;
  documentNumber: string;
  docDate: string;
  warehouseId: string;
  lineCount: number;
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
  shipment: LedgerBlock;
  sales: SalesBlock;
  shortage: LedgerBlock;
  financials: FinancialsBlock;
};
