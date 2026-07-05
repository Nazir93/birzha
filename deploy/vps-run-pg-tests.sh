#!/usr/bin/env bash
# Wipe test DB schema (without DROP DATABASE) and run PG integration tests on VPS.
set -euo pipefail
ROOT="/opt/birzha"
cd "$ROOT"
set -a
source "$ROOT/apps/api/.env"
set +a
BASE="${DATABASE_URL%/*}"

pick_test_db() {
  for db in birzha_test birzha_e2e; do
    if psql "$BASE/postgres" -tAc "SELECT 1 FROM pg_database WHERE datname='${db}'" | grep -q 1; then
      echo "$db"
      return 0
    fi
  done
  echo "ERROR: no birzha_test or birzha_e2e — run: sudo -u postgres createdb -O birzha birzha_test" >&2
  exit 1
}

DB="$(pick_test_db)"
URL="${BASE}/${DB}"
echo "==> using test database: $DB"

echo "==> wipe public + drizzle schemas"
psql "$URL" -v ON_ERROR_STOP=1 <<'SQL'
DROP SCHEMA IF EXISTS drizzle CASCADE;
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO birzha;
GRANT ALL ON SCHEMA public TO public;
SQL

echo "==> migrate"
export DATABASE_URL="$URL"
export TEST_DATABASE_URL="$URL"
(cd apps/api && pnpm db:migrate)

echo "==> api tests (PG + unit)"
export NODE_ENV=test
pnpm --filter @birzha/api exec vitest run --config vitest.config.ts --maxWorkers=1

echo "OK: tests on $DB"
