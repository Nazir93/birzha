export type ProductGradeRecord = {
  id: string;
  code: string;
  displayName: string;
  sortOrder: number;
};

export interface ProductGradeRepository {
  findById(id: string): Promise<ProductGradeRecord | null>;
  list(): Promise<ProductGradeRecord[]>;
}
