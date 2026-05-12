# Деплой: Git → сервер

**Публичный URL после настройки nginx и TLS:** **https://24birzha.ru/** (см. **`docs/deployment/vps-ubuntu.md`**).

## На VPS (ручной цикл)

1. Один раз: клонировать репозиторий (см. **`docs/deployment/vps-ubuntu.md`**), настроить `apps/api/.env`, PostgreSQL, **nginx**, **systemd** (`docs/deployment/runbook.md`).

2. **При каждом обновлении из Git** — основной и зафиксированный в документации порядок, **команды вручную** (копируйте целиком, по порядку; каталог — ваш, часто `/opt/birzha`):

```bash
cd /opt/birzha
git fetch origin && git checkout main && git pull --ff-only origin main
pnpm install --frozen-lockfile
pnpm exec turbo run build --force
set -a && source apps/api/.env && set +a
pg_dump "$DATABASE_URL" --format=custom --file "birzha-before-update-$(date +%F-%H%M).dump"
cd apps/api && pnpm db:migrate
sudo systemctl restart birzha-api
curl -fsS http://127.0.0.1:3000/health
```

Если база изначально поднималась только через `db:push` и `db:migrate` ругается на уже существующие объекты, на этом шаге используйте **`pnpm db:push`** вместо `db:migrate` (или выровняйте журнал миграций вручную). Скрипт `server-update.sh` переключается переменной **`BIRZHA_DB_APPLY=migrate`** / **`BIRZHA_DB_APPLY=push`** (по умолчанию в скрипте — **push**).

`turbo run build --force` нужен, чтобы после `git pull` не остался устаревший кэш Turbo; пакет `@birzha/contracts` и остальные зависимости собираются по графу Turbo (`^build`). После шага в `apps/api` **следующий** полный цикл снова с `cd /opt/birzha`.

**sudo:** настройте у пользователя деплоя `systemctl restart birzha-api` **без пароля** (или вводите пароль при `sudo` на перезапуске).

**Перед изменением схемы БД на продакшене:** сделайте свежий `pg_dump` или убедитесь, что автоматический бэкап уже прошёл и восстановление проверялось.

**Опционально (скрипт, тот же смысл):** после свежего `pg_dump` запускайте:

```bash
BIRZHA_BACKUP_CONFIRMED=1 ./deploy/server-update.sh
```

Или **автоматический дамп на сервере** перед шагом БД (нужны `pg_dump`, `DATABASE_URL` в `apps/api/.env`):

```bash
BIRZHA_AUTO_BACKUP=1 ./deploy/server-update.sh
```

Чтобы при деплое применялись файлы из **`apps/api/drizzle/*.sql`** (журнал Drizzle), а не только `db:push`:

```bash
BIRZHA_DB_APPLY=migrate BIRZHA_AUTO_BACKUP=1 ./deploy/server-update.sh
```

Короткая обёртка с тем же смыслом (всегда включает автоматический дамп):

```bash
bash deploy/obnovit-server.sh
```

После выкладки статики nginx обычно достаточно отдаёт новые файлы с диска; если меняли конфиг nginx:

```bash
RELOAD_NGINX=1 BIRZHA_AUTO_BACKUP=1 ./deploy/server-update.sh
```

Один раз может понадобиться `chmod +x deploy/server-update.sh`. См. переменные в начале **`server-update.sh`** (`BIRZHA_GIT_BRANCH`, **`BIRZHA_DB_APPLY`**, пропуск БД, перезапуска или healthcheck). Без `BIRZHA_BACKUP_CONFIRMED=1` **и** без `BIRZHA_AUTO_BACKUP=1` скрипт остановится перед изменением схемы БД. По умолчанию после рестарта проверяется `http://127.0.0.1:3000/health`.

## Откат кода

Если healthcheck после обновления не прошёл, верните предыдущий commit (скрипт печатает его в ошибке):

```bash
cd /opt/birzha
git checkout ПРЕДЫДУЩИЙ_COMMIT
pnpm install --frozen-lockfile
pnpm exec turbo run build --force
sudo systemctl restart birzha-api
curl -fsS http://127.0.0.1:3000/health
```

Откат схемы/данных делается только из заранее снятого `pg_dump`, не через `git checkout`.

## Из GitHub (CI → SSH)

В репозитории: **Settings → Secrets and variables → Actions** добавьте:

| Secret | Назначение |
|--------|------------|
| `BIRZHA_DEPLOY_HOST` | IP или hostname VPS (можно **`24birzha.ru`**, если SSH слушает по имени) |
| `BIRZHA_DEPLOY_USER` | SSH-пользователь (например `deploy`) |
| `BIRZHA_SSH_PRIVATE_KEY` | Приватный ключ (весь PEM), пароль к ключу не поддерживается в workflow |
| `BIRZHA_DEPLOY_PATH` (опц.) | Каталог клона, по умолчанию `/opt/birzha` |

Workflow **Deploy to server** (только **workflow_dispatch** — запуск вручную на вкладке Actions) подключается по SSH и выполняет `deploy/server-update.sh` на сервере. Перед запуском workflow нужно отметить input **`backup_confirmed`** — это подтверждение, что свежий бэкап уже сделан или шаг БД не нужен.

Первый раз на сервере должен быть **настроен `git remote`** и доступ **по ключу** для CI-пользователя.

В **Actions → Deploy to server** можно включить **`auto_pg_dump`**: тогда на VPS выполняется `BIRZHA_AUTO_BACKUP=1` (дамп в `backups/` перед изменением схемы). Иначе по-прежнему нужен отмеченный **`backup_confirmed`**. Чтобы на сервере вызывался **`db:migrate`**, включите в workflow input **`drizzle_migrate`** или задайте на VPS **`BIRZHA_DB_APPLY=migrate`** для пользователя деплоя.
