#!/usr/bin/env bash
# Полный прогон тестов на VPS: отдельные БД birzha_test и birzha_e2e (не prod birzha).
# Запуск из /opt/birzha:
#   bash deploy/server-test-all.sh
set -euo pipefail

ROOT="${BIRZHA_ROOT:-/opt/birzha}"
cd "$ROOT"

if [[ ! -f "$ROOT/apps/api/.env" ]]; then
  echo "Ошибка: нет $ROOT/apps/api/.env" >&2
  exit 1
fi

export NODE_ENV=development
unset CI

set -a
# shellcheck disable=SC1090
source "$ROOT/apps/api/.env"
set +a

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "Ошибка: DATABASE_URL не задан в apps/api/.env" >&2
  exit 1
fi

if [[ -z "${JWT_SECRET:-}" ]] || [[ ${#JWT_SECRET} -lt 32 ]]; then
  echo "Ошибка: JWT_SECRET в .env нужен (≥ 32 символов) для E2E" >&2
  exit 1
fi

BASE_URL="${DATABASE_URL%/*}"
export TEST_DATABASE_URL="${BASE_URL}/birzha_test"
export E2E_DATABASE_URL="${BASE_URL}/birzha_e2e"
export E2E_JWT_SECRET="${JWT_SECRET}"

echo "==> PostgreSQL: birzha_test, birzha_e2e"
for db in birzha_test birzha_e2e; do
  if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${db}'" | grep -q 1; then
    sudo -u postgres createdb -O birzha "$db"
    echo "    создана: $db"
  else
    echo "    уже есть: $db"
  fi
done

echo "==> миграции на тестовых БД"
for db in birzha_test birzha_e2e; do
  export DATABASE_URL="${BASE_URL}/${db}"
  (cd apps/api && pnpm db:migrate)
  echo "    migrate ok: $db"
done

export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=2048}"

echo "==> install + typecheck + unit tests + api (PG) + build + e2e"
bash "$ROOT/deploy/run-server-tests.sh"

echo "OK: deploy/server-test-all.sh завершён"
