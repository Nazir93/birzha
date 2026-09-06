#!/usr/bin/env bash
# Резервная копия PostgreSQL (custom format для pg_restore).
#
# Запуск на VPS из /opt/birzha:
#   bash deploy/backup-database.sh
#
# Переменные:
#   BIRZHA_ROOT                   — корень клона (по умолчанию /opt/birzha)
#   BIRZHA_BACKUP_DIR             — каталог дампов (по умолчанию $ROOT/backups)
#   BIRZHA_BACKUP_KEEP_DAYS       — хранить birzha-daily-* (по умолчанию 7)
#   BIRZHA_BACKUP_KEEP_WEEKLY_DAYS — хранить birzha-weekly-* (по умолчанию 28)
#   BIRZHA_BACKUP_KEEP_BEFORE_DAYS — хранить birzha-before-* / before-clean-* (по умолчанию 14)
#   BIRZHA_BACKUP_TAG             — метка в имени файла (по умолчанию daily)
#   BIRZHA_BACKUP_RCLONE_REMOTE   — rclone remote:path (напр. birzha-s3:birzha-backups);
#                                   если не задан — offsite пропускается с логом SKIP
#   BIRZHA_BACKUP_HEALTHCHECK_URL — URL ping после успешного dump(+upload), опционально
#   BIRZHA_BACKUP_ENV_FILE        — доп. env (по умолчанию /etc/birzha/backup.env, если есть)
#
# Offsite: после успешного pg_dump копирует свежий файл (и weekly при наличии) через rclone.
# Если remote задан, а rclone/upload падает — exit ≠ 0 (cron увидит сбой в backup.log).

set -euo pipefail

ROOT="${BIRZHA_ROOT:-/opt/birzha}"
BACKUP_DIR="${BIRZHA_BACKUP_DIR:-$ROOT/backups}"
KEEP_DAYS="${BIRZHA_BACKUP_KEEP_DAYS:-7}"
KEEP_WEEKLY_DAYS="${BIRZHA_BACKUP_KEEP_WEEKLY_DAYS:-28}"
KEEP_BEFORE_DAYS="${BIRZHA_BACKUP_KEEP_BEFORE_DAYS:-14}"
TAG="${BIRZHA_BACKUP_TAG:-daily}"
BACKUP_ENV_FILE="${BIRZHA_BACKUP_ENV_FILE:-/etc/birzha/backup.env}"

cd "$ROOT"

if [[ -f "$BACKUP_ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$BACKUP_ENV_FILE"
  set +a
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

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "Ошибка: pg_dump не найден" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
TS="$(date -u +%F-%H%M%S)"
OUT="$BACKUP_DIR/birzha-${TAG}-${TS}.dump"
WEEKLY_OUT=""

echo ">>> pg_dump → $OUT"
pg_dump "$DATABASE_URL" --format=custom --file "$OUT"

SIZE="$(du -h "$OUT" | awk '{print $1}')"
echo ">>> готово: $OUT ($SIZE)"

# В воскресенье UTC при TAG=daily — дополнительная недельная копия.
if [[ "$TAG" == "daily" ]] && [[ "$(date -u +%u)" == "7" ]]; then
  WEEKLY_OUT="$BACKUP_DIR/birzha-weekly-${TS}.dump"
  cp -a "$OUT" "$WEEKLY_OUT"
  echo ">>> weekly: $WEEKLY_OUT"
fi

upload_one() {
  local file="$1"
  local remote="$2"
  echo ">>> rclone copy $(basename "$file") → $remote"
  rclone copy "$file" "$remote" --s3-no-check-bucket
}

prune_remote_prefix() {
  local remote="$1"
  local prefix="$2"
  local min_age_days="$3"
  if [[ ! "$min_age_days" =~ ^[0-9]+$ ]] || [[ "$min_age_days" -le 0 ]]; then
    return 0
  fi
  echo ">>> rclone delete ${prefix}* older than ${min_age_days}d on $remote"
  rclone delete "$remote" --include "${prefix}*" --min-age "${min_age_days}d" || true
}

# Offsite: обязателен, если remote задан.
if [[ -n "${BIRZHA_BACKUP_RCLONE_REMOTE:-}" ]]; then
  if ! command -v rclone >/dev/null 2>&1; then
    echo "Ошибка: BIRZHA_BACKUP_RCLONE_REMOTE задан, но rclone не найден" >&2
    exit 1
  fi
  upload_one "$OUT" "$BIRZHA_BACKUP_RCLONE_REMOTE"
  if [[ -n "$WEEKLY_OUT" ]]; then
    upload_one "$WEEKLY_OUT" "$BIRZHA_BACKUP_RCLONE_REMOTE"
  fi
  prune_remote_prefix "$BIRZHA_BACKUP_RCLONE_REMOTE" "birzha-daily-" "$KEEP_DAYS"
  prune_remote_prefix "$BIRZHA_BACKUP_RCLONE_REMOTE" "birzha-weekly-" "$KEEP_WEEKLY_DAYS"
  echo ">>> offsite: OK"
else
  echo ">>> SKIP offsite: not configured (BIRZHA_BACKUP_RCLONE_REMOTE)"
fi

# Локальный retention.
if [[ "$KEEP_DAYS" =~ ^[0-9]+$ ]] && [[ "$KEEP_DAYS" -gt 0 ]]; then
  find "$BACKUP_DIR" -maxdepth 1 -type f -name "birzha-daily-*.dump" -mtime +"$KEEP_DAYS" -print -delete 2>/dev/null || true
fi
if [[ "$KEEP_WEEKLY_DAYS" =~ ^[0-9]+$ ]] && [[ "$KEEP_WEEKLY_DAYS" -gt 0 ]]; then
  find "$BACKUP_DIR" -maxdepth 1 -type f -name "birzha-weekly-*.dump" -mtime +"$KEEP_WEEKLY_DAYS" -print -delete 2>/dev/null || true
fi
if [[ "$KEEP_BEFORE_DAYS" =~ ^[0-9]+$ ]] && [[ "$KEEP_BEFORE_DAYS" -gt 0 ]]; then
  find "$BACKUP_DIR" -maxdepth 1 -type f \( -name "birzha-before-*.dump" -o -name "birzha-before-clean-*.dump" \) \
    -mtime +"$KEEP_BEFORE_DAYS" -print -delete 2>/dev/null || true
fi

# Ping успеха (Healthchecks.io / аналог) — только после dump и успешного offsite (или SKIP).
if [[ -n "${BIRZHA_BACKUP_HEALTHCHECK_URL:-}" ]]; then
  echo ">>> healthcheck ping"
  curl -fsS -m 20 "$BIRZHA_BACKUP_HEALTHCHECK_URL" >/dev/null
  echo ">>> healthcheck: OK"
fi

echo ">>> backup-database: OK"
