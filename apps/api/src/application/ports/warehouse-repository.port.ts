export type WarehouseRecord = {
  id: string;
  code: string;
  name: string;
};

export type CreateWarehouseInput = {
  name: string;
  /** Если не задан — сервер сгенерирует уникальный код. */
  code?: string;
};

export interface WarehouseRepository {
  findById(id: string): Promise<WarehouseRecord | null>;
  list(): Promise<WarehouseRecord[]>;
  create(input: CreateWarehouseInput): Promise<WarehouseRecord>;
}
