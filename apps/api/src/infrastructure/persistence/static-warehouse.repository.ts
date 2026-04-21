import { randomUUID } from "node:crypto";

import { WarehouseCodeConflictError } from "../../application/errors.js";
import type {
  CreateWarehouseInput,
  WarehouseRecord,
  WarehouseRepository,
} from "../../application/ports/warehouse-repository.port.js";

import { autoWarehouseCode } from "./warehouse-code.js";

/** Совпадает с сидом миграции `0011_purchase_nakladnaya`; без PostgreSQL список можно дополнять через `create`. */
const SEED: readonly WarehouseRecord[] = [
  { id: "wh-manas", code: "MANAS", name: "Манас" },
  { id: "wh-kayakent", code: "KAYAKENT", name: "Каякент" },
];

let memory: WarehouseRecord[] | null = null;

function getRows(): WarehouseRecord[] {
  if (!memory) {
    memory = [...SEED];
  }
  return memory;
}

export class StaticWarehouseRepository implements WarehouseRepository {
  async findById(id: string): Promise<WarehouseRecord | null> {
    return getRows().find((w) => w.id === id) ?? null;
  }

  async list(): Promise<WarehouseRecord[]> {
    return [...getRows()].sort((a, b) => a.code.localeCompare(b.code));
  }

  async create(input: CreateWarehouseInput): Promise<WarehouseRecord> {
    const id = `wh-${randomUUID()}`;
    const name = input.name.trim();
    const explicit = input.code?.trim();
    const rows = getRows();
    if (explicit) {
      const code = explicit.toUpperCase();
      if (rows.some((w) => w.code === code)) {
        throw new WarehouseCodeConflictError(code);
      }
      const rec: WarehouseRecord = { id, code, name };
      rows.push(rec);
      return rec;
    }
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = autoWarehouseCode();
      if (rows.some((w) => w.code === code)) {
        continue;
      }
      const rec: WarehouseRecord = { id, code, name };
      rows.push(rec);
      return rec;
    }
    throw new Error("Не удалось создать склад: повторите попытку");
  }
}
