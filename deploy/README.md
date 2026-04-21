# Деплой: Git → сервер

## На VPS (ручной цикл)

1. Один раз: клонировать репозиторий (см. **`docs/deployment/vps-ubuntu.md`**), настроить `apps/api/.env`, PostgreSQL, **nginx**, **systemd** (`docs/deployment/runbook.md`).
2. При каждом обновлении из Git — **вариант А: скрипт** (рекомендуется):

```bash
cd /opt/birzha   # или ваш каталог
chmod +x deploy/server-update.sh   # один раз
./deploy/server-update.sh
```

**Вариант Б: те же шаги вручную** (если скрипт не используете — копируйте целиком, по порядку):

```bash
cd /opt/birzha
git fetch origin && git checkout main && git pull --ff-only origin main
pnpm install --frozen-lockfile
pnpm exec turbo run build --force
cd apps/api && pnpm db:push
sudo systemctl restart birzha-api
```

После `db:push` вы снова в `apps/api`; следующий заход начните с `cd /opt/birzha`, если нужен полный цикл снова.

Скрипт `server-update.sh` делает то же самое: `git pull`, `pnpm install`, **`turbo run build --force`** (без кэша Turbo — иначе после `git pull` можно отдать старый JS), `pnpm db:push` в `apps/api`, затем `sudo systemctl restart birzha-api`.

Для пользователя деплоя настройте **sudo без пароля** только на `systemctl restart birzha-api` (или запускайте скрипт под root — не рекомендуется).

Переменные: см. комментарии в начале **`server-update.sh`** (ветка `BIRZHA_GIT_BRANCH`, пропуск БД или перезапуска).

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
