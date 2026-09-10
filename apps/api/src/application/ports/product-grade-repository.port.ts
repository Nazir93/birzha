export type ProductGradeRecord = {
  id: string;
  code: string;
  displayName: string;
  /** Вид товара для группировки в накладной (помидоры, огурцы…); у разных групп разные калибры. */
  productGroup: string | null;
  sortOrder: number;
};

/** Новая строка справочника калибров (код уникален внутри товара). */
export type CreateProductGradeInput = {
  code: string;
  displayName: string;
  /** Порядок в списке; по умолчанию сервер подставит значение. */
  sortOrder?: number;
  /** Товар (одинаковая строка — одна группа в выпадающем списке). */
  productGroup: string;
};

export interface ProductGradeRepository {
  findById(id: string): Promise<ProductGradeRecord | null>;
  /** Только активные — для выбора в накладной. */
  list(): Promise<ProductGradeRecord[]>;
  create(input: CreateProductGradeInput): Promise<ProductGradeRecord>;
  deleteById(productGradeId: string): Promise<void>;
}
