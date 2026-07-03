# Нагрузочные проверки и безопасность HTTP API

## Заголовки безопасности (Helmet)

В приложении API (`apps/api`) подключён `@fastify/helmet`: для JSON API отключён только **Content-Security-Policy** (его задаёт отдельно фронтенд/Vite при раздаче SPA). Остальные типичные заголовки (например `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`) выставляются автоматически.

Регрессии по заголовкам ловятся в `apps/api/src/app.test.ts` (ответ `GET /health`).

## TLS и прокси

Терминация HTTPS и ограничение доступа по сети настраиваются на уровне reverse proxy (например nginx) и файрвола. Пошагово для VPS: [docs/deployment/vps-ubuntu.md](../deployment/vps-ubuntu.md).

## Секреты и авторизация

JWT, пароли и область видимости по ролям описаны в архитектурных документах; для обзора защиты эндпоинтов см. [docs/architecture/security-api-read-audit.md](../architecture/security-api-read-audit.md).

## Smoke нагрузки (локально)

Скрипт без дополнительных бинариев: параллельные запросы через встроенный `fetch`.

1. Запустить API, например `pnpm dev:api` (порт по умолчанию `3000`).
2. Из корня монорепозитория:

```bash
pnpm load:smoke
```

Параметры через переменные окружения: `BASE_URL`, `LOAD_PATH` (по умолчанию `/health`), `TOTAL`, `CONCURRENCY`.

Пороги (release gate): `MAX_P95_MS`, `MIN_RPS`.  
Пример:

```bash
BASE_URL=http://127.0.0.1:3000 TOTAL=120 CONCURRENCY=12 MAX_P95_MS=800 MIN_RPS=40 pnpm load:smoke
```

## Нагрузка «Распределение» (5000+ погрузочных)

Сценарий для проверки списков `/a/distribution` при большом объёме данных.

1. PostgreSQL и `apps/api/.env` (`DATABASE_URL`, при необходимости `JWT_SECRET`).
2. Очистить тестовые данные и заполнить стенд:

```bash
cd apps/api
pnpm db:reset-test-data
BIRZHA_LOAD_MANIFEST_COUNT=5000 BIRZHA_LOAD_TRIP_COUNT=500 pnpm db:seed-load-test
```

Параметры сида: `BIRZHA_LOAD_MANIFEST_COUNT` (по умолчанию 5000), `BIRZHA_LOAD_TRIP_COUNT` (500), `BIRZHA_LOAD_CHUNK_SIZE` (250). Префикс записей — `LOADTEST-`. Для быстрой локальной проверки: `BIRZHA_LOAD_MANIFEST_COUNT=100 BIRZHA_LOAD_TRIP_COUNT=20`.

Опционально проверить создание через API (небольшая выборка): `BIRZHA_LOAD_VIA_API_SAMPLE=10`.

3. Поднять API: `pnpm dev:api`.
4. Из корня репозитория:

```bash
pnpm load:distribution
```

Переменные: `BASE_URL`, `TOTAL`, `CONCURRENCY`, `PATHS`, при `REQUIRE_API_AUTH=true` — `LOGIN` и `PASSWORD`.

Пороги (release gate): `MAX_P95_MS`, `MAX_FAIL`.  
Пример:

```bash
BASE_URL=http://127.0.0.1:3000 LOGIN=e2e_admin PASSWORD=E2e-birzha-test-99 TOTAL=20 CONCURRENCY=5 MAX_P95_MS=1200 MAX_FAIL=0 pnpm load:distribution
```

Скрипт меряет latency и размер ответа для `GET /loading-manifests`, `/trips`, `/batches`, `/loading-manifests/reserved-batch-ids` и `/warehouses`. В отчёте смотрите `itemCount`, `responseBytesMax`, `latencyMs.p95`.

## Масштабирование списков (10k+ записей)

С **2026-06** API по умолчанию не отдаёт полные таблицы без лимита:

| Эндпоинт | По умолчанию | Параметры |
|----------|--------------|-----------|
| `GET /loading-manifests` | 100 строк + `listMeta.totalCount` | `limit`, `offset`, `scope=active\|archived\|all`, `search` |
| `GET /trips` | 100 строк + `listMeta.totalCount` | `limit`, `offset`, `status=open\|closed`, `search`, `order` |
| `GET /batches` | 100 строк + `listMeta.hasMore` | `limit`, `offset`, `warehouseId`, `stockOnly`, `ids`, `search` |
| `GET /purchase-documents` | 100 строк + `listMeta.totalCount` | `limit`, `offset`, `scope=inWork\|archived\|all`, `search` |

Сводки без полной выборки:

- `GET /admin/dashboard-summary?since=YYYY-MM-DD` — KPI главной админа
- `GET /stock-balances` — остатки для бухгалтерии

UI «Распределение», «Архив» и «Настройки → документы» используют пагинацию; при добавлении новых экранов со списками — только постраничные запросы, не `GET` без параметров в цикле по всей таблице.

Для более серьёзных сценариев (сценарии, SLA, отчёты) можно подключить [k6](https://k6.io/) или аналог и описать сценарии отдельно; в CI по умолчанию полный load-тест не гоняется — только unit/integration тесты API.

## Security smoke (локально/CI)

Скрипт проверяет security-заголовки на `/health` и (опционально) требования авторизации.

```bash
# без обязательного auth
BASE_URL=http://127.0.0.1:3000 pnpm security:smoke

# с REQUIRE_API_AUTH=true
BASE_URL=http://127.0.0.1:3000 EXPECT_AUTH=1 LOGIN=e2e_seller PASSWORD=E2e-birzha-test-99 pnpm security:smoke
```
