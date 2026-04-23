# Развёртывание «Биржа» на VPS (Ubuntu)

Пошаговый чеклист без секретов в репозитории. Секреты (`JWT_SECRET`, пароль БД, пароль root) храните только на сервере и в менеджере паролей.

## 0. Безопасность до и после первого входа

1. **Смените пароль root**, если он когда-либо попадал в чат, почту или скриншот.
2. Настройте **SSH по ключу** и при желании отключите вход по паролю (`PasswordAuthentication no` в `sshd_config`).
3. Включите **файрвол** (например UFW): открыты `22` (или ваш SSH-порт), `80`, `443`; остальное закрыто.
4. Установите **fail2ban** по желанию.

## 1. Системные пакеты

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git nginx certbot python3-certbot-nginx
```

Node.js **20+** (например через NodeSource или `nvm`):

```bash
# пример: Node 22 LTS с официального скрипта или пакета вашей политики
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

Включите **corepack** и pnpm:

```bash
sudo corepack enable
corepack prepare pnpm@latest --activate
```

## 2. Клонирование репозитория

```bash
sudo mkdir -p /opt/birzha
sudo chown "$USER":"$USER" /opt/birzha
cd /opt/birzha
git clone https://github.com/Nazir93/birzha.git .
```

(Если репозиторий приватный — настройте deploy key или PAT.)

## 3. PostgreSQL на сервере

Установите пакеты и создайте пользователя и базу (пароль храните только на сервере):

```bash
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable --now postgresql
sudo -u postgres psql -c "CREATE USER birzha WITH PASSWORD 'НАДЁЖНЫЙ_ПАРОЛЬ';"
sudo -u postgres psql -c "CREATE DATABASE birzha OWNER birzha;"
```

Проверка входа по TCP (как будет ходить Node):

```bash
PGPASSWORD='НАДЁЖНЫЙ_ПАРОЛЬ' psql -h 127.0.0.1 -U birzha -d birzha -c "SELECT 1;"
```

Строка подключения в `DATABASE_URL` вида:

`postgresql://USER:PASSWORD@127.0.0.1:5432/DBNAME`

Если в пароле есть символ `@`, в URL замените его на **`%40`** (только в части пароля).

## 4. Переменные окружения API

```bash
cp apps/api/.env.example apps/api/.env
nano apps/api/.env   # или vim
```

Обязательно:

- `DATABASE_URL` — ваша строка PostgreSQL.
- `JWT_SECRET` — **не короче 32 символов**, случайная строка.
- `NODE_ENV=production`
- `HOST=127.0.0.1` (API только за nginx) или `0.0.0.0` при другой схеме.
- `PORT=3000`

Для продакшена с входом в UI обычно:

- `REQUIRE_API_AUTH=true`

После сохранения:

```bash
cd /opt/birzha
pnpm install
pnpm --filter @birzha/domain build
cd apps/api && pnpm db:push
```

`db:push` применяет схему Drizzle к БД (см. `README.md`).

## 5. Сборка монорепо

Из корня `/opt/birzha`:

```bash
pnpm build
```

Должны собраться `@birzha/web` (статика в `apps/web/dist`) и `@birzha/api`.

## 6. Пользователь для первого входа

При **`REQUIRE_API_AUTH=true`** создайте учётную запись после сборки:

```bash
cd /opt/birzha/apps/api
pnpm create-user -- --login ВАШ_ЛОГИН --password 'ВАШ_ПАРОЛЬ' --role admin
```

Роли: `admin`, `manager`, `purchaser`, `warehouse`, `logistics`, `receiver`, `seller`, `accountant`. Подробнее — **`docs/deployment/runbook.md`**. Альтернатива — INSERT в `users` / `user_roles` и хэш через `hashPassword` (`README.md`).

## 7. systemd: API как сервис

Создайте `/etc/systemd/system/birzha-api.service` (пути проверьте под вашего пользователя):

```ini
[Unit]
Description=Birzha API (Fastify)
After=network.target postgresql.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/birzha/apps/api
EnvironmentFile=/opt/birzha/apps/api/.env
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Убедитесь, что `node` в PATH для этого пользователя, или укажите полный путь к `node` (`which node`).

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now birzha-api
sudo systemctl status birzha-api
```

Проверка: `curl -sS http://127.0.0.1:3000/health`

## 8. Nginx: статика + прокси `/api`

Фронт в браузере обращается к **`/api/...`**. Прокси должен **убирать префикс** `/api` и передавать на API пути вида `/trips`, `/meta` (как в dev-прокси Vite).

Пример сервера (замените `your.domain`):

```nginx
server {
    listen 80;
    server_name your.domain;

    root /opt/birzha/apps/web/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:3000/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Проверка конфига и перезагрузка:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

## 9. HTTPS (Let’s Encrypt)

```bash
sudo certbot --nginx -d your.domain
```

## 10. Обновление приложения

**Основной порядок** — **вручную** (тот же, что в **`deploy/README.md`**):

```bash
cd /opt/birzha
git fetch origin && git checkout main && git pull --ff-only origin main
pnpm install --frozen-lockfile
pnpm exec turbo run build --force
cd apps/api && pnpm db:push
sudo systemctl restart birzha-api
```

**Опционально:** `chmod +x deploy/server-update.sh` (один раз) и `./deploy/server-update.sh` — эквивалент тому же, см. `deploy/server-update.sh`.

---

## Важно

- **Не коммитьте** `apps/api/.env` с секретами.
- Пароль root и `JWT_SECRET` из переписки считайте скомпрометированными — **смените**.
- Полный список переменных и маршрутов — в корневом `README.md`.
