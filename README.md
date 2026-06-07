# Биржа — учёт товара (приём на складе по накладной → рейс → продажа)

Монорепозиторий на **pnpm** + **Turbo**. Код: [github.com/Nazir93/birzha](https://github.com/Nazir93/birzha).

## Требования

- Node.js **20+**
- [pnpm](https://pnpm.io/) 9+ (`corepack enable pnpm`)

## Структура

| Путь | Назначение |
|------|------------|
| `packages/domain` | Домен (`Batch`, `Money`), unit- и интеграционные тесты (sql.js) |
| `packages/contracts` | **Zod**-схемы тел HTTP — общие для `@birzha/api` и `@birzha/web` |
| `apps/api` | HTTP API: **Fastify**, **Drizzle** + PostgreSQL |
| `apps/web` | **Vite + React + TanStack Query + React Router + Zod** (формы операций и рейса согласованы с телами REST; прокси `/api` в dev) |
| `docs/` | Архитектура; **краткий индекс** — `docs/architecture/README.md`; **кабинеты и план входов** — `docs/architecture/cabinets.md`; **как заполнять формы** — `docs/guides/dlya-zakazchika-zapolnenie.md` |

## Стек (зафиксировано)

TypeScript, раздельные API и клиент, **PostgreSQL**.

| Слой | Выбор |
|------|--------|
| Runtime | Node.js 20+ / 22 LTS |
| API | **Fastify** + Zod (`@birzha/contracts` / локальные схемы) |
| БД | **PostgreSQL**; ORM: **Drizzle** |
| Тесты | **Vitest** |
| Интеграции без native SQLite на Windows | **sql.js** (`packages/domain`) |
| Клиент | **Vite + React** + TanStack Query + React Router; Zod на формах; стили `apps/web/src/ui/styles.ts`, `index.css` |
| Монорепо | **pnpm** + **Turbo** — `packages/domain`, `packages/contracts`, `apps/api`, `apps/web` |

Next.js по умолчанию не используем.

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
| `GET` | `/batches` | — список партий; при PostgreSQL: **`nakladnaya`** (калибр, накладная) и при необходимости **`allocation`**: `qualityTier`, `destination` |
| `PATCH` | `/batches/:batchId/allocation` | Качество и направление по партии: `qualityTier` (`standard` \| `weak` \| `reject` \| `null`) и/или `destination` (`moscow` \| `regions` \| `discount` \| `writeoff` \| `null`). **Только с PostgreSQL**; без БД — **503**. Права как у ввода накладной. |
| `POST` | `/batches` | `id`, `purchaseId`, `totalKg`, `pricePerKg`, `distribution` (`awaiting_receipt` \| `on_hand`) — альтернатива ручному вводу партии без полной накладной |
| `POST` | `/batches/:batchId/receive-on-warehouse` | `kg` |
| `POST` | `/batches/:batchId/ship-to-trip` | `kg`, `tripId`, опционально `packageCount` (ящики в этой отгрузке) |
| `POST` | `/batches/:batchId/sell-from-trip` | `tripId`, `kg`, `saleId`, **`pricePerKg`** (руб/кг, ≥ 0); опционально **`paymentKind`**: `cash` (по умолчанию), `debt` (вся выручка в долг), `mixed` — тогда **`cashKopecksMixed`** (копейки налом, строка цифр или целое; остальное в долг); опционально **`counterpartyId`** (справочник) **или** **`clientLabel`** (до 120 симв., произвольная подпись) — для отчёта «по клиентам»; при **`counterpartyId`** имя берётся из справочника (снимок в БД) |
| `GET` | `/counterparties` | — активные контрагенты (`id`, `displayName`) |
| `POST` | `/counterparties` | `displayName` — создать контрагента (**201** `{ counterparty }`) |
| `POST` | `/batches/:batchId/record-trip-shortage` | `tripId`, `kg`, `reason` — недостача при приёмке рейса; списание из «в пути», запись в `trip_batch_shortages` |
| `POST` | `/auth/login` | `login`, `password` — при успехе **200**: `{ token, user }`, cookie `birzha_access` (HttpOnly). Любой неуспешный вход — **401** (`invalid_credentials`) без раскрытия причины (включая отключённые учётные записи). Требуются PostgreSQL, миграции с таблицей `users` и **`JWT_SECRET`** в окружении. |
| `POST` | `/auth/logout` | **200** `{ ok: true }`, сброс cookie доступа. |
| `GET` | `/auth/me` | Текущий пользователь по `Authorization: Bearer <token>` или cookie; **401** без/с невалидным токеном. |

`GET /meta` → `batchesApi`, **`purchaseDocumentsApi`** (накладные и справочники закупки при полном бизнес-контуре API), `tripsApi`, `tripShipmentLedger`, `tripSaleLedger`, **`tripShortageLedger`**, **`counterpartyCatalogApi`**, **`authApi`**, **`requireApiAuth`**, **`adminUsersApi`** (управление сотрудниками в UI при БД + `JWT_SECRET` + **`REQUIRE_API_AUTH`**): `enabled` | `disabled`.

**`REQUIRE_API_AUTH`** (`true` / `1`): бизнес-маршруты (партии, рейсы) требуют JWT и глобальные роли по упрощённой матрице в **`apps/api/src/http/route-auth.ts`** (роль **`admin`** обходит ограничения). Без токена — **401**, недостаточно прав — **403** `{ "error": "forbidden" }`. Нужны **`DATABASE_URL`** и **`JWT_SECRET`**. В **production**, если переменную **не задавать**, при заданных БД и секрете вход считается **обязательным** (`loadEnv` в **`apps/api/src/config.ts`**); в **development** по умолчанию выключено (удобно для локальной отладки); явно **`REQUIRE_API_AUTH=true`** включает форму входа и на деве. В **`apps/web`** при **`requireApiAuth`** клиент уводит на **`/login`**; запросы идут через **`apiFetch`** (cookie + `Authorization` из `sessionStorage`).

Пароль в БД хранится как **scrypt** (префикс `scrypt$…` в `users.password_hash`). У каждого человека **свой уникальный логин** (`users.login`); учётную запись создают скриптом **`pnpm create-user`** (повторять для каждого сотрудника с другим `--login`). Пример: **`cd apps/api && BIRZHA_CREATE_USER_PASSWORD='ПАРОЛЬ' pnpm create-user -- --login ЛОГИН --role seller`** (роли см. `docs/deployment/runbook.md`). `--password` ещё поддерживается, но не рекомендуется: пароль может попасть в историю команд. Альтернатива — INSERT в `users` и `user_roles` вручную; хэш — `hashPassword` из `apps/api/src/auth/password-scrypt.ts`.

Отгрузка в рейс (`trip_batch_shipments`), продажа (`trip_batch_sales`) и недостача (`trip_batch_shortages`) в PostgreSQL выполняются в **транзакции** с обновлением партии там, где это настроено в приложении.

Фронт в dev ходит на бэкенд через прокси `/api` (см. `apps/web/vite.config.ts`).

## Команды

```bash
pnpm install
pnpm typecheck   # tsc: web, contracts, domain, api — без emit
pnpm check       # typecheck + vitest (turbo) + build — рекомендуется перед коммитом/PR
pnpm test
pnpm build
pnpm dev:api     # API http://127.0.0.1:3000
pnpm dev:web     # UI http://127.0.0.1:5173
```

### E2E (Playwright)

Первый раз на машине: `pnpm exec playwright install chromium`.

Сборка web и дымовой тест в браузере (поднимается API **in-memory** на порту 3099 и `vite preview` на 4173, см. `playwright.config.ts`):

```bash
pnpm e2e
```

После **`pnpm check`** можно без повторной сборки web: **`pnpm e2e:run`** (то же, что в CI: `pnpm exec playwright test`).

Полная сходимость по операциям — в `apps/api` (Vitest, `golden-scenario.flow.test.ts`); в браузере — те же ключевые числа (в т.ч. сценарий 5000 кг → отгрузка → недостача → продажа) в `e2e/golden-smoke.spec.ts`, плюс CSV, офлайн, операции, навигация.

**E2E навигации по ролям (PostgreSQL):** поднимите Postgres (локально или на хосте — см. раздел **API и база**), задайте **`E2E_DATABASE_URL`**, **`E2E_JWT_SECRET`** (≥ 32 символов) и при необходимости **`E2E_TEST_PASSWORD`** (пароль пользователей `e2e_accountant` / `e2e_warehouse` / `e2e_manager` / `e2e_seller`; по умолчанию совпадает с сидом в коде). Запуск: **`pnpm e2e:roles`** (только `e2e/role-nav-auth.spec.ts`). Сервер `apps/api/src/e2e-server.ts` при **`E2E_DATABASE_URL`** применяет миграции, сид `e2e-seed-role-users.ts`, включает **`REQUIRE_API_AUTH`** (отключить: `E2E_REQUIRE_API_AUTH=false`). Без этих переменных тесты в `e2e/role-nav-auth.spec.ts` в отчёте Playwright помечаются как пропущенные. **Не выставляйте `E2E_DATABASE_URL` при полном `pnpm exec playwright test`** — дым `golden-smoke` рассчитан на in-memory API без обязательного JWT на REST. В **GitHub Actions** job **`e2e-auth-nav`** гоняет сценарий ролей отдельно от основного E2E, job **`api-pg`** — интеграционные тесты API с **`TEST_DATABASE_URL`**.

### CI

В репозитории — GitHub Actions (`.github/workflows/ci.yml`): `pnpm check`, затем установка Chromium и **`pnpm exec playwright test`**; при Postgres в CI также **`api-pg`** (`@birzha/api` с **`TEST_DATABASE_URL`**) и **`e2e-auth-nav`**.

### Продакшен и хостинг

**Публичный сайт (продакшен):** **https://24birzha.ru/** — фронт и API за одним доменом (статика из `apps/web/dist`, запросы **`/api/...`** через nginx на процесс API на `127.0.0.1`). Исходники — в **GitHub** ([github.com/Nazir93/birzha](https://github.com/Nazir93/birzha)).

**CI на GitHub** — проверки при push/PR (не хостинг).

**Локальная разработка:** `pnpm dev:api` / `pnpm dev:web`, при необходимости PostgreSQL (см. **API и база**).

**Развёртывание на VPS:** пошагово **`docs/deployment/vps-ubuntu.md`** (домен **24birzha.ru**, TLS, nginx); кратко **`docs/deployment/runbook.md`**; пример **nginx** — **`deploy/nginx-birzha.example.conf`**. Обновления кода на сервере: **`deploy/README.md`** (опционально `deploy/server-update.sh`, workflow **Deploy to server**). Нужны PostgreSQL, **`apps/api/.env`** (`DATABASE_URL`, `JWT_SECRET`, …), **systemd** для API, **HTTPS** (cookie входа в prod с флагом **Secure**).

### API и база

Скопируйте `apps/api/.env.example` в `apps/api/.env`. Для **рабочих** маршрутов партий и рейсов задайте **`DATABASE_URL`**: иначе процесс слушает порт и отвечает на `/health`, но в **`GET /meta`** будет `batchesApi: disabled` (и соответствующие HTTP-операции не подключены). Вместе с **`DATABASE_URL`** задайте **`JWT_SECRET`** (не короче 32 символов) — иначе конфиг не поднимется; при этом включаются маршруты **`/auth/*`** (`authApi: enabled` в **`GET /meta`**). **`pnpm e2e`** использует отдельный процесс **`e2e-server`** с in-memory хранилищем — без PostgreSQL.

**Демо-данные для теста UI (только PostgreSQL):** после **`pnpm db:push`** и **`pnpm --filter @birzha/api db:reset-test-data`** выполните **`pnpm --filter @birzha/api db:seed-demo`**. Скрипт создаёт **10 накладных** (5× Манас, 5× Каякент), **6 рейсов**, отгрузки с ящиками, часть продаж и трёх продавцов `demo-seed-seller-1..3` (остаток — продавать вручную в `/s`). Префикс номеров **`DEMO-`**. Повторный запуск без очистки — ошибка; пароль — **`BIRZHA_DEMO_SEED_PASSWORD`** (≥10 символов). На продакшене только после **`pg_dump`** и осознанного сброса тестовых данных.

PostgreSQL: установите на своей машине или на сервере (пакет ОС или админ-хостинг) — важно лишь корректный **`DATABASE_URL`** в `apps/api/.env`. Пример развёртывания на VPS: **`docs/deployment/vps-ubuntu.md`**. После запуска БД:

```bash
cd apps/api && pnpm db:push
```

**Тестовые данные и KPI «Списано» в админке:** сумма «Списано (партии), кг» берётся из базы — это килограммы, занесённые как списание с остатка партии (не удаляется кнопкой на экране). Чтобы **полностью очистить** хозяйственные данные и начать заново при сохранении пользователей и ролей: из каталога `apps/api` выполните **`pnpm db:reset-test-data`** (нужен **`DATABASE_URL`** в `.env`; на продакшене сначала **`pg_dump`**). Если **`DATABASE_URL` не задан** и API в dev работает **в памяти**, достаточно **перезапустить** `pnpm dev:api` — партии обнуляются.

## Документация для агента

- **`AGENTS.md`** — куда смотреть, правки ролей/кода
- **`CLAUDE.md`**, **`docs/architecture/cabinets.md`**
- **`.cursor/rules/*.mdc`**

Проверка перед коммитом: **`pnpm check`** (**typecheck** + тесты + сборка). Turbo перед тестами API собирает `@birzha/domain`, чтобы импорт из `dist` совпадал с исходниками.

Сквозной сценарий сходимости (облегчённый): `apps/api/src/http/golden-scenario.flow.test.ts`, спецификация — `docs/testing/golden-scenario.md`.

Если запускать `vitest` только в `apps/api` вручную, сначала `pnpm --filter @birzha/domain build`.

Интеграционные тесты Drizzle с суффиксом `*.pg.integration.test.ts` нужны запущенный PostgreSQL и переменная **`TEST_DATABASE_URL`** (можно равна `DATABASE_URL` после настройки БД и применения миграций из `apps/api/drizzle/`, включая **`0009`** — пользователи/роли, и **`0011`** — накладная, склады, калибры).
