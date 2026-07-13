/** Ящики по строке возврата: пропорция от строки накладной. */
export function estimateReturnPackageCount(input: {
  returnGrams: bigint;
  lineQuantityGrams: bigint;
  linePackageCount: bigint | null;
}): number | null {
  const { returnGrams, lineQuantityGrams, linePackageCount } = input;
  if (linePackageCount == null || linePackageCount <= 0n || lineQuantityGrams <= 0n || returnGrams <= 0n) {
    return null;
  }
  const pkg = (returnGrams * linePackageCount + lineQuantityGrams / 2n) / lineQuantityGrams;
  const n = Number(pkg);
  if (!Number.isFinite(n) || n <= 0) {
    return null;
  }
  return n;
}
