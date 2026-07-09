#!/usr/bin/env bash
# Полная проверка на VPS: PG-тесты + E2E по ролям (не трогает prod birzha).
set -euo pipefail
ROOT="${BIRZHA_ROOT:-/opt/birzha}"
cd "$ROOT"

set -a
# shellcheck disable=SC1090
source "$ROOT/apps/api/.env"
set +a

BASE="${DATABASE_URL%/*}"
export NODE_ENV=development
unset CI

ensure_db() {
  local db="$1"
  local exists
  exists="$(psql "$BASE/postgres" -tAc "SELECT 1 FROM pg_database WHERE datname='${db}'" 2>/dev/null || true)"
  if [[ "$exists" == "1" ]]; then
    echo "DB ok: $db"
    return 0
  fi
  if psql "$BASE/postgres" -c "CREATE DATABASE \"${db}\" OWNER birzha;" 2>/dev/null; then
    echo "DB created: $db"
    return 0
  fi
  echo "WARN: cannot create $db (need: sudo -u postgres createdb -O birzha $db)" >&2
  return 1
}

echo "==> ensure test databases"
ensure_db birzha_e2e || true
ensure_db birzha_test || true

pick_test_db() {
  if psql "$BASE/postgres" -tAc "SELECT 1 FROM pg_database WHERE datname='birzha_test'" | grep -q 1; then
    echo "birzha_test"
  else
    echo "birzha_e2e"
  fi
}

TEST_DB="$(pick_test_db)"
E2E_DB="birzha_e2e"
if ! psql "$BASE/postgres" -tAc "SELECT 1 FROM pg_database WHERE datname='birzha_e2e'" | grep -q 1; then
  E2E_DB="$TEST_DB"
fi

export TEST_DATABASE_URL="${BASE}/${TEST_DB}"
export E2E_DATABASE_URL="${BASE}/${E2E_DB}"
export E2E_JWT_SECRET="${JWT_SECRET}"
export E2E_TEST_PASSWORD="${E2E_TEST_PASSWORD:-E2e-birzha-test-99}"

echo "==> migrate $TEST_DB"
export DATABASE_URL="$TEST_DATABASE_URL"
(cd apps/api && pnpm db:migrate)

echo "==> migrate $E2E_DB (e2e seed)"
export DATABASE_URL="$E2E_DATABASE_URL"
(cd apps/api && pnpm db:migrate)

echo "==> pnpm check (TEST_DATABASE_URL=$TEST_DB)"
export DATABASE_URL="$TEST_DATABASE_URL"
pnpm check

echo "==> e2e golden-smoke (in-memory, PORT=3099)"
export CI=1
unset PORT
export PORT=3099
env -u E2E_DATABASE_URL -u E2E_JWT_SECRET REQUIRE_API_AUTH=false \
  pnpm exec playwright test e2e/golden-smoke.spec.ts

echo "==> stop e2e dev servers before auth tests"
fuser -k 3099/tcp 4173/tcp 2>/dev/null || true
sleep 2

echo "==> e2e roles (PostgreSQL, PORT=3099, DB=$E2E_DB)"
export PORT=3099
export E2E_DATABASE_URL="${BASE}/${E2E_DB}"
export E2E_JWT_SECRET="${JWT_SECRET}"
export CI=1
pnpm exec playwright test e2e/role-nav-auth.spec.ts

echo "==> health"
curl -sf http://127.0.0.1:3000/health
echo ""
curl -sf https://24birzha.ru/api/health
echo ""

echo "OK: vps-full-verify.sh ($TEST_DB + e2e on $E2E_DB)"
