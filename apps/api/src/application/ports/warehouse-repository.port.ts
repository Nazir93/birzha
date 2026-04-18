export type WarehouseRecord = {
  id: string;
  code: string;
  name: string;
};

export interface WarehouseRepository {
  findById(id: string): Promise<WarehouseRecord | null>;
  list(): Promise<WarehouseRecord[]>;
}
