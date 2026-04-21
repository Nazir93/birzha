import { randomUUID } from "node:crypto";

import { ProductGradeCodeConflictError } from "../../application/errors.js";
import type {
  CreateProductGradeInput,
  ProductGradeRecord,
  ProductGradeRepository,
} from "../../application/ports/product-grade-repository.port.js";

/** Совпадает с сидом миграции `0011_purchase_nakladnaya`; без PostgreSQL список можно дополнять через `create`. */
const SEED: readonly ProductGradeRecord[] = [
  { id: "pg-n5", code: "№5", displayName: "Калибр №5", productGroup: "Помидоры", sortOrder: 5 },
  { id: "pg-n6", code: "№6", displayName: "Калибр №6", productGroup: "Помидоры", sortOrder: 6 },
  { id: "pg-n7", code: "№7", displayName: "Калибр №7", productGroup: "Помидоры", sortOrder: 7 },
  { id: "pg-n8", code: "№8", displayName: "Калибр №8", productGroup: "Помидоры", sortOrder: 8 },
  { id: "pg-nsm", code: "НС-", displayName: "НС-", productGroup: "Помидоры", sortOrder: 20 },
  { id: "pg-nsp", code: "НС+", displayName: "НС+", productGroup: "Помидоры", sortOrder: 21 },
  { id: "pg-om", code: "Ом.", displayName: "Ом.", productGroup: "Помидоры", sortOrder: 30 },
];

let memory: ProductGradeRecord[] | null = null;

function getRows(): ProductGradeRecord[] {
  if (!memory) {
    memory = [...SEED];
  }
  return memory;
}

export class StaticProductGradeRepository implements ProductGradeRepository {
  async findById(id: string): Promise<ProductGradeRecord | null> {
    return getRows().find((g) => g.id === id) ?? null;
  }

  async list(): Promise<ProductGradeRecord[]> {
    return [...getRows()].sort((a, b) => {
      const ga = a.productGroup ?? "";
      const gb = b.productGroup ?? "";
      if (ga !== gb) {
        return ga.localeCompare(gb, "ru");
      }
      return a.sortOrder - b.sortOrder || a.code.localeCompare(b.code, "ru");
    });
  }

  async create(input: CreateProductGradeInput): Promise<ProductGradeRecord> {
    const code = input.code.trim();
    const displayName = input.displayName.trim();
    const sortOrder = input.sortOrder ?? 100;
    const productGroup =
      input.productGroup === undefined || input.productGroup === null
        ? null
        : input.productGroup.trim() === ""
          ? null
          : input.productGroup.trim();
    const rows = getRows();
    if (rows.some((g) => g.code === code)) {
      throw new ProductGradeCodeConflictError(code);
    }
    const id = `pg-${randomUUID()}`;
    const rec: ProductGradeRecord = { id, code, displayName, productGroup, sortOrder };
    rows.push(rec);
    return rec;
  }
}
