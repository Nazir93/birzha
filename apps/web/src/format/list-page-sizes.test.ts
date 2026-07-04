import { describe, expect, it } from "vitest";

import { clampListPageIndex, listPageCount, sliceListPage } from "./list-page-sizes.js";

describe("list-page-sizes helpers", () => {
  it("listPageCount — минимум одна страница", () => {
    expect(listPageCount(0, 15)).toBe(1);
    expect(listPageCount(15, 15)).toBe(1);
    expect(listPageCount(16, 15)).toBe(2);
  });

  it("sliceListPage и clampListPageIndex", () => {
    const items = [1, 2, 3, 4, 5];
    expect(sliceListPage(items, 0, 2)).toEqual([1, 2]);
    expect(sliceListPage(items, 1, 2)).toEqual([3, 4]);
    expect(clampListPageIndex(99, 5, 2)).toBe(2);
  });
});
