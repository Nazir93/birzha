import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import { prefetchCoreLists } from "./prefetch-app-data.js";

describe("prefetchCoreLists", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("не тянет admin dashboard без флага (закупщик)", () => {
    const queryClient = new QueryClient();
    const spy = vi.spyOn(queryClient, "prefetchQuery").mockResolvedValue(undefined);

    prefetchCoreLists(queryClient, { prefetchAdminDashboard: false });

    const keys = spy.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey ?? []));
    expect(keys.some((k) => k.includes("admin-dashboard-summary"))).toBe(false);
    expect(keys.some((k) => k.includes("warehouses"))).toBe(true);
  });

  it("тянет admin dashboard для руководства", () => {
    const queryClient = new QueryClient();
    const spy = vi.spyOn(queryClient, "prefetchQuery").mockResolvedValue(undefined);

    prefetchCoreLists(queryClient, { prefetchAdminDashboard: true });

    const keys = spy.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey ?? []));
    expect(keys.some((k) => k.includes("admin-dashboard-summary"))).toBe(true);
  });
});
