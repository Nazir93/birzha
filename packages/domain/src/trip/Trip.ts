export type TripStatus = "open" | "closed";

export class Trip {
  private constructor(
    private readonly id: string,
    private readonly tripNumber: string,
    private status: TripStatus,
  ) {}

  static create(config: { id: string; tripNumber: string }): Trip {
    if (!config.id.trim()) {
      throw new Error("trip id не может быть пустым");
    }
    if (!config.tripNumber.trim()) {
      throw new Error("tripNumber не может быть пустым");
    }
    return new Trip(config.id, config.tripNumber, "open");
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

  canAcceptShipments(): boolean {
    return this.status === "open";
  }

  close(): void {
    this.status = "closed";
  }

  static restore(config: { id: string; tripNumber: string; status: TripStatus }): Trip {
    return new Trip(config.id, config.tripNumber, config.status);
  }
}
