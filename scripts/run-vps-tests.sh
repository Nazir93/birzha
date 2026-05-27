#!/bin/bash
set -euo pipefail
cd /opt/birzha
set -a
# shellcheck disable=SC1091
source apps/api/.env
set +a
export TEST_DATABASE_URL="${DATABASE_URL%/*}/birzha_test"
export NODE_ENV=test
echo "=== git HEAD ==="
git rev-parse --short HEAD
echo "=== TEST DB (redacted) ==="
echo "${TEST_DATABASE_URL}" | sed -E 's#(://[^:/]+):[^@]*@#\1:***@#'
echo "=== pnpm install ==="
pnpm install --frozen-lockfile
echo "=== pnpm check (typecheck + all tests + build) ==="
pnpm check
echo "=== E2E roles (PostgreSQL) ==="
export E2E_DATABASE_URL="$TEST_DATABASE_URL"
export E2E_JWT_SECRET="${JWT_SECRET}"
export E2E_TEST_PASSWORD="${E2E_TEST_PASSWORD:-E2e-birzha-test-99}"
pnpm e2e:roles
echo "=== ALL VPS TESTS DONE ==="
