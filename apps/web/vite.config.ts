import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vite";

const apiProxyTarget = `http://127.0.0.1:${process.env.E2E_API_PORT ?? "3000"}`;
/** Старт PWA из манифеста. По умолчанию `/` (дальше редирект по роли). Для продавца: `VITE_PWA_START_URL=/s` при `vite build`. */
const pwaStartUrl = process.env.VITE_PWA_START_URL?.trim() || "/";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "autoUpdate",
      injectRegister: false,
      includeAssets: ["pwa-icon.svg"],
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,ico,svg,woff2}"],
      },
      manifest: {
        name: "Биржа",
        short_name: "Биржа",
        description: "Учёт: закупка → склад → рейс → продажа",
        theme_color: "#f4f4f5",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "portrait-primary",
        lang: "ru",
        start_url: pwaStartUrl,
        scope: "/",
        icons: [
          {
            src: "/pwa-icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: apiProxyTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
  preview: {
    port: 4173,
    strictPort: true,
    proxy: {
      "/api": {
        target: apiProxyTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
