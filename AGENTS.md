# Ориентир для ассистента

Не плодить длинные спецификации: одно направление — в [`docs/architecture/cabinets.md`](docs/architecture/cabinets.md); права — в [`docs/architecture/processes/roles-and-permissions.md`](docs/architecture/processes/roles-and-permissions.md).

## Куда смотреть

| Вопрос | Куда |
|--------|------|
| Команды, HTTP API, стек | `README.md` |
| **Кабинеты, отдельные входы, план** | `docs/architecture/cabinets.md` (матрица экранов по ролям — раздел «Матрица экранов») |
| Роли, матрица прав, документы | `docs/architecture/processes/roles-and-permissions.md` |
| Риски (долги, офлайн, возвраты) | `docs/architecture/risks-and-guardrails.md` |
| Термины, глоссарий | `docs/architecture/business-glossary.md` |
| Офлайн / sync | `docs/architecture/offline/offline-sync.md` |
| Сценарии полей/форм (заказчик) | `docs/guides/dlya-zakazchika-zapolnenie.md` |
| Деплой, VPS, nginx, пользователь | `docs/deployment/vps-ubuntu.md`, `docs/deployment/runbook.md` |
| Эскиз ER, таблицы, единицы | `docs/architecture/data-model/` (er-model, table-catalog, units) |
| Золотой сценарий теста | `docs/testing/golden-scenario.md` |
| **Правила кода** | `.cursor/rules/*.mdc` (в т.ч. `00-master.mdc`, `07-…` для граничных ролей/долгов) |
| **Безопасность API (GET, токен)** | `docs/architecture/security-api-read-audit.md` |

**Навигация по `docs`:** `docs/architecture/README.md` — короткий индекс (не дублирует `README`).

**«Продолжай / делай дальше»** — без отдельного `implementation-status`: **явная цель** в сообщении пользователя или **следующий логичный шаг по коду**; при сомнении **спросить** или смотреть issues/PR, не придумывать длинные очереди.

## Синхронизация

Если меняется «кто что видит» / роли: обновить `roles-and-permissions.md` и **в коде** `apps/web/src/auth/role-panels.ts`, `apps/api/src/http/route-auth.ts` согласовано.

## Качество

- `pnpm check` после значимых изменений; тесты рядом с кодом; контракты в `packages/contracts` при смене HTTP.

Спорные места: `.cursor/rules/07-debts-returns-and-role-edge-cases.mdc` — не тянуть в код сомнительную логику без согласования.
