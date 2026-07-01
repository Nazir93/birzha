import { DomainError } from "../errors.js";

export class InvalidKgError extends DomainError {
  constructor(
    public readonly field: string,
    public readonly value: unknown,
  ) {
    super(`Некорректное количество в поле "${field}": ${String(value)}`);
  }
}

export class InsufficientStockError extends DomainError {
  constructor(
    public readonly context: "warehouse" | "transit" | "pending" | "sold" | "written_off",
    public readonly availableKg: number,
    public readonly requestedKg: number,
  ) {
    const message =
      context === "pending"
        ? `Недостаточно кг в ожидании поступления: доступно ${availableKg}, запрошено ${requestedKg}`
        : context === "warehouse"
          ? `Недостаточно кг на складе: доступно ${availableKg}, запрошено ${requestedKg}`
          : context === "sold"
            ? `Недостаточно проданного кг для отмены: учтено ${availableKg}, запрошено ${requestedKg}`
            : context === "written_off"
              ? `Недостаточно списанного кг для отмены: учтено ${availableKg}, запрошено ${requestedKg}`
              : `Недостаточно кг в рейсе: доступно ${availableKg}, запрошено ${requestedKg}`;
    super(message);
  }
}
