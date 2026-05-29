export type TripStatus = "open" | "closed";

function normText(s: string | null | undefined): string | null {
  if (s == null) {
    return null;
  }
  const t = s.trim();
  return t.length > 0 ? t : null;
}

export class Trip {
  private constructor(
    private readonly id: string,
    private tripNumber: string,
    private status: TripStatus,
    private vehicleLabel: string | null,
    private driverName: string | null,
    private departedAt: Date | null,
    private assignedSellerUserId: string | null,
  ) {}

  static create(config: {
    id: string;
    tripNumber: string;
    vehicleLabel?: string | null;
    driverName?: string | null;
    departedAt?: Date | null;
    assignedSellerUserId?: string | null;
  }): Trip {
    if (!config.id.trim()) {
      throw new Error("trip id не может быть пустым");
    }
    if (!config.tripNumber.trim()) {
      throw new Error("tripNumber не может быть пустым");
    }
    return new Trip(
      config.id,
      config.tripNumber,
      "open",
      normText(config.vehicleLabel ?? null),
      normText(config.driverName ?? null),
      config.departedAt == null || Number.isNaN(config.departedAt.getTime()) ? null : config.departedAt,
      normText(config.assignedSellerUserId ?? null),
    );
  }

  getId(): string {
    return this.id;
  }

  getTripNumber(): string {
    return this.tripNumber;
  }

  getStatus(): TripStatus {
    return this.status;
  }

  getVehicleLabel(): string | null {
    return this.vehicleLabel;
  }

  getDriverName(): string | null {
    return this.driverName;
  }

  getDepartedAt(): Date | null {
    return this.departedAt;
  }

  /** Продавец, закреплённый за рейсом; только он видит рейс в полевом кабинете. */
  getAssignedSellerUserId(): string | null {
    return this.assignedSellerUserId;
  }

  assignSeller(userId: string): void {
    const normalized = normText(userId);
    if (!normalized) {
      throw new Error("assignedSellerUserId не может быть пустым");
    }
    this.assignedSellerUserId = normalized;
  }

  /** Исправление опечаток в шапке рейса (номер, ТС, водитель, дата). */
  updateHeader(input: {
    tripNumber?: string;
    vehicleLabel?: string | null;
    driverName?: string | null;
    departedAt?: Date | null;
  }): void {
    if (input.tripNumber !== undefined) {
      const n = input.tripNumber.trim();
      if (!n) {
        throw new Error("tripNumber не может быть пустым");
      }
      this.tripNumber = n;
    }
    if (input.vehicleLabel !== undefined) {
      this.vehicleLabel = normText(input.vehicleLabel);
    }
    if (input.driverName !== undefined) {
      this.driverName = normText(input.driverName);
    }
    if (input.departedAt !== undefined) {
      this.departedAt =
        input.departedAt == null || Number.isNaN(input.departedAt.getTime()) ? null : input.departedAt;
    }
  }

  canAcceptShipments(): boolean {
    return this.status === "open";
  }

  close(): void {
    this.status = "closed";
  }

  static restore(config: {
    id: string;
    tripNumber: string;
    status: TripStatus;
    vehicleLabel?: string | null;
    driverName?: string | null;
    departedAt?: Date | null;
    assignedSellerUserId?: string | null;
  }): Trip {
    return new Trip(
      config.id,
      config.tripNumber,
      config.status,
      normText(config.vehicleLabel ?? null),
      normText(config.driverName ?? null),
      config.departedAt == null || Number.isNaN(new Date(config.departedAt).getTime()) ? null : new Date(config.departedAt),
      normText(config.assignedSellerUserId ?? null),
    );
  }
}
