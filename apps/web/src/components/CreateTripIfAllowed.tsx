import { canCreateTrip } from "../auth/role-panels.js";
import { useAuth } from "../auth/auth-context.js";
import { CreateTripForm } from "./CreateTripForm.js";

/**
 * Форма нового рейса — только если на API разрешён TRIP_WRITE (согласуется с `CreateTripForm` / POST /trips).
 */
export function CreateTripIfAllowed() {
  const { user } = useAuth();
  if (!user || !canCreateTrip(user)) {
    return null;
  }
  return <CreateTripForm />;
}
