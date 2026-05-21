#!/usr/bin/env bash
# Полный прогон тестов на VPS (после git pull). НЕ использует prod DATABASE_URL для PG-тестов.
#
# Обязательно задайте отдельную БД, например:
#   export TEST_DATABASE_URL=postgresql://birzha:PASSWORD@127.0.0.1:5432/birzha_test
#   createdb birzha_test   # один раз
#
# Опционально E2E по ролям (отдельная БД):
#   export E2E_DATABASE_URL=postgresql://birzha:PASSWORD@127.0.0.1:5432/birzha_e2e
#   export E2E_JWT_SECRET=...  # ≥ 32 символов
#
# Запуск из корня клона:
#   bash deploy/run-server-tests.sh

set -euo pipefail

ROOT="${BIRZHA_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$ROOT"

echo "==> install"
pnpm install --frozen-lockfile

echo "==> typecheck"
pnpm typecheck

echo "==> unit tests (domain, contracts, web)"
pnpm --filter @birzha/domain test
pnpm --filter @birzha/contracts test
pnpm --filter @birzha/web test

echo "==> api tests (in-memory)"
pnpm --filter @birzha/api test

if [[ -n "${TEST_DATABASE_URL:-}" ]]; then
  echo "==> api PG integration (TEST_DATABASE_URL)"
  TEST_DATABASE_URL="$TEST_DATABASE_URL" pnpm --filter @birzha/api test
else
  echo "SKIP: TEST_DATABASE_URL не задан — 18 PG-тестов API пропущены"
fi

echo "==> build"
pnpm build

if command -v chromium >/dev/null 2>&1 || [[ -d "$HOME/.cache/ms-playwright" ]]; then
  echo "==> playwright install (если нужно)"
  pnpm exec playwright install chromium --with-deps 2>/dev/null || pnpm exec playwright install chromium
  echo "==> e2e in-memory"
  pnpm exec playwright test
  if [[ -n "${E2E_DATABASE_URL:-}" && -n "${E2E_JWT_SECRET:-}" ]]; then
    echo "==> e2e roles (PostgreSQL)"
    pnpm exec playwright test e2e/role-nav-auth.spec.ts
  else
    echo "SKIP: E2E ролей — нужны E2E_DATABASE_URL и E2E_JWT_SECRET"
  fi
else
  echo "SKIP: Playwright/Chromium — установите зависимости или запустите на CI"
fi

echo "OK: прогон завершён"
