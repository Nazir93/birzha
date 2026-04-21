export type ProductGradeRecord = {
  id: string;
  code: string;
  displayName: string;
  /** Вид товара для группировки в накладной (помидоры, огурцы…); у разных групп разные калибры. */
  productGroup: string | null;
  sortOrder: number;
};

/** Новая строка справочника калибров (код как на накладной, уникален). */
export type CreateProductGradeInput = {
  code: string;
  displayName: string;
  /** Порядок в списке; по умолчанию сервер подставит значение. */
  sortOrder?: number;
  /** Опционально: группа товара (одинаковая строка — одна группа в выпадающем списке). */
  productGroup?: string | null;
};

export interface ProductGradeRepository {
  findById(id: string): Promise<ProductGradeRecord | null>;
  /** Только активные — для выбора в накладной. */
  list(): Promise<ProductGradeRecord[]>;
  create(input: CreateProductGradeInput): Promise<ProductGradeRecord>;
}
