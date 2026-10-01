export type TripExpenseCategory = "fuel" | "road" | "driver" | "other";

export type TripExpenseRecord = {
  id: string;
  tripId: string;
  category: TripExpenseCategory;
  amountKopecks: bigint;
  expenseDate: Date;
  comment: string | null;
  recordedByUserId: string | null;
  createdAt: Date;
};

export type TripExpenseAppend = {
  id: string;
  tripId: string;
  category: TripExpenseCategory;
  amountKopecks: bigint;
  expenseDate: Date;
  comment?: string | null;
  recordedByUserId?: string | null;
  createdAt?: Date;
};

export interface TripExpenseRepository {
  append(row: TripExpenseAppend): Promise<void>;
  findById(id: string): Promise<TripExpenseRecord | null>;
  deleteById(id: string): Promise<void>;
  listByTripId(tripId: string): Promise<TripExpenseRecord[]>;
  sumByTripId(tripId: string): Promise<bigint>;
}
