import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { registerSW } from "virtual:pwa-register";

import { AuthProvider } from "./auth/auth-context.js";
import { App } from "./App";

import "./index.css";
import { QUERY_GC_MS, QUERY_STALE_LISTS_MS } from "./query/query-defaults.js";

registerSW({ immediate: true });

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      /** Списки и отчёты в интерфейсе не обязаны опрашивать API каждые секунды — см. `query/query-defaults.ts`. */
      staleTime: QUERY_STALE_LISTS_MS,
      gcTime: QUERY_GC_MS,
      /** Иначе при Alt+Tab каждый раз полный refetch активных запросов — ощущение «тормозов». */
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
