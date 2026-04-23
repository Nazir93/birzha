export type CounterpartyRecord = {
  id: string;
  displayName: string;
};

/** Справочник контрагентов для продаж с рейса. */
export interface CounterpartyRepository {
  findActiveById(id: string): Promise<CounterpartyRecord | null>;
  listActive(): Promise<CounterpartyRecord[]>;
  create(displayName: string): Promise<CounterpartyRecord>;
  /** Жёсткое удаление; сначала снимаются продажи, ссылающиеся на контрагента, или 409. */
  deleteById(counterpartyId: string): Promise<void>;
}
