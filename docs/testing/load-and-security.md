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

Для более серьёзных сценариев (сценарии, SLA, отчёты) можно подключить [k6](https://k6.io/) или аналог и описать сценарии отдельно; в CI по умолчанию полный load-тест не гоняется — только unit/integration тесты API.
