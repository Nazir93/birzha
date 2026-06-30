import { Link } from "react-router-dom";

import type { AdminSummaryAlert } from "../../format/admin-summary-alerts.js";

type AdminSummaryAttentionProps = {
  alerts: AdminSummaryAlert[];
};

function AdminSummaryAlertLink({ alert }: { alert: AdminSummaryAlert }) {
  const content = (
    <>
      <span>{alert.label}</span>
      <strong>{alert.count}</strong>
    </>
  );
  if (alert.href.startsWith("#")) {
    return (
      <a href={alert.href} className="birzha-admin-summary-attention__link">
        {content}
      </a>
    );
  }
  return (
    <Link to={alert.href} className="birzha-admin-summary-attention__link">
      {content}
    </Link>
  );
}

export function AdminSummaryAttention({ alerts }: AdminSummaryAttentionProps) {
  return (
    <div className="birzha-admin-summary-attention" aria-label="Требует внимания">
      <div className="birzha-admin-summary-attention__title">Требует внимания</div>
      {alerts.length === 0 ? (
        <p className="birzha-admin-summary-attention__ok birzha-text-muted birzha-ui-sm">Всё в порядке</p>
      ) : (
        <ul className="birzha-admin-summary-attention__list">
          {alerts.map((alert) => (
            <li key={alert.id}>
              <AdminSummaryAlertLink alert={alert} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
