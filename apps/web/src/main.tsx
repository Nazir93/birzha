import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./auth/auth-context.js";
import { App } from "./App";
import { BirzhaThemeProvider } from "./theme/BirzhaThemeProvider.js";
import { createWebQueryClient } from "./query/create-web-query-client.js";
import { WebQueryProvider } from "./query/WebQueryProvider.js";
import { MutationErrorBanner } from "./query/MutationErrorBanner.js";
import { GlobalOutboxSyncSubscriber } from "./sync/GlobalOutboxSyncSubscriber.js";
import { AppErrorBoundary } from "./ui/AppErrorBoundary.js";
import { PwaInstallBanner } from "./ui/PwaInstallBanner.js";
import { PwaUpdateBanner } from "./ui/PwaUpdateBanner.js";

import "./index.css";
import { syncBirzhaThemeFromStorage } from "./theme/birzha-theme.js";

syncBirzhaThemeFromStorage();

const queryClient = createWebQueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BirzhaThemeProvider>
      <WebQueryProvider client={queryClient}>
        <GlobalOutboxSyncSubscriber />
        <PwaInstallBanner />
        <PwaUpdateBanner />
        <MutationErrorBanner />
        <AuthProvider>
          <BrowserRouter>
            <AppErrorBoundary>
              <App />
            </AppErrorBoundary>
          </BrowserRouter>
        </AuthProvider>
      </WebQueryProvider>
    </BirzhaThemeProvider>
  </StrictMode>,
);
