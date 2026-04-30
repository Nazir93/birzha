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
cd apps/api && pnpm db:push
cd ../.. && pnpm build
```

## 3. Переменные `apps/api/.env`

- **`DATABASE_URL`**, **`JWT_SECRET`** (≥ 32 символов), **`NODE_ENV=production`**, **`HOST=127.0.0.1`**, **`PORT=3000`**.
- **`REQUIRE_API_AUTH=true`** — если нужен вход в веб по логину/паролю.

## 4. Учётные записи (если включён вход)

**Правило:** у каждого сотрудника **свой логин и свой пароль**. Скрипт `create-user` запускают **отдельно для каждого человека** (уникальный `--login`). Общая учётка «на всех» приводит к путанице в действиях и отчётах.

Первый пользователь (часто администратор), из **`apps/api`** с тем же `.env`:

```bash
pnpm create-user -- --login ВАШ_ЛОГИН --password 'ВАШ_ПАРОЛЬ' --role admin
```

Дальше — так же для продавца, кладовщика и т.д., каждый раз **другой** `--login`.

Роли: `admin`, `manager`, `purchaser`, `warehouse`, `logistics`, `receiver`, `seller`, `accountant`.

Скрипт: `apps/api/scripts/create-user.ts` (хэш scrypt, как у API).

## 5. systemd и nginx

- Сервис API: `node dist/index.js` из `apps/api`, `EnvironmentFile` на `.env`.
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
cd apps/api && pnpm db:push
sudo systemctl restart birzha-api
```

**Опционально:** `deploy/server-update.sh` тот же смысл, см. `deploy/README.md`.

## 8. Резервные копии

Периодически **`pg_dump`** базы в безопасное хранилище (скрипт и расписание — по политике хостинга).
