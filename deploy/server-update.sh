#!/usr/bin/env bash
# Обновление с Git на сервере: pull → install → build → схема БД → перезапуск API.
# Запускать на VPS из каталога клона (по умолчанию /opt/birzha), см. docs/deployment/runbook.md
#
# Переменные окружения (опционально):
#   BIRZHA_ROOT           — корень клона (по умолчанию /opt/birzha)
#   BIRZHA_GIT_BRANCH     — ветка (по умолчанию main)
#   BIRZHA_SYSTEMD_SERVICE — unit systemd API (по умолчанию birzha-api)
#   BIRZHA_HEALTH_URL      — post-deploy smoke URL (по умолчанию http://127.0.0.1:3000/health)
#   BIRZHA_BACKUP_CONFIRMED=1 — обязательное подтверждение свежего бэкапа перед db:push
#   SKIP_DB=1             — не вызывать drizzle db:push
#   SKIP_SYSTEMD_RESTART=1 — не перезапускать systemd
#   SKIP_HEALTHCHECK=1     — не проверять /health после рестарта

set -euo pipefail

ROOT="${BIRZHA_ROOT:-/opt/birzha}"
BRANCH="${BIRZHA_GIT_BRANCH:-main}"
SERVICE="${BIRZHA_SYSTEMD_SERVICE:-birzha-api}"
HEALTH_URL="${BIRZHA_HEALTH_URL:-http://127.0.0.1:3000/health}"

cd "$ROOT"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Ошибка: не git-репозиторий: $ROOT" >&2
  exit 1
fi

if [[ "${SKIP_DB:-0}" != "1" && "${BIRZHA_BACKUP_CONFIRMED:-0}" != "1" ]]; then
  echo "Ошибка: перед db:push нужен свежий бэкап БД." >&2
  echo "Сделайте pg_dump и запустите снова: BIRZHA_BACKUP_CONFIRMED=1 ./deploy/server-update.sh" >&2
  echo "Если схему БД менять не нужно: SKIP_DB=1 ./deploy/server-update.sh" >&2
  exit 1
fi

PREVIOUS_COMMIT="$(git rev-parse --short HEAD)"

echo ">>> git fetch / checkout $BRANCH / pull"
git fetch origin
git checkout "$BRANCH"
# Два аргумента: remote и ветка. Нельзя "origin/main" — git воспринимает как путь к репозиторию.
git pull --ff-only origin "$BRANCH"
CURRENT_COMMIT="$(git rev-parse --short HEAD)"

echo ">>> pnpm install"
pnpm install --frozen-lockfile

echo ">>> turbo build --force (на сервере без кэша — иначе после git pull возможен устаревший билд)"
pnpm exec turbo run build --force

if [[ "${SKIP_DB:-0}" != "1" ]]; then
  echo ">>> drizzle db:push (apps/api)"
  (cd apps/api && pnpm db:push)
else
  echo ">>> SKIP_DB=1 — пропуск db:push"
fi

if [[ "${SKIP_SYSTEMD_RESTART:-0}" != "1" ]]; then
  echo ">>> systemctl restart $SERVICE"
  sudo systemctl restart "$SERVICE"
else
  echo ">>> SKIP_SYSTEMD_RESTART=1 — перезапуск systemd вручную"
fi

if [[ "${SKIP_HEALTHCHECK:-0}" != "1" ]]; then
  echo ">>> healthcheck $HEALTH_URL"
  for attempt in 1 2 3 4 5; do
    if curl -fsS "$HEALTH_URL" >/dev/null; then
      echo ">>> healthcheck ok"
      break
    fi
    if [[ "$attempt" == "5" ]]; then
      echo "Ошибка: healthcheck не прошёл: $HEALTH_URL" >&2
      echo "Предыдущий commit до обновления: $PREVIOUS_COMMIT; текущий commit: $CURRENT_COMMIT" >&2
      echo "Откат кода: git checkout $PREVIOUS_COMMIT && pnpm install --frozen-lockfile && pnpm exec turbo run build --force && sudo systemctl restart $SERVICE" >&2
      exit 1
    fi
    sleep 2
  done
else
  echo ">>> SKIP_HEALTHCHECK=1 — пропуск healthcheck"
fi

echo "Готово: $ROOT обновлён ($PREVIOUS_COMMIT -> $CURRENT_COMMIT)."
