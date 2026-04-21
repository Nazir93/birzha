export type ProductGradeRecord = {
  id: string;
  code: string;
  displayName: string;
  sortOrder: number;
};

/** Новая строка справочника калибров (код как на накладной, уникален). */
export type CreateProductGradeInput = {
  code: string;
  displayName: string;
  /** Порядок в списке; по умолчанию сервер подставит значение. */
  sortOrder?: number;
};

export interface ProductGradeRepository {
  findById(id: string): Promise<ProductGradeRecord | null>;
  /** Только активные — для выбора в накладной. */
  list(): Promise<ProductGradeRecord[]>;
  create(input: CreateProductGradeInput): Promise<ProductGradeRecord>;
}
