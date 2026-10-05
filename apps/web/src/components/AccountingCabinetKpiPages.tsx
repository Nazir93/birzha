import { AccountingSectionBack } from "./AccountingSectionBack.js";
import { SellerFieldExpensesPanel } from "./SellerFieldExpensesPanel.js";
import { SellerMoneySendsPanel } from "./SellerMoneySendsPanel.js";

export function AccountingSellerExpensesPage() {
  return (
    <section className="birzha-card">
      <AccountingSectionBack />
      <SellerFieldExpensesPanel
        kind="field"
        showMoneySends={false}
        heading="Расходы продавцов"
        note="Грузчик, обед, палеты, материал. Аренда / бронь — отдельное окно; обе суммы списываются с кассы выбранного рейса."
      />
    </section>
  );
}

export function AccountingRentPage() {
  return (
    <section className="birzha-card">
      <AccountingSectionBack />
      <SellerFieldExpensesPanel
        kind="rent"
        showMoneySends={false}
        heading="Аренда / бронь"
        note="Выберите рейс — сумма вычитается из кассы этого рейса. У продавца та же запись видна в «Тратах» и в отчёте."
      />
    </section>
  );
}

export function AccountingSellerSendsPage() {
  return (
    <section className="birzha-card">
      <AccountingSectionBack />
      <h2 className="birzha-section-title">Отправки продавцов</h2>
      <SellerMoneySendsPanel compact />
    </section>
  );
}
