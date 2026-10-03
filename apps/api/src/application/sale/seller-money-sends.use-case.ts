import { InvalidPaymentAmountError } from "@birzha/domain";
import { randomUUID } from "node:crypto";

import { SellerMoneySendNotFoundError, TripNotFoundError } from "../errors.js";
import type { SellerMoneySendRecord, SellerMoneySendRepository } from "../ports/seller-money-send-repository.port.js";
import type { TripRepository } from "../ports/trip-repository.port.js";

export class SellerMoneySendsUseCase {
  constructor(
    private readonly sends: SellerMoneySendRepository,
    private readonly trips: TripRepository,
  ) {}

  async list(filter: {
    fromYmd?: string;
    toYmd?: string;
    tripId?: string;
    recordedByUserId?: string;
  }) {
    const rows = await this.sends.list(filter);
    let totalKopecks = 0n;
    for (const r of rows) {
      totalKopecks += r.amountKopecks;
    }
    return { totalKopecks, sends: rows };
  }

  async record(input: {
    tripId?: string | null;
    sendDate: Date;
    amountKopecks: bigint;
    recipient: string;
    comment?: string | null;
    recordedByUserId?: string | null;
  }): Promise<SellerMoneySendRecord> {
    if (input.amountKopecks <= 0n) {
      throw new InvalidPaymentAmountError(input.amountKopecks);
    }
    const recipient = input.recipient.trim();
    if (!recipient) {
      throw new Error("Укажите, кому отправлены деньги");
    }
    const tripId = input.tripId?.trim() || null;
    if (tripId) {
      const trip = await this.trips.findById(tripId);
      if (!trip) {
        throw new TripNotFoundError(tripId);
      }
    }
    const id = randomUUID();
    await this.sends.append({
      id,
      tripId,
      sendDate: input.sendDate,
      amountKopecks: input.amountKopecks,
      recipient,
      comment: input.comment,
      recordedByUserId: input.recordedByUserId,
    });
    const row = await this.sends.findById(id);
    if (!row) {
      throw new SellerMoneySendNotFoundError(id);
    }
    return row;
  }

  async delete(input: {
    sendId: string;
    actorUserId: string | null;
    isAdminLike: boolean;
  }): Promise<void> {
    const row = await this.sends.findById(input.sendId);
    if (!row) {
      throw new SellerMoneySendNotFoundError(input.sendId);
    }
    if (!input.isAdminLike) {
      if (!input.actorUserId || row.recordedByUserId !== input.actorUserId) {
        throw new SellerMoneySendNotFoundError(input.sendId);
      }
    }
    await this.sends.deleteById(input.sendId);
  }
}
