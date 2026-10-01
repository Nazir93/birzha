export type DebtPaymentMethod = "cash" | "card" | "bank";

export type DebtPaymentRecord = {
  id: string;
  saleId: string;
  tripId: string;
  counterpartyId: string | null;
  clientLabel: string | null;
  amountKopecks: bigint;
  method: DebtPaymentMethod;
  paidAt: Date;
  comment: string | null;
  recordedByUserId: string | null;
  createdAt: Date;
};

export type DebtPaymentAppend = {
  id: string;
  saleId: string;
  tripId: string;
  counterpartyId?: string | null;
  clientLabel?: string | null;
  amountKopecks: bigint;
  method: DebtPaymentMethod;
  paidAt: Date;
  comment?: string | null;
  recordedByUserId?: string | null;
  createdAt?: Date;
};

export interface DebtPaymentRepository {
  append(row: DebtPaymentAppend): Promise<void>;
  findById(id: string): Promise<DebtPaymentRecord | null>;
  deleteById(id: string): Promise<void>;
  listBySaleId(saleId: string): Promise<DebtPaymentRecord[]>;
  sumPaidBySaleId(saleId: string): Promise<bigint>;
  /** Сумма оплат по всем сделкам рейса. */
  sumPaidByTripId(tripId: string): Promise<bigint>;
  sumPaidBySaleIds(saleIds: string[]): Promise<Map<string, bigint>>;
}
