import { describe, expect, it } from "vitest";

import {
  batchesFullListQueryOptions,
  counterpartiesFullListQueryOptions,
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
  it("совпадает с корнями фабрик полных списков", () => {
    expect(tripsFullListQueryOptions().queryKey).toEqual(queryRoots.trips);
    expect(batchesFullListQueryOptions().queryKey).toEqual(queryRoots.batches);
    expect(warehousesFullListQueryOptions().queryKey).toEqual(queryRoots.warehouses);
    expect(productGradesFullListQueryOptions().queryKey).toEqual(queryRoots.productGrades);
    expect(purchaseDocumentsFullListQueryOptions().queryKey).toEqual(queryRoots.purchaseDocuments);
    expect(counterpartiesFullListQueryOptions().queryKey).toEqual(queryRoots.counterparties);
    expect(shipDestinationsFullListQueryOptions().queryKey).toEqual(queryRoots.shipDestinations);
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
});
