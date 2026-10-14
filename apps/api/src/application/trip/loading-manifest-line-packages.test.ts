import { describe, expect, it } from "vitest";

import { packagesForNewManifestLine } from "./loading-manifest-line-packages.js";

const base = {
  purchaseLinePackageCount: 150n,
  totalGrams: 1_275_000n,
  physicalFreeGrams: 1_275_000n,
};

describe("packagesForNewManifestLine", () => {
  it("без явных ящиков — доля от закупки", () => {
    expect(
      packagesForNewManifestLine({
        ...base,
        lineGrams: 275_000n,
        packagesInManifests: null,
        blockingReturnPackages: null,
      }),
    ).toBe(32n);
  });

  it("возврат из отбора 100 ящ. — в ПН 150−100=50, не 32", () => {
    expect(
      packagesForNewManifestLine({
        ...base,
        lineGrams: 275_000n,
        packagesInManifests: null,
        blockingReturnPackages: 100n,
      }),
    ).toBe(50n);
  });

  it("после частичной погрузки 125 ящ. — хвост 25", () => {
    expect(
      packagesForNewManifestLine({
        ...base,
        lineGrams: 275_000n,
        physicalFreeGrams: 275_000n,
        packagesInManifests: 125n,
        blockingReturnPackages: null,
      }),
    ).toBe(25n);
  });

  it("возврат без ящиков при факте ПН — доля от хвоста по кг", () => {
    expect(
      packagesForNewManifestLine({
        ...base,
        lineGrams: 100_000n,
        physicalFreeGrams: 200_000n,
        packagesInManifests: 100n,
        blockingReturnPackages: null,
      }),
    ).toBe(25n);
  });

  it("без ящиков в закупке — null", () => {
    expect(
      packagesForNewManifestLine({
        ...base,
        purchaseLinePackageCount: null,
        lineGrams: 275_000n,
        packagesInManifests: 10n,
        blockingReturnPackages: 5n,
      }),
    ).toBeNull();
  });
});
