# Защита чтения API и клиента

Краткий аудит и рекомендации; деталь матрицы прав — [`processes/roles-and-permissions.md`](processes/roles-and-permissions.md).

## Принцип

- **Источник прав — сервер.** Подмена URL в браузере (`/o`, `/s`, `/b`) не должна открывать чужие данные: [`route-auth.ts`](../../apps/api/src/http/route-auth.ts), проверки на каждом маршруте.
- **Клиент:** [`RequireCabinet`](../../apps/web/src/components/RequireCabinet.tsx) только улучшает UX.

## GET-маршруты с массивами данных

| Маршрут | Роли чтения | Примечание |
|---------|-------------|------------|
| `GET /api/batches` | Все MVP (`dataRead`) | При **scoped** роли `warehouse` / `receiver` с `scope_type=warehouse` список фильтруется по складу накладной — см. [`warehouse-scope.ts`](../../apps/api/src/auth/warehouse-scope.ts). |
| `GET /api/purchase-documents` | `dataRead` | То же ограничение по складу; документ чужого склада — **`403`** на `GET …/:id`. |
| `GET /api/trips` | `dataRead` | Список пока общий; сужение по назначению продавца — при необходимости отдельная задача. |
| `GET /api/trips/:id/shipment-report` | `tripReportRead` | Полевой продавец (`isGlobalSellerOnly`): блок продаж и финансов по продажам — только свои строки ([`get-trip-report.use-case.ts`](../../apps/api/src/application/trip/get-trip-report.use-case.ts)). |

## Рекомендации по токену и продакшену

1. **JWT в `localStorage`** (текущий клиент) чувствителен к XSS. Варианты: короткий TTL + refresh, переход на **httpOnly cookie** + CSRF для мутаций, строгий **Content-Security-Policy**.
2. **HTTPS-only**, заголовки `Secure`, SameSite для cookie при их введении.
3. Кнопка «Выйти» должна сбрасывать токен и инвалидировать кэш запросов ([`auth-context`](../../apps/web/src/auth/auth-context.tsx)).

Деплой и env: [`../deployment/vps-ubuntu.md`](../deployment/vps-ubuntu.md).
