import { Link } from "react-router-dom";

import { useAuth } from "../auth/auth-context.js";
import { canAccessCabinet } from "../auth/role-panels.js";
import { ops, sales } from "../routes.js";
import { SellFromTripSection } from "./SellFromTripSection.js";
import { SellerSalesSummary } from "./SellerSalesSummary.js";

/**
 * Полевой продавец: один экран — продажа с рейса (без дублирования с «Операциями»).
 * PWA: см. `birzha-seller-workspace` в CSS (safe-area, крупная кнопка в форме).
 */
export function SellerCabinetHome() {
  const { user } = useAuth();
  const canOpsCabinet = user ? canAccessCabinet(user, "operations") : false;

  return (
    <div className="birzha-seller-workspace birzha-home-premium" aria-labelledby="seller-work-h">
      <header className="birzha-home-hero birzha-home-hero--sales">
        <div>
          <p className="birzha-home-hero__eyebrow">Продажи</p>
          <h2 id="seller-work-h" className="birzha-home-hero__title">
            Рабочее место продавца
          </h2>
          <p className="birzha-home-hero__lead">
            1) выберите рейс, 2) внесите продажу, 3) проверьте итог по деньгам.
          </p>
        </div>
        <nav className="birzha-home-actions no-print" aria-label="Быстрые действия продавца">
          <Link to={sales.reports} className="birzha-home-action">
            <span>Шаг 3</span>
            <strong>Проверить отчет</strong>
          </Link>
          <Link to={sales.offline} className="birzha-home-action">
            <span>Если нет сети</span>
            <strong>Офлайн очередь</strong>
          </Link>
          {canOpsCabinet && (
            <Link to={ops.operations} className="birzha-home-action">
              <span>Для старшего</span>
              <strong>Операции склада</strong>
            </Link>
          )}
        </nav>
      </header>

      <section className="birzha-home-work-card birzha-seller-guide" aria-label="Памятка по работе">
        <div className="birzha-seller-guide__head">
          <h3 className="birzha-section-title birzha-section-title--sm">Как работать в 3 шага</h3>
        </div>
        <div className="birzha-seller-guide__grid">
          <article className="birzha-seller-guide__item">
            <span className="birzha-seller-guide__num">1</span>
            <div>
              <strong>Выберите рейс</strong>
              <p>В форме ниже должен быть выбран ваш рейс.</p>
            </div>
          </article>
          <article className="birzha-seller-guide__item">
            <span className="birzha-seller-guide__num">2</span>
            <div>
              <strong>Внесите продажу</strong>
              <p>Укажите товар, вес и оплату. Нажмите «Продать».</p>
            </div>
          </article>
          <article className="birzha-seller-guide__item">
            <span className="birzha-seller-guide__num">3</span>
            <div>
              <strong>Сверьте итоги</strong>
              <p>Проверьте кг, выручку, нал и долг в сводке.</p>
            </div>
          </article>
        </div>
      </section>

      <SellerSalesSummary />

      <section className="birzha-home-work-card" aria-label="Форма продажи">
        <SellFromTripSection variant="seller" />
      </section>
    </div>
  );
}
