#!/usr/bin/env bash
# Очистка хозяйственных данных PostgreSQL (схема не трогается).
# Удаляет: рейсы, накладные, партии, продажи, погрузочные накладные, контрагентов, оптовиков…
# Сохраняет: users, user_roles, roles, ship_destinations, warehouses, product_grades.
#
# Запуск на VPS из /opt/birzha:
#   BIRZHA_AUTO_BACKUP=1 bash deploy/clean-database.sh
#
# Если pg_dump уже сделали вручную:
#   BIRZHA_BACKUP_CONFIRMED=1 bash deploy/clean-database.sh
#
# Переменные: BIRZHA_ROOT, BIRZHA_SYSTEMD_SERVICE (birzha-api), SKIP_SYSTEMD_RESTART=1

set -euo pipefail

ROOT="${BIRZHA_ROOT:-/opt/birzha}"
SERVICE="${BIRZHA_SYSTEMD_SERVICE:-birzha-api}"
HEALTH_URL="${BIRZHA_HEALTH_URL:-http://127.0.0.1:3000/health}"

cd "$ROOT"

if [[ "${BIRZHA_BACKUP_CONFIRMED:-0}" != "1" && "${BIRZHA_AUTO_BACKUP:-0}" != "1" ]]; then
  echo "Ошибка: перед очисткой нужен бэкап prod-БД." >&2
  echo "  BIRZHA_AUTO_BACKUP=1       — pg_dump в $ROOT/backups/" >&2
  echo "  BIRZHA_BACKUP_CONFIRMED=1  — дамп уже сделан вручную" >&2
  exit 1
fi

if [[ ! -f "$ROOT/apps/api/.env" ]]; then
  echo "Ошибка: нет $ROOT/apps/api/.env" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ROOT/apps/api/.env"
set +a

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "Ошибка: DATABASE_URL не задан в apps/api/.env" >&2
  exit 1
fi

if [[ "${BIRZHA_AUTO_BACKUP:-0}" == "1" ]]; then
  mkdir -p "$ROOT/backups"
  BK="$ROOT/backups/birzha-before-clean-$(date +%F-%H%M%S).dump"
  echo ">>> pg_dump → $BK"
  pg_dump "$DATABASE_URL" --format=custom --file "$BK"
  echo ">>> бэкап сохранён"
fi

echo ">>> очистка данных (pnpm db:reset-test-data)"
(cd "$ROOT/apps/api" && pnpm db:reset-test-data)

if [[ "${SKIP_SYSTEMD_RESTART:-0}" != "1" ]]; then
  echo ">>> systemctl restart $SERVICE"
  sudo systemctl restart "$SERVICE"
  sleep 3
  if ! systemctl is-active --quiet "$SERVICE"; then
    echo "Ошибка: $SERVICE не active" >&2
    journalctl -u "$SERVICE" -n 30 --no-pager >&2 || true
    exit 1
  fi
  echo ">>> healthcheck $HEALTH_URL"
  curl -fsS "$HEALTH_URL" >/dev/null
  echo ">>> healthcheck ok"
fi

echo "Готово: хозяйственные данные очищены. Пользователи, склады, калибры и направления отгрузки сохранены."
echo "Опционально демо-данные: cd apps/api && pnpm db:seed-demo  (нужен BIRZHA_DEMO_SEED_PASSWORD)"
