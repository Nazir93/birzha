export type CounterpartyRecord = {
  id: string;
  displayName: string;
};

/** Справочник контрагентов для продаж с рейса. */
export interface CounterpartyRepository {
  findActiveById(id: string): Promise<CounterpartyRecord | null>;
  listActive(): Promise<CounterpartyRecord[]>;
  create(displayName: string): Promise<CounterpartyRecord>;
}
