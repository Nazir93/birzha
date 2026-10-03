export type PurchaserExpenseCategory =
  | "salary"
  | "loading"
  | "lunch"
  | "foam"
  | "fuel"
  | "other";

export type PurchaserExpenseRecord = {
  id: string;
  expenseDate: Date;
  category: PurchaserExpenseCategory;
  amountKopecks: bigint;
  purchaserUserId: string | null;
  purchaserLabel: string | null;
  loadingManifestId: string | null;
  comment: string | null;
  recordedByUserId: string | null;
  createdAt: Date;
};

export type PurchaserExpenseAppend = {
  id: string;
  expenseDate: Date;
  category: PurchaserExpenseCategory;
  amountKopecks: bigint;
  purchaserUserId?: string | null;
  purchaserLabel?: string | null;
  loadingManifestId?: string | null;
  comment?: string | null;
  recordedByUserId?: string | null;
  createdAt?: Date;
};

export type PurchaserExpenseListFilter = {
  fromYmd?: string;
  toYmd?: string;
  purchaserUserId?: string;
  loadingManifestId?: string;
};

export interface PurchaserExpenseRepository {
  append(row: PurchaserExpenseAppend): Promise<void>;
  findById(id: string): Promise<PurchaserExpenseRecord | null>;
  deleteById(id: string): Promise<void>;
  list(filter: PurchaserExpenseListFilter): Promise<PurchaserExpenseRecord[]>;
  sumInPeriod(fromYmd: string, toYmd: string): Promise<bigint>;
}
