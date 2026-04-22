# Статус внедрения

**Единая точка правды:** что уже сделано в коде и что делать дальше (по `PROJECT_MASTER_SPEC.md`). Обновлять при завершении заметного шага.

Краткий порядок приоритетов для ассистента (без дублей текста): **`AGENTS.md`** (таблица **«Один указатель: что где искать»** — куда идти за ролями, панелями, рисками) → этот файл → `.cursor/rules/`.

**Актуально на:** 2026-04-16.

**Развёртывание и режим работы (зафиксировано):** продакшен-сервер **не закуплен и не развёрнут** — это **не блокирует** разработку в репозитории. Сейчас контур такой: **локально** — `pnpm dev`, `pnpm check`, при необходимости PostgreSQL на машине (`DATABASE_URL`, см. **`README.md`**); публичный прод-API/БД из этого репозитория как готовой инфраструктуры **нет**. CI — **GitHub Actions** на push/PR. Исходники — **GitHub**. Когда появится VPS/хостинг — обновить этот абзац и раздел **`README.md`** («Продакшен и хостинг»).

---

## Роли и доступ — план внедрения в код

В веб-клиенте есть **`/login`**, общий **`apiFetch`** (cookie + Bearer; при **401** — сброс токена и обновление сессии в UI), при **`requireApiAuth`** на API — редирект на вход. Матрица прав — **`docs/architecture/processes/roles-and-permissions.md`**. Целевые **панели по ролям** — **`docs/architecture/ui/screen-flows.md`** (верх файла). **Шаг 5** (фильтрация навигации и экранов по ролям) — **сделано** в **`apps/web`** (`role-panels`, `RequirePanel`, `AppNav`). Скрытие меню не заменяет **проверки на API**. **Шаг 6** (офлайн под правами): на сервере при **`REQUIRE_API_AUTH`** тип действия в **`POST /sync`** сверяется с ролью (**`sync_forbidden`** при запрете); на клиенте — отдельная область очереди/`deviceId` по пользователю (`outbox-scope`). Углубление сценария продавца (локальные остатки, кеш справочников) — по продукту, см. этап 5 в сводке и **`screen-flows.md`**.

Рекомендуемый порядок (когда будете готовы к разработке):

| Шаг | Содержание |
|-----|------------|
| 1 | Согласовать матрицу прав и **панелей по ролям** (`roles-and-permissions.md`, `ui/screen-flows.md`; в т.ч. оплаты долга — см. `risks-and-guardrails.md`). |
| 2 | Модель пользователей/ролей в PostgreSQL (см. черновик полей в `data-model/table-catalog.md`). |
| 3 | Аутентификация (сессия или JWT). |
| 4 | Авторизация на маршрутах API (middleware по правам). |
| 5 | Фильтрация навигации и экранов на клиенте (дублирует сервер, не заменяет). |
| 6 | Офлайн под правами: **сервер** — роль ↔ `actionType` в `/sync`; **клиент** — `role-panels` + область outbox по пользователю; кеш остатков у продавца — позже по продукту. |

**Состояние в репозитории (шаг 2):** таблицы **`users`**, **`roles`**, **`user_roles`** и сид ролей MVP — миграция **`apps/api/drizzle/0009_users_roles.sql`** (`apps/api/src/db/schema.ts`).

**Шаг 3 (аутентификация):** при **`DATABASE_URL`** + **`JWT_SECRET`** — **`POST /auth/login`** (scrypt-пароль из `users.password_hash`), **`POST /auth/logout`**, **`GET /auth/me`** (Bearer или cookie `birzha_access`); в **`GET /meta`** — **`authApi`**.

**Шаг 4 (авторизация API):** при **`REQUIRE_API_AUTH=true`** (и тем же контуре БД+JWT) на партиях/рейсах/`POST /sync` — **`preHandler`**: JWT + глобальные роли (`apps/api/src/http/route-auth.ts`, **`admin`** = полный доступ). В **`GET /meta`** — **`requireApiAuth`**. По умолчанию флаг **выключен**.

**Шаг 5 (клиент по ролям, v1):** **`apps/web`**: `AuthProvider`, **`/login`**, **`apiFetch`**, **`RequireApiAuthGate`**, матрица панелей **`auth/role-panels.ts`** (навигация + **`RequirePanel`** по маршрутам; **`admin`** = всё; бухгалтер — без «Операций»/«Офлайн»; «Служебное» — `admin`/`manager`). Детальнее — **`docs/architecture/ui/screen-flows.md`**.

Продакшен-сервер не обязателен для шагов 1–2 (согласование и проектирование). PostgreSQL — на машине разработчика или на VPS + `DATABASE_URL`.

---

## Сводка по этапам

| Этап | Описание | Статус |
|------|----------|--------|
| 0 | Монорепо pnpm + Turbo, Vitest, sql.js, Drizzle + PostgreSQL в API, web-каркас; пакет **`@birzha/contracts`** (Zod) | ✅ |
| 1 | Домен `Batch`, `Money`, тесты | ✅ |
| 2 | Use cases + порты + in-memory тесты | ✅ см. раздел «Сделано» ниже |
| 3 | Репозитории Drizzle, миграции `drizzle/0000`…`0014` (в т.ч. **`0011_purchase_nakladnaya`**, **`0012_trip_shipment_package_count`**: ящики в `trip_batch_shipments`), **`0014_batch_quality_destination`**: `batches.quality_tier` / `destination` — распределение по качеству/направлению), PG-интеграции при `TEST_DATABASE_URL` | ✅ |
| 4 | REST API (Fastify), сквозные тесты, золотой HTTP-flow, 409 на избыток недостачи, PG-тест журнала недостач | ✅ |
| 5 | Офлайн-синхронизация | ✅ сервер `POST /sync`; клиент `apps/web/src/sync` (**IndexedDB** outbox + миграция из legacy `localStorage`, `processSyncQueue`); **PWA** (manifest + **injectManifest** SW: precache, SPA fallback, **Background Sync** → сообщение странице → тот же `processSyncQueueSerialized`); **демо в `App`**: длина очереди, «в очередь» (`create_trip`), «синхронизировать»; область очереди по пользователю при JWT — см. раздел «Роли» выше |
| 6 | Расширенные отчёты (сходимость «как часы» в продуктовом смысле) | ✅ API отчёт по рейсу; **`sales.byClient`** и **`clientLabel`** (снимок имени); **справочник контрагентов** — таблица **`counterparties`**, **`trip_batch_sales.counterparty_id`**, **`GET/POST /counterparties`**, продажа с рейса с **`counterpartyId`** (снимок в `client_label`); UI «Операции» — выбор из справочника и создание записи. **Не в объёме MVP в репозитории:** отдельный PDF-макет; **доп. расходы/налоги** в `financials` — после правил заказчика |
| 7 | UI / PWA | ✅ **`AppNav`:** первая вкладка **«Накладная»**, затем отчёты, операции, офлайн, служебное; маршрут **`/purchase-nakladnaya`**; после входа роли **кладовщик** / **закупщик** — старт на накладной (`defaultRouteForUser` в `role-panels.ts`); **React Router**; **Zod**; **Playwright** — полный дым (`e2e/golden-smoke.spec.ts`), в т.ч. **тот же числовой сценарий**, что в `golden-scenario.flow.test.ts` (5000 кг → отгрузка → недостача → продажа) |
| 8 | Пилот и итерации | ⏳ прод-сервер не развёрнут; пилот на месте — после хостинга и правил |

---

## Сделано (зафиксировано в репозитории)

### Домен (`packages/domain`)

- `Batch`: склад / в пути / продано / списано, отгрузка в рейс, продажа с рейса, `writeOffFromTransit` (недостача при приёмке), инварианты и тесты.
- `Trip`, `Money`, прочие unit-тесты.

### Заявки (use cases) и порты (`apps/api`)

- Закупка и склад: `CreatePurchase`, `ReceiveOnWarehouse`.
- **Закупочная накладная (как у заказчика):** `CreatePurchaseDocumentUseCase` — проверка склада и калибра, сверка суммы строки с кг×ценой (копейки), создание партий `on_hand` с `warehouseId`, запись шапки и строк в **`purchase_documents`** / **`purchase_document_lines`** (транзакция с сохранением партий). Порты: `WarehouseRepository`, `ProductGradeRepository`, `PurchaseDocumentRepository` (Drizzle + in-memory для тестов).
- Рейс: `CreateTrip`, `CloseTrip`, `ShipToTrip` (транзакция с БД при PG).
- Продажа с рейса: `SellFromTrip` с учётом **уже учтённой недостачи** по паре рейс–партия; **нал / долг / смешанная оплата** (`paymentKind`, `cashKopecksMixed`); опционально **`clientLabel`** или **`counterpartyId`** (справочник → снимок имени в **`client_label`**, FK в **`counterparty_id`**); агрегат **`byClient`** по снимку строки; транзакция с БД при PG.
- Недостача: `RecordTripShortage` — списание из «в пути», запись в журнал; лимит: отгружено − продано − ранее недостача.
- Отчёт: `GetTripReport` — отгрузки, продажи, **агрегат недостач**; **деньги по рейсу** (`financials`): выручка из журнала продаж, себестоимость проданного и недостачи по **закупочной цене партии** (`Batch.getPricePerKg()`), валовая прибыль — всё в копейках (`trip-financials.ts`).

### HTTP API

- **Контракты тел запросов:** `packages/contracts` — схемы партий, рейса, продажи с рейса, **`createPurchaseDocumentBodySchema`** (накладная) и payload офлайн-действий; **API** и **web** парсят одни и те же определения Zod.
- Накладная: **`GET /warehouses`**, **`GET /product-grades`**, **`POST /purchase-documents`**, **`GET /purchase-documents`**, **`GET /purchase-documents/:documentId`** (регистрация вместе с полным контуром batch/sync в `buildApp`). Ошибки: `warehouse_not_found`, `product_grade_not_found`, `purchase_line_total_mismatch`.
- Партии: **`GET /batches`** (список; при PG — опционально **`nakladnaya`** для партий из строки накладной), создание (`POST /batches`), оприходование, отгрузка в рейс, продажа с рейса, **фиксация недостачи** `POST /batches/:batchId/record-trip-shortage` (`tripId`, `kg`, `reason`).
- Рейсы: список, создание, карточка, закрытие.
- Отчёт: `GET /trips/:tripId/shipment-report` — `shipment`, **`sales`** (в т.ч. `totalCashKopecks` / `totalDebtKopecks` по рейсу, **по партиям** и **`byClient`**), **`shortage`**, **`financials`**.
- Служебное: `/health`, `/health/ready`, `/meta` — в т.ч. **`purchaseDocumentsApi`**, `tripShortageLedger`, **`counterpartyCatalogApi`**, **`syncApi`**, **`authApi`** (при PostgreSQL + `JWT_SECRET`).
- Справочник: **`GET /counterparties`**, **`POST /counterparties`** (`displayName`); payload продажи и **`sell_from_trip`** в `/sync` — опционально **`counterpartyId`** (см. `@birzha/contracts`).
- Вход: **`POST /auth/login`**, **`POST /auth/logout`**, **`GET /auth/me`** (JWT в теле и HttpOnly-cookie `birzha_access`; хэш пароля — scrypt).
- Опционально **`REQUIRE_API_AUTH`**: защита бизнес-REST по ролям (см. `route-auth.ts`); **`GET /meta`** — **`requireApiAuth`**.
- **Офлайн (сервер):** `POST /sync` — одно действие за запрос, идемпотентность `(deviceId, localActionId)` в таблице `sync_processed_actions` (PG) или in-memory в тестах; отказ бизнес-правил → **200** и `{ status: "rejected", reason, resolution, ... }` (см. `.cursor/rules/02-offline-sync.mdc`). При **`REQUIRE_API_AUTH`** — проверка роли на **тип** действия (`route-auth.ts`: как у REST); при запрете — **200** и `errorCode: "sync_forbidden"`.

### База данных

- Миграции до **`0014`** — в т.ч. **`sync_processed_actions`** (`0007`), **`trip_batch_sales.client_label`** (`0008`), **`users` / `roles` / `user_roles`** и сид ролей MVP (`0009`), **`counterparties`** и **`trip_batch_sales.counterparty_id`** (`0010`), **`0011_purchase_nakladnaya`**: **`warehouses`**, **`product_grades`**, **`purchase_documents`**, **`purchase_document_lines`**, колонка **`batches.warehouse_id`**; **`0012_trip_shipment_package_count`**: **`trip_batch_shipments.package_count`** (nullable bigint — ящики в строке отгрузки в рейс).
- Отгрузка, продажа, недостача с PG — в транзакциях там, где это уже проведено в `app.ts`. Создание накладной — транзакция в **`DrizzlePurchaseDocumentRepository`** (шапка → партии → строки).

### Веб-клиент (`apps/web`)

- Модуль **`src/sync`**: outbox в **IndexedDB** (имя БД зависит от области: без входа — `birzha-offline`; с входом — отдельная БД на `user:<id>`), миграция из `birzha:outbox:v1` только для области `default`; публичные **`loadOutbox`** / **`enqueue`** (async); для тестов — `*Sync` + явный `StorageLike`; **`processSyncQueue`** (FIFO, стоп при `rejected` или сетевой ошибке); **`processSyncQueueSerialized`** (один параллельный прогон); **`subscribeSyncOnOnline`** — при `online`, возврате на вкладку и при монтировании (если сеть есть), опционально **`periodicIntervalMs`** — пока вкладка видима и есть сеть, повтор синка не чаще чем раз в N мс (в `App` — 2 мин). Vitest: `outbox-queue.test.ts`, `process-sync-queue.test.ts`, `process-sync-queue-serial.test.ts`, `outbox-idb.test.ts` (fake-indexeddb), `subscribe-sync-on-online.test.ts` (happy-dom).
- **`App`**: **`AuthProvider`**, **`/login`**, **`requireApiAuth`** → редирект на вход; **`auth/role-panels.ts`** + **`RequirePanel`** — навигация и маршруты по глобальным ролям JWT (при **`authApi`**); иначе все разделы как раньше; **`apiFetch`**; маршруты **`/purchase-nakladnaya`**, `/reports`, `/operations`, `/offline`, `/service`; стили — `ui/styles.ts`, `index.css`; «**Накладная**» — приём на склад; «Отчёты» — `POST /trips`, отчёт (сверка, **по клиентам**, **печать**); «**Операции**» — партии и рейс; **Zod**; «Служебное» — `/api/meta`; «Офлайн» — **`processSyncQueueSerialized`**, **`requestOutboxBackgroundSync`**.
- **PWA** (`vite-plugin-pwa`): `manifest.webmanifest`, precache ассетов, `registerSW` в `main.tsx`; иконка `public/pwa-icon.svg`.
- **Распределение (шаг 3):** вкладка **«Распределение»** (`/distribution`, панель `distribution` в `role-panels`); `PATCH /api/batches/:batchId/allocation` (только при PostgreSQL), в **`GET /batches`** — **`allocation`**: `qualityTier`, `destination` (см. `README.md`, `dlya-zakazchika-zapolnenie.md`).

### Тесты

- Unit / HTTP по API; `trip-financials.test.ts` — расчёт `grossProfit` из агрегатов; **золотой сценарий** `apps/api/src/http/golden-scenario.flow.test.ts`: отгрузка → недостача → продажа → сходимость граммов, выручки, `shortage` и **`financials`**; второй кейс — **`paymentKind: "mixed"`** (проверка `totalCashKopecks` / `totalDebtKopecks` в отчёте).
- **Playwright smoke** (`pnpm e2e` локально или `pnpm exec playwright test` после `pnpm check`, каталог `e2e/`): UI + прокси + `e2e-server` (in-memory API); сценарии — **`/` → `/reports`**, **неизвестный путь → `/reports`**, **`/login` → `/reports`** без обязательной авторизации на API, **GET /api/meta** («Служебное»), **POST /trips** и рейс в селекторе на «Отчётах», **выбор рейса → блок отчёта** (`shipment-report`, печать); **недостача** (`record-trip-shortage`), **продажа в долг** и **смешанная оплата** (строка **нал/долг** сверяется с **GET …/shipment-report**); **«Продажи по клиентам»** после **POST …/sell-from-trip** с **`clientLabel`**; **полный числовой сценарий** как в **`golden-scenario.flow.test.ts`** (5000 кг партия, 3000 кг отгрузка, 100 кг недостача, 2900 кг продажа, **«ИП Иванов»**, сверка `financials` в UI); **CSV** (партия `on_hand` → отгрузка в рейс → скачивание `*-partii.csv`), **«Офлайн-очередь»** (счётчик `#offline-queue-count`, «Добавить в очередь» → **«Синхронизировать»**, проверка JSON результата), **`/operations`** (**POST /api/batches** → таблица **GET /api/batches**), **клики по `AppNav`**; в файле тесты **последовательно** (`serial`), формат копеек — **`e2e/kopecks-label.ts`**, формула выручки в одном тесте — как в **`rub-kopecks.ts`**. Полная сходимость — в Vitest; в CI — workflow `.github/workflows/ci.yml`.
- HTTP: **409 `trip_shortage_exceeds_net`** при `record-trip-shortage` сверх нетто — `batch-routes.test.ts`.
- PostgreSQL (при **`TEST_DATABASE_URL`**): `trip-shortage-repository.pg.integration.test.ts` — append, сумма по паре рейс–партия, агрегат по рейсу (как остальные `*.pg.integration.test.ts`); **`auth.pg.integration.test.ts`** — в т.ч. **`sync_forbidden`** для бухгалтера на `sell_from_trip` при **`REQUIRE_API_AUTH`**.
- Спецификация сценария: `docs/testing/golden-scenario.md`.

---

## Очередь работ (рекомендуемый порядок)

Нумерация — для пошагового следования; при конфликте с заказчиком приоритет у продуктовых требований.

0. **Роли и доступ** — см. раздел **«Роли и доступ — план внедрения в код»** выше и **`docs/architecture/processes/roles-and-permissions.md`**.

1. **Этап 5 (продолжение)** — **Background Sync API** — сделано: кастомный SW `apps/web/src/sw.ts` (injectManifest), тег `birzha-outbox-sync`, после постановки в очередь — `requestOutboxBackgroundSync`; SW шлёт странице сообщение → `processSyncQueueSerialized` (без дублирования HTTP в SW). **Периодический таймер при открытой вкладке** — сделано (~2 мин, `subscribeSyncOnOnline({ periodicIntervalMs })` в `App`). **Fallback при ошибке открытия IDB** — `getDefaultOutboxBackend()` лениво пробует `getOutboxIdb()`, при отказе — `localStorage`/память (`outbox-backend.ts`, тест `outbox-backend.fallback.test.ts`); среда без API IndexedDB — по-прежнему сразу `localStorage`/память.
2. **Этап 6** — для MVP в репозитории: **сделано** (см. сводку этапов). Дальше по заказчику: PDF-шаблон, доп. поля в `financials`.
3. **Этап 7** — для MVP в репозитории: **сделано**. Точечные доработки UI — по новым сценариям.

**Сделано по нал/долг:** строка продажи хранит разбиение выручки; отчёт агрегирует `totalCashKopecks` / `totalDebtKopecks`; золотой тест — продажа в долг (`paymentKind: "debt"`).

**Вне текущего объёма кода (продукт / домен):** **возвраты** (нет сущности в домене); **частичные оплаты долгов** и проводки — только после матрицы прав (`07-debts-returns-and-role-edge-cases.mdc`).

**UI накладной:** отдельный маршрут **`/purchase-nakladnaya`** (в **`AppNav`** вкладка «Накладная» **первая**), компонент **`PurchaseNakladnayaSection`**; на странице «Операции» — явный текст порядка («сначала Накладная») и ссылка на накладную. Права панели **`nakladnaya`** совпадают с «Операциями» (не бухгалтер). При `purchaseDocumentsApi: disabled` — пояснение в блоке.

**E2E по ролям (JWT в браузере):** `e2e/role-nav-auth.spec.ts` — вход `e2e_accountant` / `e2e_warehouse`, проверка **`AppNav`**; сервер **`e2e-server.ts`** с **`E2E_DATABASE_URL`** + миграции + сид **`e2e-seed-role-users.ts`**, **`REQUIRE_API_AUTH`** (по умолчанию вкл.). Локально: см. **`README.md`** (`pnpm e2e:roles`). В CI: job **`e2e-auth-nav`** в `.github/workflows/ci.yml`.

**Сделано в дымовом E2E:** редиректы и **`/login`** без обязательного входа; отчёт (недостача; нал / долг / **mixed**; **byClient**; **полный числовой сценарий как в Vitest** `golden-scenario.flow.test.ts`); CSV; офлайн; операции; навигация (`e2e/golden-smoke.spec.ts`, `e2e/kopecks-label.ts`).

---

## Связанные файлы

| Файл | Назначение |
|------|------------|
| `README.md` | Команды, таблица HTTP API, **стек** |
| `AGENTS.md` | Указатель «куда смотреть», правило **синхронизации правок** между документами |
| `PROJECT_MASTER_SPEC.md` | Принципы и дорожная карта этапов 0–8 |
| `docs/architecture/ui/screen-flows.md` | Панели по ролям, расхождения; дата согласования — только там |
| `docs/testing/golden-scenario.md` | Целевой E2E-сценарий и пробелы в тесте |
