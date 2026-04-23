# Приём товара и распределение: как это в коде

Сопоставление бизнес-шагов, HTTP, use case’ов и экрана веб-клиента. **Канон процесса для заказчика** — [dlya-zakazchika-zapolnenie.md](../../guides/dlya-zakazchika-zapolnenie.md), «человеческий» сценарий — [role-workflows-detailed.md](role-workflows-detailed.md).

| Шаг | Смысл | API | Домен / use case | UI `apps/web` |
|-----|--------|-----|------------------|---------------|
| **1 — Приём на складе (накладная)** | Ввод **той же** бумаги, что при привозе: шапка + строки по калибру → на выбранном **складе** появляются **партии** с остатком `on_warehouse` | `POST /purchase-documents` (и справочники `GET/POST` складов, калибров). См. `GET /purchase-documents`, `GET /purchase-documents/:id` | `CreatePurchaseDocumentUseCase` → для каждой строки `Batch.create({ distribution: "on_hand", warehouseId })` → `insertDocumentWithLines` (транзакция в репозитории) | Вкладка **«Накладная»** `PurchaseNakladnayaSection` (`/purchase-nakladnaya`) |
| **2 (опер.)** | «Поступление» как **отдельный документ** после накладной | В MVP **нет** — приём = накладная, см. гайд | — | — |
| **3 — Распределение** | Решение по **качеству** и **направлению** по **партиям** с ненулевым остатком на складе (без дробления массы в БД) | `PATCH /batches/:batchId/allocation` тело: `qualityTier`, `destination` (см. `@birzha/contracts`); `GET /batches` с PG подмешивает `nakladnaya` (из `purchase_document_lines` + `purchase_documents` + `product_grades`) и `allocation` из `batches.quality_tier` / `destination` | Прямое `UPDATE` в `register-batch-routes.ts` (Drizzle), отдельного use case нет | **«Распределение»** `AllocationPanel` (`/distribution`) — выбор склада, при необходимости накладной, селекты, сохранение |
| *альтернатива партии* | Создать партию без накладной (редкий путь) | `POST /batches` | `CreatePurchaseUseCase` | «Операции» / тесты |
| *оприходование pending* | Иной сценарий, не путать с накладной | `POST /batches/:id/receive-on-warehouse` | `ReceiveOnWarehouseUseCase` | — |

## Ограничения среды

- **`PATCH …/allocation`** срабатывает **только при подключённом PostgreSQL** (`db !== null` в `registerBatchRoutes`). Иначе **503** `allocation_requires_postgres` — в `AllocationPanel` об этом предупреждение.
- **`GET /batches`**: обогащение `nakladnaya` и `allocation` делает `listBatchesForHttp` из **`batch-list-http.ts`**, **SQL к `purchase_*` только при наличии `db`**. Без PG список партий есть, но привязка к номеру накладной в JSON может быть неполной.
- **Авторизация:** `PATCH /allocation` идёт с `routeAuth.batchCreate` (как создание накладной) — согласовано с «закупка/клад/руководство».

## Файлы для доработок

| Тема | Где смотреть |
|------|----------------|
| Накладная, транзакция, партии | `create-purchase-document.use-case.ts`, `drizzle-purchase-document.repository.ts` |
| Список партий для UI | `batch-list-http.ts`, `batch-serialize.ts` |
| Распределение, поля в БД | `schema.ts` `batches.quality_tier`, `destination` |
| Клиент распределения | `AllocationPanel.tsx` |
| Калибры/направления (контракт) | `packages/contracts` `BATCH_QUALITY_TIERS`, `BATCH_DESTINATIONS` |

Обновляйте этот файл и [implementation-status.md](../../implementation-status.md) при смене поведения (например, отдельный use case для `allocation` вместо прямого `UPDATE`).
