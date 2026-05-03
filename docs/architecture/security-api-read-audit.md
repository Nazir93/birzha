# Защита чтения API и клиента

Краткий аудит и рекомендации; деталь матрицы прав — [`processes/roles-and-permissions.md`](processes/roles-and-permissions.md).

## Принцип

- **Источник прав — сервер.** Подмена URL в браузере (`/o`, `/s`, `/b`) не должна открывать чужие данные: [`route-auth.ts`](../../apps/api/src/http/route-auth.ts), проверки на каждом маршруте.
- **Клиент:** [`RequireCabinet`](../../apps/web/src/components/RequireCabinet.tsx) только улучшает UX.

## GET-маршруты с массивами данных

| Маршрут | Роли чтения | Примечание |
|---------|-------------|------------|
| `GET /api/batches` | Все MVP (`dataRead`) | При **scoped** роли `warehouse` / `receiver` с `scope_type=warehouse` список фильтруется по складу накладной — см. [`warehouse-scope.ts`](../../apps/api/src/auth/warehouse-scope.ts). |
| `GET /api/purchase-documents` | `dataRead` | Ограничение по складу ([`warehouse-scope.ts`](../../apps/api/src/auth/warehouse-scope.ts)); для глобального **закупщика** (`purchaser`) — только накладные без автора или созданные им (`created_by_user_id`, см. [`purchase-scope.ts`](../../apps/api/src/auth/purchase-scope.ts)); чужой документ — **`403`** на `GET …/:id`. |
| `GET /api/trips` | `dataRead` | Полевой продавец (`isGlobalSellerOnly`): только рейсы с `assigned_seller_user_id === sub` ([`seller-scope.ts`](../../apps/api/src/auth/seller-scope.ts)); остальные роли — полный список. |
| `GET /api/trips/field-seller-options` | `tripAssignSeller` | Активные пользователи с глобальной ролью `seller` — для выбора при создании/назначении рейса (только PostgreSQL; без БД — пустой список). |
| `POST /api/trips/:id/assign-seller` | `tripAssignSeller` | “Отгрузить с рейса”: закрепляет рейс за конкретным продавцом. Роли `admin`, `manager`, `purchaser`, `logistics`. |
| `GET /api/trips/:id/shipment-report` | `tripReportRead` | Полевой продавец: доступ к рейсу как у списка рейсов; блок **`sales`** / **`financials`** по продажам — только свои строки ([`get-trip-report.use-case.ts`](../../apps/api/src/application/trip/get-trip-report.use-case.ts)). |

## Рекомендации по токену и продакшену

1. Токен также выставляется в **httpOnly cookie** при логине ([`register-auth-routes.ts`](../../apps/api/src/http/register-auth-routes.ts)); клиент может дублировать JWT в `localStorage` для заголовка `Authorization`. Для снижения XSS: короткий TTL + refresh, при мутациях — cookie + CSRF, строгий **Content-Security-Policy**.
2. **HTTPS-only**, заголовки `Secure`, SameSite для cookie при их введении.
3. Кнопка «Выйти» должна сбрасывать токен и инвалидировать кэш запросов ([`auth-context`](../../apps/web/src/auth/auth-context.tsx)).

Деплой и env: [`../deployment/vps-ubuntu.md`](../deployment/vps-ubuntu.md).
