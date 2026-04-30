# Runbook: от нуля до рабочего продакшена

Единая последовательность. Детали — в **`docs/deployment/vps-ubuntu.md`** и **`README.md`**.

## 1. Сервер и PostgreSQL

- Ubuntu, Node.js 20+, pnpm (`corepack`), nginx, certbot (по необходимости).
- PostgreSQL из пакетов: пользователь и база, строка **`DATABASE_URL`** в `apps/api/.env`.

## 2. Код и схема БД

```bash
cd /opt/birzha   # или каталог клона
pnpm install
pnpm --filter @birzha/domain build
set -a && source apps/api/.env && set +a
pg_dump "$DATABASE_URL" --format=custom --file "birzha-before-schema-$(date +%F-%H%M).dump"
cd apps/api && pnpm db:push
cd ../.. && pnpm build
```

## 3. Переменные `apps/api/.env`

- **`DATABASE_URL`**, **`JWT_SECRET`** (≥ 32 символов), **`NODE_ENV=production`**, **`HOST=127.0.0.1`**, **`PORT=3000`**.
- **`REQUIRE_API_AUTH`** — `true` для обязательного входа; в **production** при заданных **`DATABASE_URL`** и **`JWT_SECRET`** можно не задавать переменную — тогда вход включается автоматически. **`false`** — только если API должен быть без персональной авторизации.

## 4. Учётные записи (если включён вход)

**Правило:** у каждого сотрудника **свой логин и свой пароль**. Скрипт `create-user` запускают **отдельно для каждого человека** (уникальный `--login`). Общая учётка «на всех» приводит к путанице в действиях и отчётах.

Первый пользователь (часто администратор), из **`apps/api`** с тем же `.env`:

```bash
BIRZHA_CREATE_USER_PASSWORD='ВАШ_ПАРОЛЬ' pnpm create-user -- --login ВАШ_ЛОГИН --role admin
```

Дальше — так же для продавца, кладовщика и т.д., каждый раз **другой** `--login`.
Не передавайте пароль через `--password` без необходимости: он может попасть в историю команд shell.

Роли: `admin`, `manager`, `purchaser`, `warehouse`, `logistics`, `receiver`, `seller`, `accountant`.

Скрипт: `apps/api/scripts/create-user.ts` (хэш scrypt, как у API).

## 5. systemd и nginx

- Сервис API: `node dist/index.js` из `apps/api`, `EnvironmentFile` на `.env`.
- Пользователь systemd должен совпадать с владельцем `/opt/birzha` и `apps/api/.env` (пример в `vps-ubuntu.md`: Unix-пользователь `birzha`, `.env` с правами `600`).
- Nginx: статика `apps/web/dist`, `location /api/` → `http://127.0.0.1:3000/`.
- Пример конфига: **`deploy/nginx-birzha.example.conf`**.

## 6. Доступ и HTTPS

- Файрвол: SSH, HTTP/HTTPS.
- С доменом: **`certbot --nginx -d домен`**.

## 7. Обновление

**Основной порядок** — **вручную** (подробности — **`deploy/README.md`**):

```bash
cd /opt/birzha
git fetch origin && git checkout main && git pull --ff-only origin main
pnpm install --frozen-lockfile
pnpm exec turbo run build --force
set -a && source apps/api/.env && set +a
pg_dump "$DATABASE_URL" --format=custom --file "birzha-before-update-$(date +%F-%H%M).dump"
cd apps/api && pnpm db:push
sudo systemctl restart birzha-api
curl -fsS http://127.0.0.1:3000/health
```

**Опционально:** `BIRZHA_BACKUP_CONFIRMED=1 ./deploy/server-update.sh` — тот же смысл, см. `deploy/README.md`. Без подтверждения бэкапа скрипт остановится перед `db:push`.

## 8. Откат кода

Если после обновления `/health` не проходит:

```bash
cd /opt/birzha
git checkout ПРЕДЫДУЩИЙ_COMMIT
pnpm install --frozen-lockfile
pnpm exec turbo run build --force
sudo systemctl restart birzha-api
curl -fsS http://127.0.0.1:3000/health
```

Откат схемы БД автоматически не делается. Если `db:push` уже изменил схему и нужен полный откат данных/схемы — восстанавливайте отдельный проверенный `pg_dump` по процедуре ниже.

## 9. Резервные копии

Минимальный регламент:

- Перед `pnpm db:push` на production — свежий **`pg_dump`**.
- По расписанию — ежедневный `pg_dump` в хранилище вне VPS (или снапшоты провайдера + копия вне сервера).
- Ретеншн: например 7 ежедневных + 4 еженедельных копии.
- Не реже раза в месяц — пробное восстановление в отдельную БД и проверка запуска API.

Пример ручного дампа:

```bash
pg_dump "$DATABASE_URL" --format=custom --file "birzha-$(date +%F-%H%M).dump"
```

Восстановление проверяйте в отдельную тестовую БД, не поверх рабочей.

Пример проверки восстановления:

```bash
createdb birzha_restore_check
pg_restore --dbname=birzha_restore_check "birzha-YYYY-MM-DD-HHMM.dump"
DATABASE_URL=postgresql://USER:PASSWORD@127.0.0.1:5432/birzha_restore_check pnpm --filter @birzha/api test
dropdb birzha_restore_check
```
