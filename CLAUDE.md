# Проект «биржа» — учёт товара

## Главный ориентир для агента

1. Прочитай **`PROJECT_MASTER_SPEC.md`** в корне — мастер-спецификация, этапы и чек-листы.
2. Правила Cursor лежат в **`.cursor/rules/`** (файлы `*.mdc`), в первую очередь `00-master.mdc`.
3. Код: монорепозиторий — **`packages/domain`** (домен), **`apps/api`** (Fastify + Drizzle), **`apps/web`** (Vite + React). Команды см. **`README.md`**.
4. Продуктовая и бизнес-архитектура — в **`docs/architecture/`** (глоссарий, ER, офлайн, экраны).
5. **Сценарии по ролям (как у заказчика):** `docs/architecture/processes/role-workflows-detailed.md`.
6. **Риски и защита целостности:** `docs/architecture/risks-and-guardrails.md`.
7. **Стек:** `docs/STACK.md`.
8. **Золотой сценарий теста (сходимость цифр):** `docs/testing/golden-scenario.md`.
9. **На каком этапе проект сейчас:** `docs/implementation-status.md`.

При противоречии между документами: **сначала** согласуй с заказчиком; до согласования для кода опирайся на `PROJECT_MASTER_SPEC.md` и `.cursor/rules/`, для смысла терминов — на `docs/architecture/business-glossary.md`. Противоречия «сценарий vs матрица прав» — см. `risks-and-guardrails.md` и `07-debts-returns-and-role-edge-cases.mdc`.
