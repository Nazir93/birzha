#!/usr/bin/env bash
# Наполнение архива тестовыми данными на VPS и проверка списков/отчётов.
#
# Запуск из /opt/birzha (нужен apps/api/.env с DATABASE_URL и JWT_SECRET):
#   BIRZHA_DEMO_SEED_PASSWORD='…' bash deploy/seed-archive-stress.sh
#
# По умолчанию: reset → demo → 50 закрытых ARCHIVE-рейсов → verify.
# Пропустить reset (данные уже есть): BIRZHA_SKIP_RESET=1
# Только verify: BIRZHA_VERIFY_ONLY=1

set -euo pipefail

ROOT="${BIRZHA_ROOT:-/opt/birzha}"
cd "$ROOT"

if [[ ! -f "$ROOT/apps/api/.env" ]]; then
  echo "Ошибка: нет $ROOT/apps/api/.env" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ROOT/apps/api/.env"
set +a

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "Ошибка: DATABASE_URL не задан" >&2
  exit 1
fi

if [[ "${BIRZHA_VERIFY_ONLY:-0}" == "1" ]]; then
  echo ">>> verify archive only"
  (cd "$ROOT/apps/api" && pnpm db:verify-archive)
  exit 0
fi

if [[ "${BIRZHA_SKIP_RESET:-0}" != "1" ]]; then
  echo ">>> reset test data"
  (cd "$ROOT/apps/api" && pnpm db:reset-test-data)
fi

if [[ "${BIRZHA_SKIP_DEMO:-0}" != "1" ]]; then
  if [[ -z "${BIRZHA_DEMO_SEED_PASSWORD:-}" ]]; then
    echo "Ошибка: задайте BIRZHA_DEMO_SEED_PASSWORD (≥10 символов) для db:seed-demo" >&2
    exit 1
  fi
  echo ">>> seed demo"
  (cd "$ROOT/apps/api" && BIRZHA_DEMO_SEED_PASSWORD="$BIRZHA_DEMO_SEED_PASSWORD" pnpm db:seed-demo)
fi

echo ">>> seed archive stress (BIRZHA_ARCHIVE_TRIP_COUNT=${BIRZHA_ARCHIVE_TRIP_COUNT:-50})"
(cd "$ROOT/apps/api" && pnpm db:seed-archive-stress)

echo ">>> verify archive"
(cd "$ROOT/apps/api" && pnpm db:verify-archive)

if [[ "${SKIP_SYSTEMD_RESTART:-0}" != "1" ]]; then
  SERVICE="${BIRZHA_SYSTEMD_SERVICE:-birzha-api}"
  echo ">>> systemctl restart $SERVICE"
  sudo systemctl restart "$SERVICE" || true
fi

echo "OK: архив нагружен и проверен"
