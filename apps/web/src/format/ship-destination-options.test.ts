import { describe, expect, it } from "vitest";

import type { ShipDestinationJson } from "../api/types.js";
import {
  activeShipDestinationsForSelect,
  shipDestinationLabelByCode,
} from "./ship-destination-options.js";

function dest(p: Partial<ShipDestinationJson> & Pick<ShipDestinationJson, "code">): ShipDestinationJson {
  return {
    displayName: p.code,
    sortOrder: 0,
    isActive: true,
    ...p,
  };
}

describe("activeShipDestinationsForSelect", () => {
  it("оставляет только активные города и сортирует", () => {
    const rows = activeShipDestinationsForSelect([
      dest({ code: "moscow", displayName: "Москва", sortOrder: 10, isActive: false }),
      dest({ code: "002", displayName: "Астрахань", sortOrder: 2, isActive: true }),
      dest({ code: "001", displayName: "Москва", sortOrder: 1, isActive: true }),
      dest({ code: "regions", displayName: "Регионы", sortOrder: 20, isActive: false }),
      dest({ code: "discount", displayName: "Уценка / распродажа", sortOrder: 30, isActive: true }),
      dest({ code: "writeoff", displayName: "Списание", sortOrder: 40, isActive: true }),
    ]);
    expect(rows.map((r) => r.code)).toEqual(["001", "002"]);
  });
});

describe("shipDestinationLabelByCode", () => {
  it("включает снятые коды для подписи старых рейсов", () => {
    const map = shipDestinationLabelByCode([
      dest({ code: "moscow", displayName: "Москва", isActive: false }),
      dest({ code: "001", displayName: "Москва", isActive: true }),
    ]);
    expect(map.get("moscow")).toBe("Москва");
    expect(map.get("001")).toBe("Москва");
  });
});
