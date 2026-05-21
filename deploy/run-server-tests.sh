#!/usr/bin/env bash
# Полный прогон тестов на VPS (после git pull). НЕ использует prod DATABASE_URL для PG-тестов.
#
# Важно: в shell не должен висеть NODE_ENV=production (из apps/api/.env) — скрипт сбрасывает сам.
#
# PG-тесты (опционально): отдельная БД, URL из apps/api/.env с другим именем базы:
#   set -a && source apps/api/.env && set +a
#   sudo -u postgres createdb birzha_test
#   export TEST_DATABASE_URL="${DATABASE_URL%/*}/birzha_test"   # bash: та же учётка, другая БД
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

# apps/api/.env часто задаёт NODE_ENV=production → pnpm ставит только prod и нет tsc/vitest.
export NODE_ENV=development
unset CI

echo "==> install (devDependencies включены)"
pnpm install --frozen-lockfile

echo "==> typecheck"
pnpm typecheck

echo "==> unit tests (domain, contracts, web)"
pnpm --filter @birzha/domain test
pnpm --filter @birzha/contracts test
pnpm --filter @birzha/web test

echo "==> api tests (in-memory + PG если задан TEST_DATABASE_URL)"
# Не подставляйте шаблон USER:PASS — скопируйте строку из apps/api/.env, замените имя БД на birzha_test.
if [[ -n "${TEST_DATABASE_URL:-}" ]] && [[ "$TEST_DATABASE_URL" == *"USER"* ]]; then
  echo "Ошибка: TEST_DATABASE_URL похож на шаблон из README — укажите реальный URL PostgreSQL" >&2
  exit 1
fi
pnpm --filter @birzha/api test

echo "==> build"
pnpm build

if pnpm exec playwright --version >/dev/null 2>&1; then
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
  echo "SKIP: Playwright не установлен (нужен dev install)"
fi

echo "OK: прогон завершён"
