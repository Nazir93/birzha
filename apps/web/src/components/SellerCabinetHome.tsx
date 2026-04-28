import { muted } from "../ui/styles.js";
import { SalesCabinetDashboard } from "./SalesCabinetDashboard.js";
import { SellerCabinetOverview } from "./SellerCabinetOverview.js";

/** Главная полевого кабинета: сводка по системе, дашборд рейса и быстрые действия. */
export function SellerCabinetHome() {
  return (
    <div className="birzha-stack" aria-labelledby="sales-home-h">
      <div>
        <h2 id="sales-home-h" className="birzha-section-title">
          Полевые продажи
        </h2>
        <p style={{ ...muted, margin: "0 0 0", lineHeight: 1.55 }}>
          Закуп и отгрузка — в кабинете <code>/o</code>. Здесь — <strong>общая сводка</strong>, затем <strong>рейс</strong>,
          краткие суммы и кнопки продажи и офлайн-синхронизации.
        </p>
      </div>
      <SellerCabinetOverview />
      <SalesCabinetDashboard />
    </div>
  );
}
