# Архитектура

Краткий индекс; дублирования с `README.md` в корне — избегать.

| Тема | Файл |
|------|------|
| **Кабинеты, отдельные входы, план продукта** | [`cabinets.md`](cabinets.md) |
| Роли, права, зоны | [`processes/roles-and-permissions.md`](processes/roles-and-permissions.md) |
| Риски, долги, офлайн, округления | [`risks-and-guardrails.md`](risks-and-guardrails.md) |
| Словарь, термины | [`business-glossary.md`](business-glossary.md) |
| Офлайн, sync, очередь | [`offline/offline-sync.md`](offline/offline-sync.md) |
| Модель данных, БД, единицы | [`data-model/er-model.md`](data-model/er-model.md), `table-catalog.md`, `units-and-precision.md` |

**Принятые решения в коде** — миграции `apps/api/drizzle/`, `apps/api/src/db/schema.ts`; обзор HTTP — **`README.md`** (корень).

Навигация для ассистента: **`AGENTS.md`** (корень репозитория).
