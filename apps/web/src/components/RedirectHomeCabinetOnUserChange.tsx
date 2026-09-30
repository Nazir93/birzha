import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../auth/auth-context.js";
import { postLoginRedirectPath } from "../auth/role-panels.js";
import { login as loginPath } from "../routes.js";

/**
 * После смены учётки (logout→login) URL чужого кабинета не должен оставаться открытым:
 * админ/менеджер имеют доступ к `/s`, поэтому без редиректа сверху «админ», а экран — продавца.
 */
export function RedirectHomeCabinetOnUserChange() {
  const { ready, meta, user } = useAuth();
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (!ready || meta?.authApi !== "enabled") {
      return;
    }
    const nextId = user?.id ?? null;
    const prevId = prevUserIdRef.current;
    prevUserIdRef.current = nextId;

    if (prevId === undefined) {
      return;
    }
    if (!user || nextId === null || nextId === prevId) {
      return;
    }
    if (pathname === loginPath || pathname.startsWith(`${loginPath}/`)) {
      return;
    }

    const here = `${pathname}${search}`;
    const target = postLoginRedirectPath(user, here);
    if (target !== here && target !== pathname) {
      navigate(target, { replace: true });
    }
  }, [ready, meta?.authApi, user, pathname, search, navigate]);

  return null;
}
