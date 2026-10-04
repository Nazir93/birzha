import { Link } from "react-router-dom";

import { accounting } from "../routes.js";

export function AccountingSectionBack() {
  return (
    <p className="birzha-ui-sm" style={{ margin: "0 0 0.85rem" }}>
      <Link to={accounting.home}>← Сводка кассы</Link>
    </p>
  );
}
