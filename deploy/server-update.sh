#!/usr/bin/env bash
# Обновление с Git на сервере: pull → install → build → схема БД → перезапуск API.
# Запускать на VPS из каталога клона (по умолчанию /opt/birzha), см. docs/deployment/runbook.md
#
# Переменные окружения (опционально):
#   BIRZHA_ROOT           — корень клона (по умолчанию /opt/birzha)
#   BIRZHA_GIT_BRANCH     — ветка (по умолчанию main)
#   BIRZHA_SYSTEMD_SERVICE — unit systemd API (по умолчанию birzha-api)
#   SKIP_DB=1             — не вызывать drizzle db:push
#   SKIP_SYSTEMD_RESTART=1 — не перезапускать systemd

set -euo pipefail

ROOT="${BIRZHA_ROOT:-/opt/birzha}"
BRANCH="${BIRZHA_GIT_BRANCH:-main}"
SERVICE="${BIRZHA_SYSTEMD_SERVICE:-birzha-api}"

cd "$ROOT"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Ошибка: не git-репозиторий: $ROOT" >&2
  exit 1
fi

echo ">>> git fetch / checkout $BRANCH / pull"
git fetch origin
git checkout "$BRANCH"
# Два аргумента: remote и ветка. Нельзя "origin/main" — git воспринимает как путь к репозиторию.
git pull --ff-only origin "$BRANCH"

echo ">>> pnpm install"
pnpm install --frozen-lockfile

echo ">>> build @birzha/domain"
pnpm --filter @birzha/domain build

echo ">>> pnpm build (turbo)"
pnpm build

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

echo "Готово: $ROOT обновлён."
