import { sectionCard, muted } from "../ui/styles.js";
import { SalesCabinetDashboard } from "./SalesCabinetDashboard.js";

/** Главная полевого кабинета: дашборд рейса и быстрые действия (удобно с PWA и на рынке). */
export function SellerCabinetHome() {
  return (
    <section style={sectionCard} aria-labelledby="sales-home-h">
      <h2 id="sales-home-h" style={{ fontSize: "1.15rem", margin: "0 0 0.5rem" }}>
        Полевые продажи
      </h2>
      <p style={{ ...muted, margin: "0 0 1rem", lineHeight: 1.55 }}>
        Закуп и отгрузка — в кабинете <code>/o</code>. Здесь — <strong>рейс</strong>, краткие суммы и кнопки продажи и
        офлайн-синхронизации.
      </p>
      <SalesCabinetDashboard />
    </section>
  );
}
