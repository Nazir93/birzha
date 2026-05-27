#!/bin/bash
set -euo pipefail
cd /opt/birzha
set -a
# shellcheck disable=SC1091
source apps/api/.env
set +a
export TEST_DATABASE_URL="${DATABASE_URL%/*}/birzha_test"
export NODE_ENV=test
echo "=== API tests with PostgreSQL (birzha_test) ==="
pnpm --filter @birzha/api test 2>&1 | tee /tmp/birzha-api-test.log | tail -40
echo "=== PG integration summary ==="
grep -E 'pg.integration|skipped|passed' /tmp/birzha-api-test.log | tail -20 || true
echo "=== E2E golden-smoke (in-memory API :3099) ==="
export PORT=3099
unset E2E_DATABASE_URL
CI=true pnpm e2e:run 2>&1 | tail -25
echo "=== E2E roles (PostgreSQL :3099) ==="
export E2E_DATABASE_URL="$TEST_DATABASE_URL"
export E2E_JWT_SECRET="${JWT_SECRET}"
export E2E_TEST_PASSWORD="${E2E_TEST_PASSWORD:-E2e-birzha-test-99}"
export PORT=3099
CI=true pnpm e2e:roles 2>&1 | tail -20
echo "=== VPS PG+E2E DONE ==="
