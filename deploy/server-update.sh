#!/usr/bin/env bash
# Обновление с Git на сервере: pull → install → build → схема БД → перезапуск API.
# Запускать на VPS из каталога клона (по умолчанию /opt/birzha), см. docs/deployment/runbook.md
#
# Переменные окружения (опционально):
#   BIRZHA_ROOT           — корень клона (по умолчанию /opt/birzha)
#   BIRZHA_GIT_BRANCH     — ветка (по умолчанию main)
#   BIRZHA_SYSTEMD_SERVICE — unit systemd API (по умолчанию birzha-api)
#   BIRZHA_HEALTH_URL      — post-deploy smoke URL (по умолчанию http://127.0.0.1:3000/health)
#   BIRZHA_BACKUP_CONFIRMED=1 — вы уже сделали свежий бэкап БД перед шагом БД
#   BIRZHA_AUTO_BACKUP=1     — перед шагом БД скрипт сам сделает pg_dump (нужен DATABASE_URL в apps/api/.env)
#   BIRZHA_DB_APPLY          — push | migrate (по умолчанию push): migrate = журнал drizzle/*.sql;
#                              push = drizzle-kit push (как раньше). Для выкатки *.sql из drizzle/ задайте migrate.
#   SKIP_DB=1                — не менять схему БД (ни push, ни migrate)
#   SKIP_SYSTEMD_RESTART=1   — не перезапускать systemd
#   SKIP_HEALTHCHECK=1       — не проверять /health после рестарта
#   RELOAD_NGINX=1           — после успешного healthcheck: nginx -t && systemctl reload nginx

set -euo pipefail

ROOT="${BIRZHA_ROOT:-/opt/birzha}"
BRANCH="${BIRZHA_GIT_BRANCH:-main}"
SERVICE="${BIRZHA_SYSTEMD_SERVICE:-birzha-api}"
HEALTH_URL="${BIRZHA_HEALTH_URL:-http://127.0.0.1:3000/health}"

cd "$ROOT"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Ошибка: не git-репозиторий: $ROOT" >&2
  exit 1
fi

if [[ "${SKIP_DB:-0}" != "1" && "${BIRZHA_BACKUP_CONFIRMED:-0}" != "1" && "${BIRZHA_AUTO_BACKUP:-0}" != "1" ]]; then
  echo "Ошибка: перед изменением схемы БД нужен бэкап или явное подтверждение." >&2
  echo "  BIRZHA_BACKUP_CONFIRMED=1  — вы уже сделали pg_dump вручную" >&2
  echo "  BIRZHA_AUTO_BACKUP=1       — скрипт сделает pg_dump в $ROOT/backups/ (из apps/api/.env)" >&2
  echo "  SKIP_DB=1                  — без изменения схемы БД" >&2
  exit 1
fi

PREVIOUS_COMMIT="$(git rev-parse --short HEAD)"

echo ">>> git fetch / checkout $BRANCH / pull"
git fetch origin
git checkout "$BRANCH"
# Два аргумента: remote и ветка. Нельзя "origin/main" — git воспринимает как путь к репозиторию.
git pull --ff-only origin "$BRANCH"
CURRENT_COMMIT="$(git rev-parse --short HEAD)"

echo ">>> pnpm install (CI=1 — без запроса на полную переустановку node_modules)"
CI=1 pnpm install --frozen-lockfile

echo ">>> turbo build --force (на сервере без кэша — иначе после git pull возможен устаревший билд)"
export VITE_PWA_START_URL="${VITE_PWA_START_URL:-/s}"
pnpm exec turbo run build --force

if [[ "${SKIP_DB:-0}" != "1" ]]; then
  if [[ "${BIRZHA_AUTO_BACKUP:-0}" == "1" ]]; then
    echo ">>> pg_dump (BIRZHA_AUTO_BACKUP=1) в $ROOT/backups/"
    if [[ ! -f "$ROOT/apps/api/.env" ]]; then
      echo "Ошибка: нет файла $ROOT/apps/api/.env для чтения DATABASE_URL" >&2
      exit 1
    fi
    mkdir -p "$ROOT/backups"
    set -a
    # shellcheck disable=SC1090
    source "$ROOT/apps/api/.env"
    set +a
    if [[ -z "${DATABASE_URL:-}" ]]; then
      echo "Ошибка: в apps/api/.env не задан DATABASE_URL" >&2
      exit 1
    fi
    BK="$ROOT/backups/birzha-before-$(date +%F-%H%M%S).dump"
    pg_dump "$DATABASE_URL" --format=custom --file "$BK"
    echo ">>> бэкап сохранён: $BK"
  fi
  DB_APPLY="${BIRZHA_DB_APPLY:-push}"
  case "$DB_APPLY" in
    migrate)
      echo ">>> drizzle db:migrate (apps/api) — журнал SQL из drizzle/"
      (cd apps/api && pnpm db:migrate)
      ;;
    push)
      echo ">>> drizzle db:push (apps/api)"
      (cd apps/api && pnpm db:push)
      ;;
    *)
      echo "Ошибка: BIRZHA_DB_APPLY должен быть migrate или push, сейчас: $DB_APPLY" >&2
      exit 1
      ;;
  esac
else
  echo ">>> SKIP_DB=1 — пропуск изменения схемы БД"
fi

if [[ "${SKIP_SYSTEMD_RESTART:-0}" != "1" ]]; then
  echo ">>> systemctl restart $SERVICE"
  sudo systemctl restart "$SERVICE"
  echo ">>> ожидание запуска API (3 с)"
  sleep 3
  if ! systemctl is-active --quiet "$SERVICE"; then
    echo "Ошибка: $SERVICE не в состоянии active после restart" >&2
    journalctl -u "$SERVICE" -n 40 --no-pager >&2 || true
    exit 1
  fi
else
  echo ">>> SKIP_SYSTEMD_RESTART=1 — перезапуск systemd вручную"
fi

if [[ "${SKIP_HEALTHCHECK:-0}" != "1" ]]; then
  echo ">>> healthcheck $HEALTH_URL"
  health_ok=0
  for attempt in 1 2 3 4 5 6 7 8 9 10; do
    if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
      health_ok=1
      echo ">>> healthcheck ok (попытка $attempt)"
      break
    fi
    echo ">>> healthcheck попытка $attempt/10 — API ещё не отвечает, ждём 2 с…" >&2
    sleep 2
  done
  if [[ "$health_ok" != "1" ]]; then
    echo "Ошибка: healthcheck не прошёл: $HEALTH_URL" >&2
    journalctl -u "$SERVICE" -n 40 --no-pager >&2 || true
    echo "Предыдущий commit до обновления: $PREVIOUS_COMMIT; текущий commit: $CURRENT_COMMIT" >&2
    echo "Откат кода: git checkout $PREVIOUS_COMMIT && CI=1 pnpm install --frozen-lockfile && pnpm exec turbo run build --force && sudo systemctl restart $SERVICE" >&2
    echo "Диагностика: bash deploy/check-server.sh" >&2
    exit 1
  fi
else
  echo ">>> SKIP_HEALTHCHECK=1 — пропуск healthcheck"
fi

if [[ "${RELOAD_NGINX:-0}" == "1" ]]; then
  echo ">>> nginx -t && systemctl reload nginx"
  sudo nginx -t
  sudo systemctl reload nginx
fi

echo "Готово: $ROOT обновлён ($PREVIOUS_COMMIT -> $CURRENT_COMMIT)."
