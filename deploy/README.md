# Деплой: Git → сервер

## На VPS (ручной цикл)

1. Один раз: клонировать репозиторий (см. **`docs/deployment/vps-ubuntu.md`**), настроить `apps/api/.env`, PostgreSQL, **nginx**, **systemd** (`docs/deployment/runbook.md`).

2. **При каждом обновлении из Git** — основной и зафиксированный в документации порядок, **команды вручную** (копируйте целиком, по порядку; каталог — ваш, часто `/opt/birzha`):

```bash
cd /opt/birzha
git fetch origin && git checkout main && git pull --ff-only origin main
pnpm install --frozen-lockfile
pnpm exec turbo run build --force
cd apps/api && pnpm db:push
sudo systemctl restart birzha-api
```

`turbo run build --force` нужен, чтобы после `git pull` не остался устаревший кэш Turbo. После `db:push` вы в каталоге `apps/api`; **следующий** полный цикл снова с `cd /opt/birzha`.

**sudo:** настройте у пользователя деплоя `systemctl restart birzha-api` **без пароля** (или вводите пароль при `sudo` на перезапуске).

**Опционально (скрипт, тот же смысл):** `./deploy/server-update.sh` (один раз `chmod +x deploy/server-update.sh`). См. переменные в начале **`server-update.sh`** (`BIRZHA_GIT_BRANCH`, пропуск БД или перезапуска).

## Из GitHub (CI → SSH)

В репозитории: **Settings → Secrets and variables → Actions** добавьте:

| Secret | Назначение |
|--------|------------|
| `BIRZHA_DEPLOY_HOST` | IP или hostname VPS |
| `BIRZHA_DEPLOY_USER` | SSH-пользователь (например `deploy`) |
| `BIRZHA_SSH_PRIVATE_KEY` | Приватный ключ (весь PEM), пароль к ключу не поддерживается в workflow |
| `BIRZHA_DEPLOY_PATH` (опц.) | Каталог клона, по умолчанию `/opt/birzha` |

Workflow **Deploy to server** (только **workflow_dispatch** — запуск вручную на вкладке Actions) подключается по SSH и выполняет `deploy/server-update.sh` на сервере.

Первый раз на сервере должен быть **настроен `git remote`** и доступ **по ключу** для CI-пользователя.
