import { ResourceInUseError } from "../errors.js";
import type { CounterpartyRepository } from "../ports/counterparty-repository.port.js";
import type { TripSaleRepository } from "../ports/trip-sale-repository.port.js";

export class DeleteCounterpartyUseCase {
  constructor(
    private readonly counterparties: CounterpartyRepository,
    private readonly tripSales: TripSaleRepository,
  ) {}

  async execute(counterpartyId: string): Promise<void> {
    const n = await this.tripSales.countByCounterpartyId(counterpartyId);
    if (n > 0) {
      throw new ResourceInUseError(
        "counterparty",
        "По контрагенту есть продажи в рейсах; сначала снимите привязку к контрагенту в этих продажах.",
      );
    }
    await this.counterparties.deleteById(counterpartyId);
  }
}
