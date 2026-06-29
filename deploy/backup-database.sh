#!/usr/bin/env bash
# Резервная копия PostgreSQL (custom format для pg_restore).
#
# Запуск на VPS из /opt/birzha:
#   bash deploy/backup-database.sh
#
# Переменные:
#   BIRZHA_ROOT          — корень клона (по умолчанию /opt/birzha)
#   BIRZHA_BACKUP_DIR    — каталог дампов (по умолчанию $ROOT/backups)
#   BIRZHA_BACKUP_KEEP_DAYS — сколько дней хранить birzha-daily-* (по умолчанию 7)
#   BIRZHA_BACKUP_TAG    — метка в имени файла (по умолчанию daily)

set -euo pipefail

ROOT="${BIRZHA_ROOT:-/opt/birzha}"
BACKUP_DIR="${BIRZHA_BACKUP_DIR:-$ROOT/backups}"
KEEP_DAYS="${BIRZHA_BACKUP_KEEP_DAYS:-7}"
TAG="${BIRZHA_BACKUP_TAG:-daily}"

cd "$ROOT"

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

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "Ошибка: pg_dump не найден" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
TS="$(date +%F-%H%M%S)"
OUT="$BACKUP_DIR/birzha-${TAG}-${TS}.dump"

echo ">>> pg_dump → $OUT"
pg_dump "$DATABASE_URL" --format=custom --file "$OUT"

SIZE="$(du -h "$OUT" | awk '{print $1}')"
echo ">>> готово: $OUT ($SIZE)"

if [[ "$KEEP_DAYS" =~ ^[0-9]+$ ]] && [[ "$KEEP_DAYS" -gt 0 ]]; then
  find "$BACKUP_DIR" -maxdepth 1 -type f -name "birzha-daily-*.dump" -mtime +"$KEEP_DAYS" -print -delete 2>/dev/null || true
fi
