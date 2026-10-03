export type SellerMoneySendRecord = {
  id: string;
  tripId: string | null;
  sendDate: Date;
  amountKopecks: bigint;
  recipient: string;
  comment: string | null;
  recordedByUserId: string | null;
  createdAt: Date;
};

export type SellerMoneySendAppend = {
  id: string;
  tripId?: string | null;
  sendDate: Date;
  amountKopecks: bigint;
  recipient: string;
  comment?: string | null;
  recordedByUserId?: string | null;
  createdAt?: Date;
};

export type SellerMoneySendListFilter = {
  fromYmd?: string;
  toYmd?: string;
  tripId?: string;
  recordedByUserId?: string;
};

export interface SellerMoneySendRepository {
  append(row: SellerMoneySendAppend): Promise<void>;
  findById(id: string): Promise<SellerMoneySendRecord | null>;
  deleteById(id: string): Promise<void>;
  list(filter: SellerMoneySendListFilter): Promise<SellerMoneySendRecord[]>;
  sumInPeriod(fromYmd: string, toYmd: string): Promise<bigint>;
}
