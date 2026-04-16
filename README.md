# Биржа — учёт товара (закупка → склад → рейс → продажа)

Монорепозиторий на **pnpm** + **Turbo**.

## Требования

- Node.js **20+**
- [pnpm](https://pnpm.io/) 9+ (`corepack enable pnpm`)

## Структура

| Путь | Назначение |
|------|------------|
| `packages/domain` | Домен (`Batch`, `Money`), unit- и интеграционные тесты (sql.js) |
| `apps/api` | HTTP API: **Fastify**, **Drizzle** + PostgreSQL |
| `apps/web` | **Vite + React + TanStack Query** (прокси `/api` → бэкенд в dev) |
| `docs/` | Архитектура, спеки, `PROJECT_MASTER_SPEC.md` |

**Офлайн-клиент (черновик):** `apps/web/src/sync` — очередь в **IndexedDB** в браузере (однократная миграция из `birzha:outbox:v1` в `localStorage`), без IDB — память / `localStorage`; `processSyncQueue()` / **`processSyncQueueSerialized()`** шлют на `POST /api/sync` по одному действию; в UI подключены автопопытки при **`online`** и при возврате на вкладку; при `rejected` голова очереди сохраняется.

## HTTP API (`apps/api`)

При запущенном `pnpm dev:api` и настроенном `DATABASE_URL` доступны маршруты партий:

| Метод | Путь | Тело (JSON) |
|-------|------|-------------|
| `GET` | `/trips` | — список рейсов |
| `GET` | `/trips/:tripId/shipment-report` | — `shipment`; **`sales`**: в т.ч. **`totalCashKopecks`**, **`totalDebtKopecks`** и по партиям; **`shortage`**; **`financials`** (выручка, себестоимость, валовая прибыль в копейках строками) |
| `GET` | `/trips/:tripId` | — карточка рейса |
| `POST` | `/trips` | `id`, `tripNumber` (рейс должен существовать до отгрузки партии в рейс) |
| `POST` | `/trips/:tripId/close` | — закрыть рейс (дальнейшие отгрузки в рейс — 409) |
| `POST` | `/batches` | `id`, `purchaseId`, `totalKg`, `pricePerKg`, `distribution` (`awaiting_receipt` \| `on_hand`) |
| `POST` | `/batches/:batchId/receive-on-warehouse` | `kg` |
| `POST` | `/batches/:batchId/ship-to-trip` | `kg`, `tripId` |
| `POST` | `/batches/:batchId/sell-from-trip` | `tripId`, `kg`, `saleId`, **`pricePerKg`** (руб/кг, ≥ 0); опционально **`paymentKind`**: `cash` (по умолчанию), `debt` (вся выручка в долг), `mixed` — тогда **`cashKopecksMixed`** (копейки налом, строка цифр или целое; остальное в долг) |
| `POST` | `/batches/:batchId/record-trip-shortage` | `tripId`, `kg`, `reason` — недостача при приёмке рейса; списание из «в пути», запись в `trip_batch_shortages` |
| `POST` | `/sync` | Офлайн-синхронизация одного действия: `deviceId`, `localActionId`, `actionType`, `payload`. Типы: `sell_from_trip`, `ship_to_trip`, `record_trip_shortage`, `receive_on_warehouse`, `create_trip` (тело `payload` как у соответствующих REST-операций). Ответ **200**: `{ status: "ok", actionId, duplicate? }` или `{ status: "rejected", actionId, reason, resolution, errorCode?, details? }`. Идемпотентность по паре `(deviceId, localActionId)` — повтор после успеха даёт `duplicate: true`. |

`GET /meta` → `batchesApi`, `tripsApi`, `tripShipmentLedger`, `tripSaleLedger`, **`tripShortageLedger`**, **`syncApi`**: `enabled` | `disabled`.

Отгрузка в рейс (`trip_batch_shipments`), продажа (`trip_batch_sales`) и недостача (`trip_batch_shortages`) в PostgreSQL выполняются в **транзакции** с обновлением партии там, где это настроено в приложении.

Фронт в dev ходит на бэкенд через прокси `/api` (см. `apps/web/vite.config.ts`). Сборка `apps/web` генерирует **PWA**: `manifest.webmanifest`, service worker (precache статики), регистрация в `main.tsx`; проверка установки — `pnpm dev:web` не обязательно поднимает SW (см. настройки `vite-plugin-pwa`), удобнее `pnpm --filter @birzha/web build` и `pnpm --filter @birzha/web preview`.

## Команды

```bash
pnpm install
pnpm test
pnpm build
pnpm dev:api    # API http://127.0.0.1:3000
pnpm dev:web    # UI http://127.0.0.1:5173
```

### API и база

Скопируйте `apps/api/.env.example` в `apps/api/.env`. Без `DATABASE_URL` сервер поднимется, а `/health/ready` вернёт `database: not_configured`.

PostgreSQL локально: `docker compose up -d` в корне (см. `docker-compose.yml`), затем:

```bash
cd apps/api && pnpm db:push
```

(нужен корректный `DATABASE_URL` в `.env`.)

## Документация для агента

- `PROJECT_MASTER_SPEC.md`, `CLAUDE.md`
- `docs/implementation-status.md` — **текущий этап** и что дальше
- `.cursor/rules/*.mdc`

Проверка перед коммитом: `pnpm check` (тесты + сборка). Turbo перед тестами API собирает `@birzha/domain`, чтобы импорт из `dist` совпадал с исходниками.

Сквозной сценарий сходимости (облегчённый): `apps/api/src/http/golden-scenario.flow.test.ts`, спецификация — `docs/testing/golden-scenario.md`.

Если запускать `vitest` только в `apps/api` вручную, сначала `pnpm --filter @birzha/domain build`.

Интеграционный тест `DrizzleBatchRepository` нужен запущенный PostgreSQL и переменная **`TEST_DATABASE_URL`** (можно равна `DATABASE_URL` после `docker compose up` и `pnpm --filter @birzha/api db:push` или применения миграций из `apps/api/drizzle/`).
