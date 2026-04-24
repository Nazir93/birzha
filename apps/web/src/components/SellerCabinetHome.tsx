import { Link } from "react-router-dom";

import { sales } from "../routes.js";
import { sectionCard, muted, btnStyle } from "../ui/styles.js";

/** Главная полевого кабинета: короткие ссылки, без сценариев склада. */
export function SellerCabinetHome() {
  return (
    <section style={sectionCard} aria-labelledby="sales-home-h">
      <h2 id="sales-home-h" style={{ fontSize: "1.1rem", margin: "0 0 0.5rem" }}>
        Полевые продажи
      </h2>
      <p style={{ ...muted, margin: "0 0 0.75rem" }}>
        Здесь — просмотр рейса и оформление продаж, офлайн-очередь. Закупочные накладные и приём вводят в кабинете{" "}
        <code>/o</code> (закуп / склад). Синхронизация действий — <code>POST /api/sync</code> (например продажа с рейса).
      </p>
      <ul style={{ margin: 0, paddingLeft: "1.15rem", lineHeight: 1.55 }}>
        <li>
          <Link to={sales.reports} style={{ fontWeight: 600 }}>
            Отчёты и рейсы
          </Link>{" "}
          — отчёт по фуре, печать.
        </li>
        <li>
          <Link to={sales.operations} style={{ fontWeight: 600 }}>
            Операции
          </Link>{" "}
          — оформление продаж и движений с рейса.
        </li>
        <li>
          <Link to={sales.offline} style={{ fontWeight: 600 }}>
            Офлайн-очередь
          </Link>{" "}
          — если нет сети, действия встают в очередь.
        </li>
      </ul>
      <p className="no-print" style={{ marginTop: "0.9rem" }}>
        <Link to={sales.reports} style={btnStyle}>
          Перейти к отчётам
        </Link>
      </p>
    </section>
  );
}
