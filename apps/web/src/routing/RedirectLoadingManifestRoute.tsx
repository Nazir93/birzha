import { Navigate, useLocation, useParams } from "react-router-dom";

/** Старый путь `/loading-manifests` → единый раздел `/distribution`. */
export function RedirectLoadingManifestRoute() {
  const { manifestId } = useParams();
  const { pathname } = useLocation();
  const base = pathname.replace(/\/loading-manifests(\/.*)?$/, "/distribution");
  const id = manifestId?.trim();
  const to = id ? `${base}/${encodeURIComponent(id)}` : base;
  return <Navigate to={to} replace />;
}
