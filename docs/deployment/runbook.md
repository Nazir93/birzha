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
- Домен продакшена: **https://24birzha.ru/** — после DNS на VPS: **`sudo certbot --nginx -d 24birzha.ru`** (при необходимости добавьте `-d www.24birzha.ru`).

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

- Перед `pnpm db:push` / `db:migrate` на production — свежий дамп (`bash deploy/backup-database.sh` или `BIRZHA_AUTO_BACKUP=1`).
- **Ежедневно** (cron 03:15 UTC): локальный `pg_dump` в `/opt/birzha/backups` **и** копия в S3-совместимое хранилище через `rclone` (если настроен `BIRZHA_BACKUP_RCLONE_REMOTE`).
- Retention: **7** daily + **4** weekly (28 дней); локальные `birzha-before-*` — 14 дней. В бакете предпочтительно lifecycle с теми же сроками.
- Опционально: `BIRZHA_BACKUP_HEALTHCHECK_URL` (Healthchecks.io) — ping после успешного dump(+upload).
- Не реже раза в месяц — restore-drill в отдельную БД (ниже).

### Локально + cron

```bash
cd /opt/birzha
bash deploy/backup-database.sh
bash deploy/install-backup-cron.sh
```

Лог: `backups/backup.log`. Пока offsite не настроен, в логе будет `SKIP offsite: not configured`.

### Offsite (Яндекс Object Storage / любой S3)

1. Создайте бакет (пример: `birzha-backups`), ключи доступа с правом put/list/delete объектов.
2. На VPS:

```bash
cd /opt/birzha
sudo bash deploy/install-backup-offsite.sh
# от пользователя, под которым крутится cron (часто birzha):
rclone config
# тип: s3, provider: Other (или Yandex), endpoint storage.yandexcloud.net,
# access_key_id / secret_access_key, remote name например birzha-s3
sudo install -d -m 755 /etc/birzha
sudo cp deploy/backup-offsite.env.example /etc/birzha/backup.env
sudo chmod 600 /etc/birzha/backup.env
# в backup.env:
#   BIRZHA_BACKUP_RCLONE_REMOTE=birzha-s3:birzha-backups
#   BIRZHA_BACKUP_HEALTHCHECK_URL=https://hc-ping.com/...   # опционально
bash deploy/backup-database.sh
rclone ls birzha-s3:birzha-backups | head
```

Секреты rclone — в `~/.config/rclone/rclone.conf` пользователя cron, не в git.

### Restore-drill (не поверх рабочей БД)

```bash
cd /opt/birzha
# локальный файл или скачанный с S3:
# rclone copy birzha-s3:birzha-backups/birzha-daily-….dump /tmp/
createdb birzha_restore_check
pg_restore --dbname=birzha_restore_check backups/birzha-daily-YYYY-MM-DD-HHMMSS.dump
# убедиться, что restore завершился без критичных ошибок
dropdb birzha_restore_check
```

Свежесть дампа: `bash deploy/daily-ops-check.sh` (ошибка, если нет `birzha-daily-*.dump` новее 36 часов).

## 9a. Мониторинг (uptime)

**Снаружи (обязательный минимум):** workflow [`.github/workflows/uptime.yml`](../../.github/workflows/uptime.yml) раз в ~15 минут дергает:

- `https://24birzha.ru/api/health` — процесс API жив;
- `https://24birzha.ru/api/health/ready` — PostgreSQL отвечает (`"database":"ok"`).

После merge в `main`/`master` workflow появится в Actions. При падении GitHub шлёт письмо владельцу репозитория (включить: GitHub → Settings → Notifications → Actions).

**Telegram (опционально):** в Secrets репозитория:

| Secret | Назначение |
|--------|------------|
| `BIRZHA_TELEGRAM_BOT_TOKEN` | токен бота от @BotFather |
| `BIRZHA_TELEGRAM_CHAT_ID` | id чата (себе или группе) |

При FAIL workflow отправит сообщение в Telegram.

Ручной прогон: Actions → **Uptime** → Run workflow.

**На VPS (дополнение, не замена):** если API/БД легли, а хост ещё жив:

```bash
# /etc/birzha/monitor.env — см. deploy/monitor.env.example
bash deploy/notify-health-fail.sh
# cron, например каждые 5 минут:
# */5 * * * * cd /opt/birzha && bash deploy/notify-health-fail.sh >> /opt/birzha/backups/monitor.log 2>&1
```

Полный даун VPS этим скриптом не поймать — для этого нужен внешний Uptime (GitHub Actions выше или UptimeRobot на те же URL).

## 10. Быстрый security smoke (после выката/ребута)

Проверяем, что базовая защита и доступность не деградировали:

```bash
# Сервисы
systemctl is-active ssh nginx birzha-api fail2ban

# Ядро и флаг reboot
uname -r
test -f /var/run/reboot-required && cat /var/run/reboot-required || echo "reboot_required=no"

# Сетевой периметр
ufw status verbose
fail2ban-client status
fail2ban-client status sshd
fail2ban-client status nginx-birzha-auth-limit

# API health
curl -sS http://127.0.0.1:3000/health

# Анти-брутфорс login (ожидаемо: 401...401, затем 429)
for i in 1 2 3 4 5 6; do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -H "content-type: application/json" \
    -d '{"login":"smoke-user","password":"bad-pass"}' \
    http://127.0.0.1:3000/auth/login
done
```

## 11. Анти-цикл: когда остановить повторные проверки

Чтобы не гонять одно и то же по кругу, считаем систему **стабильной**, если одновременно выполнены все пункты:

- `systemctl is-active ssh nginx birzha-api fail2ban` -> везде `active`
- `curl -sS http://127.0.0.1:3000/health` -> `status: ok`
- `/auth/login` для неверных данных -> `401,401,401,401,429,429`
- `fail2ban-client status sshd` и `fail2ban-client status nginx-birzha-auth-limit` -> нет вашего админского IP в `Banned IP list`
- TCP доступ с вашей машины: `22` и `443` открыты

Если все пункты выше зелёные, **повторять smoke не нужно**. Следующий smoke — только:

- после изменений конфигов `sshd`/`nginx`/`fail2ban`/`ufw`
- после `apt upgrade` + reboot
- после деплоя, который меняет auth или сетевой периметр

### Если снова «не подключается сервер»

1. Сначала проверяем сеть (`22/443`) с локальной машины.
2. Если TCP закрыт — это периметр (fail2ban/ufw/cloud firewall), а не API.
3. Через web-console:
   - `fail2ban-client set sshd unbanip <YOUR_IP>`
   - `fail2ban-client set nginx-birzha-auth-limit unbanip <YOUR_IP>`
   - убедиться, что `<YOUR_IP>` в `ignoreip` (`/etc/fail2ban/jail.d/00-allow-admin.local`)
4. После восстановления доступа — один контрольный smoke и стоп.

## 12. Ежедневный ops-check (1 команда)

Для ежедневного контроля без ручного набора множества команд:

```bash
cd /opt/birzha
bash deploy/daily-ops-check.sh
```

Скрипт проверяет:

- `birzha-api`, `nginx`, `fail2ban`
- `GET /health`
- статус jail'ов `sshd` и `nginx-birzha-auth-limit`
- свободное место на диске `/`
