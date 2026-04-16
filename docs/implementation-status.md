# Статус внедрения

**Единая точка правды:** что уже сделано в коде и что делать дальше (по `PROJECT_MASTER_SPEC.md`). Обновлять при завершении заметного шага.

**Актуально на:** 2026-04-16.

---

## Сводка по этапам

| Этап | Описание | Статус |
|------|----------|--------|
| 0 | Монорепо pnpm + Turbo, Vitest, sql.js, Drizzle + PostgreSQL в API, web-каркас | ✅ |
| 1 | Домен `Batch`, `Money`, тесты | ✅ |
| 2 | Use cases + порты + in-memory тесты | ✅ см. раздел «Сделано» ниже |
| 3 | Репозитории Drizzle, миграции `drizzle/0000`…`0006` (нал/долг по строке продажи), PG-интеграции при `TEST_DATABASE_URL` | ✅ |
| 4 | REST API (Fastify), сквозные тесты, золотой HTTP-flow, 409 на избыток недостачи, PG-тест журнала недостач | ✅ |
| 5 | Офлайн-синхронизация | 🔄 сервер `POST /sync`; клиент `apps/web/src/sync` (**IndexedDB** outbox + миграция из legacy `localStorage`, `processSyncQueue`); **PWA** (manifest + SW precache + `registerSW`); **демо в `App`**: длина очереди, «в очередь» (`create_trip`), «синхронизировать» |
| 6 | Расширенные отчёты (сходимость «как часы» в продуктовом смысле) | ⏳ |
| 7 | UI / PWA | 🔄 минимальный UI очереди офлайна в `App`; базовый PWA (установка, кэш shell); полноценные экраны — дальше |
| 8 | Пилот и итерации | ⏳ |

---

## Сделано (зафиксировано в репозитории)

### Домен (`packages/domain`)

- `Batch`: склад / в пути / продано / списано, отгрузка в рейс, продажа с рейса, `writeOffFromTransit` (недостача при приёмке), инварианты и тесты.
- `Trip`, `Money`, прочие unit-тесты.

### Заявки (use cases) и порты (`apps/api`)

- Закупка и склад: `CreatePurchase`, `ReceiveOnWarehouse`.
- Рейс: `CreateTrip`, `CloseTrip`, `ShipToTrip` (транзакция с БД при PG).
- Продажа с рейса: `SellFromTrip` с учётом **уже учтённой недостачи** по паре рейс–партия; **нал / долг / смешанная оплата** (`paymentKind`, `cashKopecksMixed`); транзакция с БД при PG.
- Недостача: `RecordTripShortage` — списание из «в пути», запись в журнал; лимит: отгружено − продано − ранее недостача.
- Отчёт: `GetTripReport` — отгрузки, продажи, **агрегат недостач**; **деньги по рейсу** (`financials`): выручка из журнала продаж, себестоимость проданного и недостачи по **закупочной цене партии** (`Batch.getPricePerKg()`), валовая прибыль — всё в копейках (`trip-financials.ts`).

### HTTP API

- Партии: создание, оприходование, отгрузка в рейс, продажа с рейса, **фиксация недостачи** `POST /batches/:batchId/record-trip-shortage` (`tripId`, `kg`, `reason`).
- Рейсы: список, создание, карточка, закрытие.
- Отчёт: `GET /trips/:tripId/shipment-report` — `shipment`, **`sales`** (в т.ч. `totalCashKopecks` / `totalDebtKopecks` по рейсу и по партиям), **`shortage`**, **`financials`**.
- Служебное: `/health`, `/health/ready`, `/meta` — в т.ч. `tripShortageLedger`, **`syncApi`**.
- **Офлайн (сервер):** `POST /sync` — одно действие за запрос, идемпотентность `(deviceId, localActionId)` в таблице `sync_processed_actions` (PG) или in-memory в тестах; отказ бизнес-правил → **200** и `{ status: "rejected", reason, resolution, ... }` (см. `.cursor/rules/02-offline-sync.mdc`).

### База данных

- Миграции до **`0007`** — в т.ч. **`sync_processed_actions`** (`0007`).
- Отгрузка, продажа, недостача с PG — в транзакциях там, где это уже проведено в `app.ts`.

### Веб-клиент (`apps/web`)

- Модуль **`src/sync`**: outbox по умолчанию в **IndexedDB** (`birzha-offline`), миграция из `birzha:outbox:v1`; публичные **`loadOutbox`** / **`enqueue`** (async); для тестов — `*Sync` + явный `StorageLike`; **`processSyncQueue`** (FIFO, стоп при `rejected` или сетевой ошибке); **`processSyncQueueSerialized`** (один параллельный прогон); **`subscribeSyncOnOnline`** — при `online`, возврате на вкладку и при монтировании (если сеть есть). Vitest: `outbox-queue.test.ts`, `process-sync-queue.test.ts`, `process-sync-queue-serial.test.ts`, `outbox-idb.test.ts` (fake-indexeddb).
- **`App`**: загрузка `/api/meta` (в т.ч. `syncApi`); блок «Офлайн»: счётчик очереди, добавление тестового `create_trip`, отправка очереди на `POST /api/sync`, вывод последнего результата синхронизации.
- **PWA** (`vite-plugin-pwa`): `manifest.webmanifest`, precache ассетов, `registerSW` в `main.tsx`; иконка `public/pwa-icon.svg`.

### Тесты

- Unit / HTTP по API; `trip-financials.test.ts` — расчёт `grossProfit` из агрегатов; **золотой сценарий** `apps/api/src/http/golden-scenario.flow.test.ts`: отгрузка → недостача → продажа → сходимость граммов, выручки, `shortage` и **`financials`**.
- HTTP: **409 `trip_shortage_exceeds_net`** при `record-trip-shortage` сверх нетто — `batch-routes.test.ts`.
- PostgreSQL (при **`TEST_DATABASE_URL`**): `trip-shortage-repository.pg.integration.test.ts` — append, сумма по паре рейс–партия, агрегат по рейсу (как остальные `*.pg.integration.test.ts`).
- Спецификация сценария: `docs/testing/golden-scenario.md`.

---

## Очередь работ (рекомендуемый порядок)

Нумерация — для пошагового следования; при конфликте с заказчиком приоритет у продуктовых требований.

1. **Этап 5 (продолжение)** — при необходимости **Background Sync API** (или периодический таймер только при открытой вкладке); при сбоях IDB — доработать fallback (сейчас: среда без IndexedDB → `localStorage`/память).
2. **Этап 6** — отчёты для операционки (фура, сверки; при необходимости — уточнение `financials`: доп. расходы, налоги — только после правил заказчика).
3. **Этап 7** — расширение UI (формы сущностей, навигация) и PWA под уже готовое API; демо-очередь в `App` — задел.

**Сделано по нал/долг:** строка продажи хранит разбиение выручки; отчёт агрегирует `totalCashKopecks` / `totalDebtKopecks`; золотой тест — продажа в долг (`paymentKind: "debt"`).

**Сознательно позже (не блокируют очередь):** возвраты; **частичные оплаты долгов** и проводки по ним — только после матрицы прав (`07-debts-returns-and-role-edge-cases.mdc`); см. `PROJECT_MASTER_SPEC.md`, часть 6.

---

## Связанные файлы

| Файл | Назначение |
|------|------------|
| `PROJECT_MASTER_SPEC.md` | Принципы и дорожная карта этапов 0–8 |
| `docs/testing/golden-scenario.md` | Целевой E2E-сценарий и пробелы в тесте |
| `README.md` | Команды, таблица HTTP API |
