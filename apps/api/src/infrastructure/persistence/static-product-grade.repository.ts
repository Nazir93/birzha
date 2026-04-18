import type { ProductGradeRecord, ProductGradeRepository } from "../../application/ports/product-grade-repository.port.js";

/** Совпадает с сидом миграции `0011_purchase_nakladnaya`. */
const STATIC: readonly ProductGradeRecord[] = [
  { id: "pg-n5", code: "№5", displayName: "Калибр №5", sortOrder: 5 },
  { id: "pg-n6", code: "№6", displayName: "Калибр №6", sortOrder: 6 },
  { id: "pg-n7", code: "№7", displayName: "Калибр №7", sortOrder: 7 },
  { id: "pg-n8", code: "№8", displayName: "Калибр №8", sortOrder: 8 },
  { id: "pg-nsm", code: "НС-", displayName: "НС-", sortOrder: 20 },
  { id: "pg-nsp", code: "НС+", displayName: "НС+", sortOrder: 21 },
  { id: "pg-om", code: "Ом.", displayName: "Ом.", sortOrder: 30 },
];

export class StaticProductGradeRepository implements ProductGradeRepository {
  async findById(id: string): Promise<ProductGradeRecord | null> {
    return STATIC.find((g) => g.id === id) ?? null;
  }

  async list(): Promise<ProductGradeRecord[]> {
    return [...STATIC];
  }
}
