export type SupplierPaymentMethod = "cash" | "card" | "bank";

export type SupplierPaymentRecord = {
  id: string;
  purchaseDocumentId: string;
  supplierId: string | null;
  amountKopecks: bigint;
  method: SupplierPaymentMethod;
  paidAt: Date;
  comment: string | null;
  recordedByUserId: string | null;
  createdAt: Date;
};

export type SupplierPaymentAppend = {
  id: string;
  purchaseDocumentId: string;
  supplierId?: string | null;
  amountKopecks: bigint;
  method: SupplierPaymentMethod;
  paidAt: Date;
  comment?: string | null;
  recordedByUserId?: string | null;
  createdAt?: Date;
};

export interface SupplierPaymentRepository {
  append(row: SupplierPaymentAppend): Promise<void>;
  findById(id: string): Promise<SupplierPaymentRecord | null>;
  deleteById(id: string): Promise<void>;
  listByDocumentId(documentId: string): Promise<SupplierPaymentRecord[]>;
  sumPaidByDocumentId(documentId: string): Promise<bigint>;
  sumPaidByDocumentIds(documentIds: string[]): Promise<Map<string, bigint>>;
}
