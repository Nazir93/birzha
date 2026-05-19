/** Оценка ящиков «в пути» по партии: отгрузка × (остаток кг / отгружено кг). */
export function estimateTripBatchPackagesInTransit(
  shippedG: bigint,
  shippedPackages: bigint,
  soldG: bigint,
  shortageG: bigint,
): bigint {
  if (shippedG <= 0n || shippedPackages <= 0n) {
    return 0n;
  }
  const netG = shippedG - soldG - shortageG;
  if (netG <= 0n) {
    return 0n;
  }
  return (shippedPackages * netG) / shippedG;
}
