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
        note="Грузчик, обед, палеты, материал. Аренда — отдельное окно на сводке."
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
        heading="Аренда"
        note="Только траты категории «Аренда». Список и запись за выбранный период."
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
