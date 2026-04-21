# Биржа — учёт товара (приём на складе по накладной → рейс → продажа)

Монорепозиторий на **pnpm** + **Turbo**. Код: [github.com/Nazir93/birzha](https://github.com/Nazir93/birzha).

## Требования

- Node.js **20+**
- [pnpm](https://pnpm.io/) 9+ (`corepack enable pnpm`)

## Структура

| Путь | Назначение |
|------|------------|
| `packages/domain` | Домен (`Batch`, `Money`), unit- и интеграционные тесты (sql.js) |
| `packages/contracts` | **Zod**-схемы тел HTTP и payload **POST /sync** — общие для `@birzha/api` и `@birzha/web` |
| `apps/api` | HTTP API: **Fastify**, **Drizzle** + PostgreSQL |
| `apps/web` | **Vite + React + TanStack Query + React Router + Zod** (формы операций и рейса согласованы с телами REST; прокси `/api` в dev) |
| `docs/` | Архитектура, спеки; **стек** — в этом файле (раздел ниже); **статус кода и очередь** — `docs/implementation-status.md`; **как заполнять формы (заказчик / сотрудники)** — `docs/guides/dlya-zakazchika-zapolnenie.md` |

## Стек (зафиксировано)

TypeScript, раздельные API и клиент, **PWA**, **PostgreSQL**.

| Слой | Выбор |
|------|--------|
| Runtime | Node.js 20+ / 22 LTS |
| API | **Fastify** + Zod (`@birzha/contracts` / локальные схемы) |
| БД | **PostgreSQL**; ORM: **Drizzle** |
| Тесты | **Vitest** |
| Интеграции без native SQLite на Windows | **sql.js** (`packages/domain`) |
| Клиент | **Vite + React** + TanStack Query + React Router; Zod на формах; стили `apps/web/src/ui/styles.ts`, `index.css` |
| PWA / офлайн | Workbox (Vite PWA) + **IndexedDB** outbox (`apps/web/src/sync`) |
| Монорепо | **pnpm** + **Turbo** — `packages/domain`, `packages/contracts`, `apps/api`, `apps/web` |

Next.js по умолчанию не используем. Подробности офлайна: `docs/architecture/offline/offline-sync.md`, `.cursor/rules/02-offline-sync.mdc`.

**Офлайн-клиент (черновик):** `apps/web/src/sync` — очередь в **IndexedDB** в браузере (однократная миграция из `birzha:outbox:v1` в `localStorage`); если открытие IDB не удалось или API нет — **память / `localStorage`**; `processSyncQueue()` / **`processSyncQueueSerialized()`** шлют на `POST /api/sync` по одному действию; в UI подключены автопопытки при **`online`** и при возврате на вкладку; при `rejected` голова очереди сохраняется.

## HTTP API (`apps/api`)

При запущенном `pnpm dev:api` и настроенном `DATABASE_URL` доступны маршруты партий:

| Метод | Путь | Тело (JSON) |
|-------|------|-------------|
| `GET` | `/trips` | — список рейсов |
| `GET` | `/trips/:tripId/shipment-report` | — `shipment`; **`sales`**: в т.ч. **`totalCashKopecks`**, **`totalDebtKopecks`** и по партиям; **`shortage`**; **`financials`** (выручка, себестоимость, валовая прибыль в копейках строками) |
| `GET` | `/trips/:tripId` | — карточка рейса |
| `POST` | `/trips` | `id`, `tripNumber` (рейс должен существовать до отгрузки партии в рейс) |
| `DELETE` | `/trips/:tripId` | Удалить рейс **только если** по нему нет отгрузок, продаж и недостач (**204**); иначе **409** `trip_not_empty`. Права как у `POST /trips` (логист / менеджер / admin). |
| `POST` | `/trips/:tripId/close` | — закрыть рейс (дальнейшие отгрузки в рейс — 409) |
| `GET` | `/warehouses` | — справочник складов поступления (`id`, `code`, `name`) |
| `POST` | `/warehouses` | `name`, опционально `code` (латиница, уник.) — новый склад (**201** `{ warehouse }`); конфликт кода — **409** `warehouse_code_conflict` |
| `GET` | `/product-grades` | — справочник калибров / кодов строк накладной (`id`, `code`, `displayName`, `sortOrder`), только **активные** |
| `POST` | `/product-grades` | `code`, `displayName`, опционально `sortOrder` (0–9999) — новый калибр (**201** `{ productGrade }`); конфликт кода — **409** `product_grade_code_conflict` |
| `POST` | `/purchase-documents` | Закупочная накладная: шапка (`documentNumber`, `docDate`, `warehouseId`, опционально `id`, `supplierName`, `buyerLabel`, `extraCostKopecks`) и **`lines`**: `productGradeId`, `totalKg`, `pricePerKg`, `lineTotalKopecks` (сверка с кг×ценой в копейках, допуск ±1 коп.), опционально `packageCount`. **Одна строка → одна партия** на складе. **201** `{ documentId }` |
| `GET` | `/purchase-documents` | — краткий список накладных |
| `GET` | `/purchase-documents/:documentId` | — накладная со строками (калибр, партия, суммы) |
| `GET` | `/batches` | — список партий; при PostgreSQL партии из накладной могут содержать **`nakladnaya`**: `productGradeCode`, `documentNumber` |
| `POST` | `/batches` | `id`, `purchaseId`, `totalKg`, `pricePerKg`, `distribution` (`awaiting_receipt` \| `on_hand`) — альтернатива ручному вводу партии без полной накладной |
| `POST` | `/batches/:batchId/receive-on-warehouse` | `kg` |
| `POST` | `/batches/:batchId/ship-to-trip` | `kg`, `tripId`, опционально `packageCount` (ящики в этой отгрузке) |
| `POST` | `/batches/:batchId/sell-from-trip` | `tripId`, `kg`, `saleId`, **`pricePerKg`** (руб/кг, ≥ 0); опционально **`paymentKind`**: `cash` (по умолчанию), `debt` (вся выручка в долг), `mixed` — тогда **`cashKopecksMixed`** (копейки налом, строка цифр или целое; остальное в долг); опционально **`counterpartyId`** (справочник) **или** **`clientLabel`** (до 120 симв., произвольная подпись) — для отчёта «по клиентам»; при **`counterpartyId`** имя берётся из справочника (снимок в БД) |
| `GET` | `/counterparties` | — активные контрагенты (`id`, `displayName`) |
| `POST` | `/counterparties` | `displayName` — создать контрагента (**201** `{ counterparty }`) |
| `POST` | `/batches/:batchId/record-trip-shortage` | `tripId`, `kg`, `reason` — недостача при приёмке рейса; списание из «в пути», запись в `trip_batch_shortages` |
| `POST` | `/sync` | Офлайн-синхронизация одного действия: `deviceId`, `localActionId`, `actionType`, `payload`. Типы: `sell_from_trip`, `ship_to_trip`, `record_trip_shortage`, `receive_on_warehouse`, `create_trip` (тело `payload` как у соответствующих REST-операций). Ответ **200**: `{ status: "ok", actionId, duplicate? }` или `{ status: "rejected", actionId, reason, resolution, errorCode?, details? }`. Идемпотентность по паре `(deviceId, localActionId)` — повтор после успеха даёт `duplicate: true`. |
| `POST` | `/auth/login` | `login`, `password` — при успехе **200**: `{ token, user }`, cookie `birzha_access` (HttpOnly). Неверные данные — **401** (`invalid_credentials`), отключённая учётная запись — **403** (`account_disabled`). Требуются PostgreSQL, миграции с таблицей `users` и **`JWT_SECRET`** в окружении. |
| `POST` | `/auth/logout` | **200** `{ ok: true }`, сброс cookie доступа. |
| `GET` | `/auth/me` | Текущий пользователь по `Authorization: Bearer <token>` или cookie; **401** без/с невалидным токеном. |

`GET /meta` → `batchesApi`, **`purchaseDocumentsApi`** (накладные и справочники закупки при полном бизнес-контуре API), `tripsApi`, `tripShipmentLedger`, `tripSaleLedger`, **`tripShortageLedger`**, **`counterpartyCatalogApi`**, **`syncApi`**, **`authApi`**, **`requireApiAuth`**: `enabled` | `disabled`.

**`REQUIRE_API_AUTH`** (`true` / `1`): бизнес-маршруты (партии, рейсы, **`POST /sync`**) требуют JWT и глобальные роли по упрощённой матрице в **`apps/api/src/http/route-auth.ts`** (роль **`admin`** обходит ограничения). Без токена — **401**, недостаточно прав — **403** `{ "error": "forbidden" }`. По умолчанию выключено. Вместе с флагом нужны **`DATABASE_URL`** и **`JWT_SECRET`**. В **`apps/web`** при **`requireApiAuth`** клиент уводит на **`/login`**; запросы идут через **`apiFetch`** (cookie + `Authorization` из `sessionStorage`).

Пароль в БД хранится как **scrypt** (префикс `scrypt$…` в `users.password_hash`). Первого пользователя удобно создать скриптом (на сервере при заполненном `apps/api/.env`): **`cd apps/api && pnpm create-user -- --login ЛОГИН --password 'ПАРОЛЬ' --role admin`** (роли см. `docs/deployment/runbook.md`). Альтернатива — INSERT в `users` и `user_roles` вручную; хэш — `hashPassword` из `apps/api/src/auth/password-scrypt.ts`.

Отгрузка в рейс (`trip_batch_shipments`), продажа (`trip_batch_sales`) и недостача (`trip_batch_shortages`) в PostgreSQL выполняются в **транзакции** с обновлением партии там, где это настроено в приложении.

Фронт в dev ходит на бэкенд через прокси `/api` (см. `apps/web/vite.config.ts`). Сборка `apps/web` генерирует **PWA**: `manifest.webmanifest`, кастомный SW `src/sw.ts` (**injectManifest**: precache, SPA-навигация, опционально **Background Sync**), регистрация в `main.tsx`; проверка установки — `pnpm dev:web` не обязательно поднимает SW (см. настройки `vite-plugin-pwa`), удобнее `pnpm --filter @birzha/web build` и `pnpm --filter @birzha/web preview`.

## Команды

```bash
pnpm install
pnpm test
pnpm build
pnpm dev:api    # API http://127.0.0.1:3000
pnpm dev:web    # UI http://127.0.0.1:5173
```

### E2E (Playwright)

Первый раз на машине: `pnpm exec playwright install chromium`.

Сборка web и дымовой тест в браузере (поднимается API **in-memory** на порту 3099 и `vite preview` на 4173, см. `playwright.config.ts`):

```bash
pnpm e2e
```

После **`pnpm check`** можно без повторной сборки web: **`pnpm e2e:run`** (то же, что в CI: `pnpm exec playwright test`).

Полная сходимость по операциям — в `apps/api` (Vitest, `golden-scenario.flow.test.ts`); в браузере — те же ключевые числа (в т.ч. сценарий 5000 кг → отгрузка → недостача → продажа) в `e2e/golden-smoke.spec.ts`, плюс CSV, офлайн, операции, навигация.

**E2E навигации по ролям (PostgreSQL):** поднимите Postgres (локально или на хосте — см. раздел **API и база**), задайте **`E2E_DATABASE_URL`**, **`E2E_JWT_SECRET`** (≥ 32 символов) и при необходимости **`E2E_TEST_PASSWORD`** (пароль пользователей `e2e_accountant` / `e2e_warehouse`; по умолчанию совпадает с сидом в коде). Запуск: **`pnpm e2e:roles`** (только `e2e/role-nav-auth.spec.ts`). Сервер `apps/api/src/e2e-server.ts` при **`E2E_DATABASE_URL`** применяет миграции, сид `e2e-seed-role-users.ts`, включает **`REQUIRE_API_AUTH`** (отключить: `E2E_REQUIRE_API_AUTH=false`). Без этих переменных тесты в `e2e/role-nav-auth.spec.ts` в отчёте Playwright помечаются как пропущенные. **Не выставляйте `E2E_DATABASE_URL` при полном `pnpm exec playwright test`** — дым `golden-smoke` рассчитан на in-memory API без обязательного JWT на REST. В **GitHub Actions** job **`e2e-auth-nav`** гоняет сценарий ролей отдельно от основного E2E.

### CI

В репозитории — GitHub Actions (`.github/workflows/ci.yml`): `pnpm check`, затем установка Chromium и **`pnpm exec playwright test`** (после сборки в `check` уже есть `apps/web/dist`).

### Продакшен и хостинг

**Сейчас:** исходники в **GitHub**; **отдельный сервер под продукт не куплен и не развёрнут** — нет публичного прод-API и прод-базы в этом репозитории как готовой инфраструктуры.

**CI на GitHub** — это проверки на машинах GitHub при push/PR, не замена вашего хостинга.

**Локальная разработка:** `pnpm dev:api` / `pnpm dev:web`, при необходимости PostgreSQL на машине (см. раздел **API и база**).

**Когда появится сервер** — пошаговый чеклист для Ubuntu/VPS: **`docs/deployment/vps-ubuntu.md`**; краткий порядок шагов — **`docs/deployment/runbook.md`**; пример **nginx** без секретов — **`deploy/nginx-birzha.example.conf`**. После первого клона обновления из Git: **`deploy/server-update.sh`** (см. **`deploy/README.md`**); опционально ручной деплой из **GitHub Actions** (workflow **Deploy to server**, секреты SSH — в **`deploy/README.md`**). Нужны PostgreSQL, переменные окружения (`DATABASE_URL`, `JWT_SECRET` и т.д.), процесс запуска `apps/api` (например systemd), раздача статики из `apps/web/dist` и обратный прокси для `/api`, HTTPS, резервное копирование БД.

### API и база

Скопируйте `apps/api/.env.example` в `apps/api/.env`. Для **рабочих** маршрутов партий, рейсов и sync задайте **`DATABASE_URL`**: иначе процесс слушает порт и отвечает на `/health`, но в **`GET /meta`** будет `batchesApi: disabled` (и соответствующие HTTP-операции не подключены). Вместе с **`DATABASE_URL`** задайте **`JWT_SECRET`** (не короче 32 символов) — иначе конфиг не поднимется; при этом включаются маршруты **`/auth/*`** (`authApi: enabled` в **`GET /meta`**). **`pnpm e2e`** использует отдельный процесс **`e2e-server`** с in-memory хранилищем — без PostgreSQL.

PostgreSQL: установите на своей машине или на сервере (пакет ОС или админ-хостинг) — важно лишь корректный **`DATABASE_URL`** в `apps/api/.env`. Пример развёртывания на VPS: **`docs/deployment/vps-ubuntu.md`**. После запуска БД:

```bash
cd apps/api && pnpm db:push
```

## Документация для агента

- **`AGENTS.md`** — **единые точки опоры**, таблица «куда смотреть», **синхронизация правок**, практики **качества кода** (слои монорепо, чеклист задачи); без лишних `docs/*-guide`
- `PROJECT_MASTER_SPEC.md`, `CLAUDE.md`
- `docs/implementation-status.md` — **текущий этап** и что дальше
- `.cursor/rules/*.mdc`

Проверка перед коммитом: `pnpm check` (тесты + сборка). Turbo перед тестами API собирает `@birzha/domain`, чтобы импорт из `dist` совпадал с исходниками.

Сквозной сценарий сходимости (облегчённый): `apps/api/src/http/golden-scenario.flow.test.ts`, спецификация — `docs/testing/golden-scenario.md`.

Если запускать `vitest` только в `apps/api` вручную, сначала `pnpm --filter @birzha/domain build`.

Интеграционные тесты Drizzle с суффиксом `*.pg.integration.test.ts` нужны запущенный PostgreSQL и переменная **`TEST_DATABASE_URL`** (можно равна `DATABASE_URL` после настройки БД и применения миграций из `apps/api/drizzle/`, включая **`0009`** — пользователи/роли, и **`0011`** — накладная, склады, калибры).
