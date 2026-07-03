# Release Report (Go / No-Go)

Дата релиза: `YYYY-MM-DD`  
Версия/коммит: `<sha>`  
Ответственный: `<name>`

## 1) Gate Summary

| Gate | Статус | Ссылка/лог |
|---|---|---|
| CI: typecheck + unit/integration + build | PASS/FAIL | `<url>` |
| E2E auth roles + full section regression | PASS/FAIL | `<url>` |
| API PostgreSQL integration | PASS/FAIL | `<url>` |
| Nonfunctional smoke (load + security) | PASS/FAIL | `<url>` |
| Staging full checklist | PASS/FAIL | `<doc/link>` |
| Production smoke | PASS/FAIL | `<doc/link>` |

## 2) Coverage Notes

- Action-catalog версия: `<version>` из `docs/testing/action-catalog.json`
- Кол-во проверенных экранов: `<n>`
- Кол-во проверенных действий/кнопок: `<n>`
- Edge-cases покрыты: `yes/no` (перечень)
- Непокрытые зоны (если есть): `<list>`

## 3) Defects

### Blockers (P1/P2)
- `<none | issue links>`

### Non-blockers (P3/P4)
- `<issue links>`

## 4) Business Invariants

- Масса (граммы) сходится: `yes/no`
- Деньги (копейки) сходятся: `yes/no`
- Ролевые ограничения подтверждены (UI + API): `yes/no`
- Золотой сценарий пройден: `yes/no`

## 5) Production Verification

- `/health` после деплоя: `<status>`
- Логин `admin`: `ok/fail`
- Логин `seller`: `ok/fail`
- Критичные кнопки (рейс, накладная, погрузка, продажа, недостача, закрытие): `ok/fail`
- PWA/кеш актуальны: `ok/fail`

## 6) Decision

- Итог: `GO` / `NO-GO`
- Условия GO (если условный): `<text>`
- Подписи: `<name1>, <name2>`
