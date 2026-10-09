/** Класс подсветки KPI: прибыль / убыль по знаку суммы в копейках. */
export function kpiToneForSignedKopecks(kopecks: string): "birzha-kpi-tile--tone-good" | "birzha-kpi-tile--tone-bad" {
  try {
    return BigInt(kopecks.trim() || "0") < 0n ? "birzha-kpi-tile--tone-bad" : "birzha-kpi-tile--tone-good";
  } catch {
    return "birzha-kpi-tile--tone-good";
  }
}
