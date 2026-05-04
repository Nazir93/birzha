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
    /** Ящиков по строке накладной; остаток в ящиках в UI — доля onWarehouse к totalKg. */
    linePackageCount?: number | null;
  };
  /** Какие кг списаны как «брак с остатка» (журнал) — `POST /batches/…/warehouse-write-off` при полном API. */
  qualityRejectWrittenOffKg?: number;
  /** Качество и направление (MVP) — `PATCH /api/batches/:id/allocation` при PostgreSQL. */
  allocation?: {
    qualityTier: string | null;
    destination: string | null;
  };
};

export type WarehouseWriteOffsByDocumentResponse = {
  documentId: string;
  totalKg: number;
  lines: { id: string; batchId: string; kg: number; createdAt: string; productGradeCode: string | null }[];
};

export type BatchesListMeta = {
  limit: number;
  offset: number;
  hasMore: boolean;
};

export type BatchesListResponse = {
  batches: BatchListItem[];
  listMeta?: BatchesListMeta;
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
  /** Автор накладной (`users.id`), если записан при создании. */
  createdByUserId: string | null;
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
  createdByUserId: string | null;
  lines: PurchaseDocumentLineDetail[];
};

export type PurchaseDocumentsListResponse = { purchaseDocuments: PurchaseDocumentSummary[] };

/** Справочник направлений/«городов» (`GET /ship-destinations`) — `code` в `batches.destination`. */
export type ShipDestinationJson = {
  code: string;
  displayName: string;
  sortOrder: number;
  isActive: boolean;
};
export type ShipDestinationsListResponse = { shipDestinations: ShipDestinationJson[] };

export type CreatePurchaseDocumentResponse = { documentId: string };

export type CreateLoadingManifestResponse = { manifestId: string };

export type LoadingManifestSummary = {
  id: string;
  manifestNumber: string;
  docDate: string;
  warehouseId: string;
  warehouseName: string;
  warehouseCode: string;
  destinationCode: string;
  destinationName: string;
  tripId: string | null;
  createdAt: string;
};

export type LoadingManifestsListResponse = { loadingManifests: LoadingManifestSummary[] };

export type LoadingManifestDetail = {
  id: string;
  manifestNumber: string;
  docDate: string;
  warehouseId: string;
  warehouseName: string;
  warehouseCode: string;
  destinationCode: string;
  destinationName: string;
  tripId: string | null;
  createdAt: string;
  lines: {
    lineNo: number;
    batchId: string;
    grams: string;
    kg: number;
    packageCount: string | null;
    purchaseDocumentNumber: string | null;
    productGradeCode: string | null;
    productGroup: string | null;
  }[];
};

export type LoadingManifestDetailResponse = { manifest: LoadingManifestDetail };

/** Ответы `/trips` и `/trips/:id/shipment-report` (согласовано с `register-trip-routes`). */

export type TripJson = {
  id: string;
  tripNumber: string;
  status: string;
  /** ТС (номер / подпись). */
  vehicleLabel: string | null;
  /** Водитель. */
  driverName: string | null;
  /** UTC, ISO-8601. */
  departedAt: string | null;
  /** Полевой продавец; null — рейс ещё не показывается продавцам. */
  assignedSellerUserId: string | null;
};

/** Мета для ответа `GET /api/trips?search=&limit=` (подбор без полной выборки). */
export type TripsListMeta = {
  limit: number;
  offset: number;
  hasMore: boolean;
};

export type TripsListResponse = {
  trips: TripJson[];
  listMeta?: TripsListMeta;
};

/** `GET /api/trips/field-seller-options` — продавцы для назначения на рейс (роли `tripWrite`). */
export type FieldSellerOptionJson = { id: string; login: string };
export type FieldSellerOptionsResponse = { fieldSellers: FieldSellerOptionJson[] };

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
