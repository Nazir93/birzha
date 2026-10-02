export type SellerFieldExpenseCategory =
  | "loader"
  | "lunch"
  | "pallets"
  | "rent"
  | "materials"
  | "other";

export type SellerFieldExpenseRecord = {
  id: string;
  tripId: string;
  expenseDate: Date;
  category: SellerFieldExpenseCategory;
  amountKopecks: bigint;
  comment: string | null;
  recordedByUserId: string | null;
  createdAt: Date;
};

export type SellerFieldExpenseAppend = {
  id: string;
  tripId: string;
  expenseDate: Date;
  category: SellerFieldExpenseCategory;
  amountKopecks: bigint;
  comment?: string | null;
  recordedByUserId?: string | null;
  createdAt?: Date;
};

export type SellerFieldExpenseListFilter = {
  tripId?: string;
  fromYmd?: string;
  toYmd?: string;
  recordedByUserId?: string;
};

export interface SellerFieldExpenseRepository {
  append(row: SellerFieldExpenseAppend): Promise<void>;
  findById(id: string): Promise<SellerFieldExpenseRecord | null>;
  deleteById(id: string): Promise<void>;
  list(filter: SellerFieldExpenseListFilter): Promise<SellerFieldExpenseRecord[]>;
  sumByTripId(tripId: string): Promise<bigint>;
}
