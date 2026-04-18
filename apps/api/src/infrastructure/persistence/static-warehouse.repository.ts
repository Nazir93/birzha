import type { WarehouseRecord, WarehouseRepository } from "../../application/ports/warehouse-repository.port.js";

/** Совпадает с сидом миграции `0011_purchase_nakladnaya`. */
const STATIC: readonly WarehouseRecord[] = [
  { id: "wh-manas", code: "MANAS", name: "Манас" },
  { id: "wh-kayakent", code: "KAYAKENT", name: "Каякент" },
];

export class StaticWarehouseRepository implements WarehouseRepository {
  async findById(id: string): Promise<WarehouseRecord | null> {
    return STATIC.find((w) => w.id === id) ?? null;
  }

  async list(): Promise<WarehouseRecord[]> {
    return [...STATIC];
  }
}
