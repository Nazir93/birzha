import { eq } from "drizzle-orm";

import type { TripRepository } from "../ports/trip-repository.port.js";
import type { PushSubscriptionRepository } from "../ports/push-subscription.port.js";
import type { DbClient } from "../../db/client.js";
import {
  productGrades,
  purchaseDocumentLines,
  shipDestinations,
  users,
} from "../../db/schema.js";
import type { WebPushSender } from "../../infrastructure/push/web-push-sender.js";
import { formatAdminTripSalePush } from "./format-admin-trip-sale-push.js";

export type NotifyAdminsOfTripSaleInput = {
  batchId: string;
  tripId: string;
  kg: number;
  pricePerKg: number;
  saleChannel: "retail" | "wholesale";
  clientLabel: string | null;
  packageCount: number | null;
  recordedByUserId: string | null;
  /** Относительный URL для клика по уведомлению. */
  openUrl: string;
};

/**
 * После успешной продажи с рейса — push всем устройствам пользователей с ролью admin.
 * Ошибки доставки не пробрасываются наружу (продажа уже записана).
 */
export class NotifyAdminsOfTripSaleUseCase {
  constructor(
    private readonly db: DbClient,
    private readonly trips: TripRepository,
    private readonly subscriptions: PushSubscriptionRepository,
    private readonly sender: WebPushSender,
    private readonly log?: { warn: (obj: unknown, msg?: string) => void },
  ) {}

  async execute(input: NotifyAdminsOfTripSaleInput): Promise<void> {
    const trip = await this.trips.findById(input.tripId);
    if (!trip) {
      return;
    }

    const destinationCode = trip.getDestinationCode();
    const destinationLabel = destinationCode
      ? ((await this.resolveDestinationName(destinationCode)) ?? destinationCode)
      : null;

    const msg = formatAdminTripSalePush({
      caliberLabel: await this.resolveCaliberLabel(input.batchId),
      kg: input.kg,
      packageCount: input.packageCount,
      pricePerKg: input.pricePerKg,
      revenueRub: Math.round(input.kg * input.pricePerKg * 100) / 100,
      saleChannel: input.saleChannel,
      clientLabel: input.clientLabel,
      sellerLogin: await this.resolveSellerLogin(input.recordedByUserId),
      tripNumber: trip.getTripNumber(),
      destinationLabel,
      vehicleLabel: trip.getVehicleLabel(),
      productGroup: trip.getProductGroup(),
      at: new Date(),
    });

    const list = await this.subscriptions.listForGlobalRole("admin");
    if (list.length === 0) {
      return;
    }

    for (const sub of list) {
      try {
        const result = await this.sender.send(sub, {
          title: msg.title,
          body: msg.body,
          url: input.openUrl,
        });
        if (result === "gone") {
          await this.subscriptions.deleteByEndpoint(sub.endpoint);
        }
      } catch (error) {
        this.log?.warn({ err: error, endpoint: sub.endpoint }, "push send failed");
      }
    }
  }

  private async resolveCaliberLabel(batchId: string): Promise<string> {
    const rows = await this.db
      .select({
        productGradeCode: productGrades.code,
        productGroup: productGrades.productGroup,
      })
      .from(purchaseDocumentLines)
      .leftJoin(productGrades, eq(purchaseDocumentLines.productGradeId, productGrades.id))
      .where(eq(purchaseDocumentLines.batchId, batchId))
      .limit(1);

    const row = rows[0];
    const group = row?.productGroup?.trim();
    const code = row?.productGradeCode?.trim();
    if (group && code) {
      return `${group} · ${code}`;
    }
    if (code) {
      return code;
    }
    if (group) {
      return group;
    }
    return "Калибр не указан";
  }

  private async resolveDestinationName(code: string): Promise<string | null> {
    const rows = await this.db
      .select({ displayName: shipDestinations.displayName })
      .from(shipDestinations)
      .where(eq(shipDestinations.code, code))
      .limit(1);
    return rows[0]?.displayName?.trim() || null;
  }

  private async resolveSellerLogin(userId: string | null): Promise<string | null> {
    const id = userId?.trim();
    if (!id) {
      return null;
    }
    const rows = await this.db
      .select({ login: users.login })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    return rows[0]?.login?.trim() || null;
  }
}
