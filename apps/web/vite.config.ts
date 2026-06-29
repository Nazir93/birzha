import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vite";

const apiProxyTarget = `http://127.0.0.1:${process.env.E2E_API_PORT ?? "3000"}`;
/** Продакшен: один origin (напр. https://24birzha.ru), запросы `/api` на том же хосте проксирует nginx. */
/** Старт PWA из манифеста. Для продавца на prod: `VITE_PWA_START_URL=/s` при `vite build`. */
const pwaStartUrl = process.env.VITE_PWA_START_URL?.trim() || "/";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "prompt",
      injectRegister: false,
      includeAssets: [
        "pwa-icon.svg",
        "pwa-192.png",
        "pwa-512.png",
        "pwa-maskable-512.png",
        "apple-touch-icon.png",
        "favicon-16.png",
        "favicon-32.png",
      ],
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,ico,svg,png,woff2}"],
      },
      manifest: {
        name: "Биржа",
        short_name: "Биржа",
        description: "Учёт: закупка → склад → рейс → продажа",
        theme_color: "#18181b",
        background_color: "#18181b",
        display: "standalone",
        orientation: "portrait-primary",
        lang: "ru",
        start_url: pwaStartUrl,
        scope: "/",
        icons: [
          {
            src: "/pwa-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/pwa-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/pwa-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
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
