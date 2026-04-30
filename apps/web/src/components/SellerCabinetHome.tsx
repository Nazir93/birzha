import { Link } from "react-router-dom";

import { useAuth } from "../auth/auth-context.js";
import { canAccessCabinet } from "../auth/role-panels.js";
import { ops, sales } from "../routes.js";
import { muted, btnStyle } from "../ui/styles.js";
import { SellFromTripSection } from "./SellFromTripSection.js";

/**
 * Полевой продавец: один экран — продажа с рейса (без дублирования с «Операциями»).
 * PWA: см. `birzha-seller-workspace` в CSS (safe-area, крупная кнопка в форме).
 */
export function SellerCabinetHome() {
  const { user } = useAuth();
  const canOpsCabinet = user ? canAccessCabinet(user, "operations") : false;

  return (
    <div className="birzha-seller-workspace" aria-labelledby="seller-work-h">
      <h2 id="seller-work-h" className="birzha-section-title">
        Продажи с рейса
      </h2>
      <p style={{ ...muted, margin: "0 0 1rem", lineHeight: 1.55, fontSize: "0.95rem" }}>
        Выберите <strong>рейс</strong> и <strong>партию (накладная · калибр)</strong>, затем заполните сделку. Отчёт и офлайн — ссылки внизу.
        {canOpsCabinet ? (
          <>
            {" "}
            Закуп и отгрузка на склад — в кабинете операций.
          </>
        ) : (
          <>
            {" "}
            Здесь только ваши продажи с рейса; закуп и склад — у сотрудников с доступом к операциям.
          </>
        )}
      </p>
      <SellFromTripSection variant="seller" />
      <nav className="birzha-seller-footer-nav no-print" aria-label="Дополнительно">
        <Link to={sales.reports} style={{ ...btnStyle, fontSize: "0.95rem", padding: "0.55rem 0.85rem" }}>
          Отчёт по рейсу
        </Link>
        <Link to={sales.offline} style={{ ...btnStyle, fontSize: "0.95rem", padding: "0.55rem 0.85rem" }}>
          Офлайн-очередь
        </Link>
        {canOpsCabinet && (
          <Link to={ops.operations} style={{ ...btnStyle, fontSize: "0.92rem", padding: "0.5rem 0.75rem", fontWeight: 500 }}>
            Все операции склада
          </Link>
        )}
      </nav>
    </div>
  );
}
