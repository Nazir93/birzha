/**
 * Сколько грамм должно стать в строке ПН при догрузке свободного склада.
 * Доступные кг — только то, что сейчас на складе (не на рейсе).
 * Если партия уже в ПН — прибавляем к существующей строке, а не заменяем её.
 */
export type AppendLoadingManifestLinePlan =
  | { kind: "skip" }
  | { kind: "insert"; targetGrams: bigint; addGrams: bigint }
  | { kind: "increase"; targetGrams: bigint; addGrams: bigint };

export function planAppendLoadingManifestLineGrams(input: {
  /** Граммы уже в строке этой ПН; `null` — партии ещё нет в накладной. */
  existingLineGrams: bigint | null;
  /** Свободно на складе для погрузки (после резерва других черновых ПН и blocks_loading). */
  availableWarehouseGrams: bigint;
}): AppendLoadingManifestLinePlan {
  const add = input.availableWarehouseGrams > 0n ? input.availableWarehouseGrams : 0n;
  if (add <= 0n) {
    return { kind: "skip" };
  }
  if (input.existingLineGrams == null) {
    return { kind: "insert", targetGrams: add, addGrams: add };
  }
  const existing = input.existingLineGrams > 0n ? input.existingLineGrams : 0n;
  return {
    kind: "increase",
    targetGrams: existing + add,
    addGrams: add,
  };
}
