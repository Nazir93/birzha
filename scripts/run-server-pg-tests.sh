#!/usr/bin/env bash
# PG-интеграции на VPS: отдельная БД birzha_e2e (боевая birzha не трогаем).
set -euo pipefail
cd /opt/birzha

set -a
# shellcheck disable=SC1091
. apps/api/.env
set +a

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL empty" >&2
  exit 1
fi

BASE_URL="${DATABASE_URL%/*}"
PROD_DB="${DATABASE_URL##*/}"
PROD_DB="${PROD_DB%%\?*}"
TEST_DB="birzha_e2e"

if [[ "$PROD_DB" == "$TEST_DB" ]]; then
  echo "Refusing: would use prod DB" >&2
  exit 1
fi

export TEST_DATABASE_URL="${BASE_URL}/${TEST_DB}"
export E2E_DATABASE_URL="${BASE_URL}/${TEST_DB}"
export E2E_JWT_SECRET="${E2E_JWT_SECRET:-e2e-ci-jwt-secret-minimum-32-characters-here}"
export E2E_TEST_PASSWORD="${E2E_TEST_PASSWORD:-E2e-birzha-test-99}"

echo "Prod DB (untouched): $PROD_DB"
echo "TEST_DATABASE_URL → …/${TEST_DB}"

# Confirm DB exists and we can connect
cur="$(psql "$TEST_DATABASE_URL" -tAc "SELECT current_database();")"
if [[ "$cur" != "$TEST_DB" ]]; then
  echo "Expected $TEST_DB, got: $cur" >&2
  exit 1
fi

# Wipe public + drizzle journal so migrate re-applies SQL (safe: not prod)
echo "Resetting schema in $TEST_DB..."
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
DROP SCHEMA IF EXISTS public CASCADE;
DROP SCHEMA IF EXISTS drizzle CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO public;
GRANT ALL ON SCHEMA public TO CURRENT_USER;
SQL

echo "=== typecheck ==="
pnpm typecheck

echo "=== @birzha/api test (with TEST_DATABASE_URL) ==="
pnpm --filter @birzha/api test

echo "=== domain + contracts + web unit ==="
pnpm --filter @birzha/domain test
pnpm --filter @birzha/contracts test
pnpm --filter @birzha/web test

if [[ "${RUN_E2E_AUTH:-0}" == "1" ]]; then
  echo "=== Playwright auth e2e ==="
  # Fresh schema again for e2e seed (e2e-server itself migrates)
  psql "$E2E_DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
DROP SCHEMA IF EXISTS public CASCADE;
DROP SCHEMA IF EXISTS drizzle CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO public;
GRANT ALL ON SCHEMA public TO CURRENT_USER;
SQL
  pnpm exec playwright test e2e/role-nav-auth.spec.ts e2e/full-section-regression-auth.spec.ts
fi

echo "ALL SERVER TESTS OK"
