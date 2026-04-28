import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { apiFetch, onApiUnauthorized, setStoredApiToken } from "../api/fetch-api.js";
import { prefetchCoreLists } from "../query/prefetch-app-data.js";
import { invalidateOfflineStorageForScopeChange } from "../sync/outbox-invalidation.js";
import { resolveOutboxScopeKey, syncOutboxScopeTo } from "../sync/outbox-scope.js";

export type ApiMeta = {
  name: string;
  domain?: string;
  batchesApi: string;
  tripsApi: string;
  tripShipmentLedger: string;
  tripSaleLedger: string;
  tripShortageLedger: string;
  /** `GET/POST /counterparties` при полном контуре API. */
  counterpartyCatalogApi?: string;
  /** Накладные и справочники закупки при полном контуре API. */
  purchaseDocumentsApi?: string;
  /** Таблица `ship_destinations` (направления для распределения), только при PostgreSQL. */
  shipDestinationsApi?: string;
  /** `POST /batches/…/warehouse-write-off` и `GET /warehouse-write-offs?purchaseDocumentId=` при PostgreSQL. */
  warehouseWriteOffApi?: string;
  syncApi: string;
  authApi: string;
  requireApiAuth: string;
};

export type AuthUser = {
  id: string;
  login: string;
  roles: { roleCode: string; scopeType: string; scopeId: string }[];
};

type AuthState = {
  ready: boolean;
  meta: ApiMeta | undefined;
  bootstrapError: Error | null;
  user: AuthUser | null;
};

type AuthContextValue = AuthState & {
  login: (login: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refetchSession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchMeUser(): Promise<AuthUser | null> {
  const ur = await apiFetch("/api/auth/me");
  if (ur.status === 401) {
    return null;
  }
  if (!ur.ok) {
    throw new Error(`GET /auth/me → ${ur.status}`);
  }
  const j = (await ur.json()) as { user: AuthUser };
  return j.user;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>({
    ready: false,
    meta: undefined,
    bootstrapError: null,
    user: null,
  });

  useLayoutEffect(() => {
    if (!state.ready || !state.meta) {
      return;
    }
    const nextScope = resolveOutboxScopeKey(state.meta.authApi === "enabled", state.user?.id);
    if (syncOutboxScopeTo(nextScope)) {
      invalidateOfflineStorageForScopeChange();
      void queryClient.invalidateQueries({ queryKey: ["outbox"] });
    }
  }, [queryClient, state.ready, state.meta?.authApi, state.user?.id]);

  /** Прогрев кеша списков после входа или при восстановлении сессии — быстрее первый заход в кабинеты. */
  useEffect(() => {
    if (!state.ready || !state.user || !state.meta) {
      return;
    }
    prefetchCoreLists(queryClient, {
      prefetchPurchaseDocuments: state.meta.purchaseDocumentsApi === "enabled",
      prefetchCounterparties: state.meta.counterpartyCatalogApi === "enabled",
    });
  }, [queryClient, state.ready, state.user?.id, state.meta]);

  const refetchSession = useCallback(async () => {
    const meta = state.meta;
    if (!meta || meta.authApi !== "enabled") {
      return;
    }
    try {
      const user = await fetchMeUser();
      setState((s) => ({ ...s, user }));
    } catch {
      setState((s) => ({ ...s, user: null }));
    }
  }, [state.meta]);

  useEffect(() => {
    return onApiUnauthorized(() => {
      setState((s) => ({ ...s, user: null }));
      void queryClient.invalidateQueries();
    });
  }, [queryClient]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const mr = await apiFetch("/api/meta");
        if (!mr.ok) {
          throw new Error(`meta ${mr.status}`);
        }
        const meta = (await mr.json()) as ApiMeta;
        if (cancelled) {
          return;
        }
        if (meta.authApi !== "enabled") {
          setState({ ready: true, meta, bootstrapError: null, user: null });
          return;
        }
        try {
          const user = await fetchMeUser();
          if (cancelled) {
            return;
          }
          setState({ ready: true, meta, bootstrapError: null, user });
        } catch (e) {
          if (cancelled) {
            return;
          }
          setState({
            ready: true,
            meta,
            bootstrapError: e instanceof Error ? e : new Error(String(e)),
            user: null,
          });
        }
      } catch (e) {
        if (cancelled) {
          return;
        }
        setState({
          ready: true,
          meta: undefined,
          bootstrapError: e instanceof Error ? e : new Error(String(e)),
          user: null,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(
    async (loginName: string, password: string) => {
      const res = await apiFetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: loginName, password }),
      });
      if (!res.ok) {
        const t = await res.text();
        let msg = t || `HTTP ${res.status}`;
        try {
          const j = JSON.parse(t) as { error?: string };
          if (j.error === "invalid_credentials") {
            msg = "Неверный логин или пароль";
          } else if (j.error === "account_disabled") {
            msg = "Учётная запись отключена";
          }
        } catch {
          /* use msg as is */
        }
        throw new Error(msg);
      }
      const data = (await res.json()) as { token: string; user: AuthUser };
      setStoredApiToken(data.token);
      setState((s) => ({ ...s, user: data.user }));
      await queryClient.invalidateQueries();
      prefetchCoreLists(queryClient, {
        prefetchPurchaseDocuments: state.meta?.purchaseDocumentsApi === "enabled",
        prefetchCounterparties: state.meta?.counterpartyCatalogApi === "enabled",
      });
    },
    [queryClient, state.meta],
  );

  const logout = useCallback(async () => {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    setStoredApiToken(null);
    setState((s) => ({ ...s, user: null }));
    await queryClient.invalidateQueries();
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      login,
      logout,
      refetchSession,
    }),
    [state, login, logout, refetchSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth вне AuthProvider");
  }
  return ctx;
}
