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

/** Ответ `GET /warehouse-write-offs` без `purchaseDocumentId` — последние списания по всем накладным. */
export type WarehouseWriteOffsRecentResponse = {
  ledger: "recent";
  warehouseIdFilter: string | null;
  limit: number;
  totalKg: number;
  lines: {
    id: string;
    batchId: string;
    kg: number;
    createdAt: string;
    purchaseDocumentId: string;
    documentNumber: string | null;
    productGradeCode: string | null;
    warehouseName: string | null;
    warehouseCode: string | null;
  }[];
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

export type AdminDashboardSummaryResponse = {
  trips: {
    openCount: number;
    closedCount: number;
    shippedKg: number;
    soldKg: number;
    remainingInTripKg: number;
  };
  warehouse: {
    warehouseKg: number;
    batchCount: number;
    byWarehouseKg: Record<string, number>;
    byProductGroupKg: Record<string, number>;
  };
  loadingManifests: {
    activeCount: number;
    withoutTripCount: number;
    activeKg: number;
  };
};

export type StockBalancesResponse = {
  totals: {
    onWarehouseKg: number;
    inTransitKg: number;
    valueWarehouseKopecks: string;
    valueTransitKopecks: string;
  };
  byWarehouse: {
    warehouseId: string;
    warehouseName: string;
    warehouseCode: string;
    onWarehouseKg: number;
    inTransitKg: number;
    valueWarehouseKopecks: string;
    valueTransitKopecks: string;
  }[];
};

export type PurchaseDocumentsListMeta = {
  limit: number;
  offset: number;
  hasMore: boolean;
  totalCount: number;
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

export type PurchaseDocumentsListResponse = {
  purchaseDocuments: PurchaseDocumentSummary[];
  listMeta?: PurchaseDocumentsListMeta;
};

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
  /** Агрегаты из строк накладной (список GET). */
  lineCount: number;
  totalKg: number;
  /** Сумма ящиков по строкам, если были посчитаны при сохранении. */
  packagesApprox: number | null;
  calibers: { label: string; kg: number; packagesApprox: number }[];
};

export type LoadingManifestsListMeta = {
  limit: number;
  offset: number;
  hasMore: boolean;
  totalCount: number;
};

export type LoadingManifestsListResponse = {
  loadingManifests: LoadingManifestSummary[];
  listMeta?: LoadingManifestsListMeta;
};

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
  /** После привязки или отгрузки партий — форма assign-trip скрыта (GET /loading-manifests/:id). */
  tripAssignLocked?: boolean;
  tripAssignLockedReason?: "already_assigned" | "already_shipped" | "no_stock" | null;
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

/** GET /loading-manifests/reserved-batch-ids */
export type LoadingManifestReservedBatchIdsResponse = { batchIds: string[] };

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
  /**
   * Полный список `GET /trips` без query: остаток «в пути» по отчёту (граммы, строка).
   * У подборщика (`?search=` / `limit`) полей нет.
   */
  transitRemainingGrams?: string;
  /** Полный список: был ли товар отгружен в рейс. */
  hasShipmentToTrip?: boolean;
  /** Полный список: отгружено в рейс (граммы, строка). */
  shippedGrams?: string;
  /** Полный список: продано с рейса (граммы, строка). */
  soldGrams?: string;
};

/** Мета для ответа `GET /api/trips?search=&limit=` (подбор без полной выборки). */
export type TripsListMeta = {
  limit: number;
  offset: number;
  hasMore: boolean;
  totalCount?: number;
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

export type WholesalerJson = {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
};

export type WholesalersListResponse = {
  wholesalers: WholesalerJson[];
};

/** Строка журнала продажи с рейса (для правок продавцом). */
export type TripSaleLineJson = {
  id: string;
  tripId: string;
  batchId: string;
  saleId: string;
  kg: string;
  packageCount: string | null;
  pricePerKgKopecks: string;
  revenueKopecks: string;
  cashKopecks: string;
  debtKopecks: string;
  cardTransferKopecks: string;
  saleChannel: "retail" | "wholesale";
  clientLabel: string | null;
  wholesaleBuyerId: string | null;
  recordedAt: string;
};

export type TripSaleLinesResponse = {
  trip: { id: string; status: string };
  lines: TripSaleLineJson[];
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
  /** Сумма ящиков по продажам (если были указаны). */
  totalPackageCount?: string;
  totalRevenueKopecks: string;
  totalCashKopecks: string;
  totalDebtKopecks: string;
  totalCardTransferKopecks: string;
  retailGrams: string;
  wholesaleGrams: string;
  retailRevenueKopecks: string;
  wholesaleRevenueKopecks: string;
  retailCashKopecks: string;
  retailDebtKopecks: string;
  retailCardTransferKopecks: string;
  wholesaleCashKopecks: string;
  wholesaleDebtKopecks: string;
  wholesaleCardTransferKopecks: string;
  byBatch: {
    batchId: string;
    grams: string;
    packageCount?: string;
    revenueKopecks: string;
    cashKopecks: string;
    debtKopecks: string;
    cardTransferKopecks: string;
  }[];
  byClient: {
    clientLabel: string;
    grams: string;
    revenueKopecks: string;
    cashKopecks: string;
    debtKopecks: string;
    cardTransferKopecks: string;
  }[];
  retailByBatch?: SalesBlock["byBatch"];
  wholesaleByBatch?: SalesBlock["byBatch"];
  retailByClient?: SalesBlock["byClient"];
  wholesaleByClient?: SalesBlock["byClient"];
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
  /**
   * Все продажи по рейсу (без фильтра по `recorded_by`), только когда в API для полевого продавца
   * отфильтрован блок `sales`. Нужен для «кг в машине» / плиток продажи с рейса.
   */
  salesForTripStock?: SalesBlock;
  shortage: LedgerBlock;
  financials: FinancialsBlock;
};
