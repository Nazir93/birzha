# Зафиксированный стек (рабочее решение)

Согласовано для разработки: **TypeScript**, разделение **API** и **клиента**, **PWA** для продавцов, **PostgreSQL**.

| Слой | Выбор |
|------|--------|
| Runtime | Node.js 20+ / 22 LTS |
| API | **Fastify** + валидация схем (например Zod) |
| БД | **PostgreSQL**; доступ: **Prisma** или **Drizzle** (выбрать при первом коммите схемы) |
| Тесты | **Vitest** |
| SQLite в памяти (интеграционные тесты без native build на Windows) | **sql.js** |
| Клиент (админка + продавец) | **Vite + React** + **TanStack Query** |
| PWA / офлайн | Service Worker (например Serwist / Workbox) + **IndexedDB** (часто **Dexie**) |
| Монорепо | **pnpm** + **Turbo** — каталоги `packages/domain`, `apps/api`, `apps/web` (см. `README.md`) |

**Next.js** по умолчанию не используем; имеет смысл отдельно, если появится сильный запрос на SSR/SEO/публичный сайт.

Подробности офлайна: `docs/architecture/offline/offline-sync.md` и `.cursor/rules/02-offline-sync.mdc`.
