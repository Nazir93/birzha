import { Navigate } from "react-router-dom";

/** Старый путь `seller-dispatch` → единый раздел `assign-seller`. */
export function RedirectSellerDispatchRoute() {
  return <Navigate to="../assign-seller" replace />;
}
