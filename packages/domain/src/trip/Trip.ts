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
    private readonly tripNumber: string,
    private status: TripStatus,
    private readonly vehicleLabel: string | null,
    private readonly driverName: string | null,
    private readonly departedAt: Date | null,
  ) {}

  static create(config: {
    id: string;
    tripNumber: string;
    vehicleLabel?: string | null;
    driverName?: string | null;
    departedAt?: Date | null;
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
  }): Trip {
    return new Trip(
      config.id,
      config.tripNumber,
      config.status,
      normText(config.vehicleLabel ?? null),
      normText(config.driverName ?? null),
      config.departedAt == null || Number.isNaN(new Date(config.departedAt).getTime()) ? null : new Date(config.departedAt),
    );
  }
}
