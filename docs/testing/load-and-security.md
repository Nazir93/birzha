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
