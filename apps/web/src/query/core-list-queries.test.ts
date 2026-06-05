import { describe, expect, it } from "vitest";

import {
  batchesFullListQueryOptions,
  counterpartiesFullListQueryOptions,
  loadingManifestReservedBatchIdsQueryOptions,
  productGradesFullListQueryOptions,
  purchaseDocumentsFullListQueryOptions,
  queryRoots,
  shipmentReportQueryOptions,
  shipDestinationsFullListQueryOptions,
  tripsFieldSellerOptionsQueryOptions,
  tripsFullListQueryOptions,
  warehousesFullListQueryOptions,
} from "./core-list-queries.js";

describe("core-list-queries / queryRoots", () => {
  it("picker и legacy-фабрики используют корни или осмысленные префиксы", () => {
    expect(tripsFullListQueryOptions().queryKey[0]).toBe(queryRoots.trips[0]);
    expect(batchesFullListQueryOptions().queryKey[0]).toBe(queryRoots.batches[0]);
    expect(warehousesFullListQueryOptions().queryKey).toEqual(queryRoots.warehouses);
    expect(purchaseDocumentsFullListQueryOptions().queryKey[0]).toEqual(queryRoots.purchaseDocuments[0]);
    expect(counterpartiesFullListQueryOptions().queryKey).toEqual(queryRoots.counterparties);
  });

  it("shipment-report начинается с общего префикса", () => {
    const opt = shipmentReportQueryOptions("trip-uuid-1");
    expect(opt.queryKey[0]).toBe(queryRoots.shipmentReport[0]);
    expect(opt.queryKey).toEqual(["shipment-report", "trip-uuid-1"]);
  });

  it("field-seller-options лежит под корнем trips", () => {
    const opt = tripsFieldSellerOptionsQueryOptions();
    expect(opt.queryKey[0]).toBe(queryRoots.trips[0]);
    expect(opt.queryKey).toEqual(["trips", "field-seller-options"]);
  });

  it("reserved-batch-ids под префиксом loading-manifest", () => {
    const opt = loadingManifestReservedBatchIdsQueryOptions("wh-1");
    expect(opt.queryKey[0]).toBe(queryRoots.loadingManifest[0]);
    expect(opt.queryKey).toEqual(["loading-manifest", "reserved-batch-ids", "wh-1"]);
  });
});
