import { useSearchParams } from "react-router-dom";

import { canCreateTrip } from "../auth/role-panels.js";
import { useAuth } from "../auth/auth-context.js";
import { CreateTripForm } from "./CreateTripForm.js";

/**
 * Форма нового рейса — только если на API разрешён TRIP_WRITE (согласуется с `CreateTripForm` / POST /trips).
 * Если в URL уже есть `?trip=…` (ссылка на отчёт по рейсу), блок по умолчанию свёрнут — экран про просмотр, не про создание.
 */
export function CreateTripIfAllowed() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const tripDeepLink = Boolean(searchParams.get("trip")?.trim());

  if (!user || !canCreateTrip(user)) {
    return null;
  }
  return <CreateTripForm disclosureDefaultOpen={!tripDeepLink} />;
}
