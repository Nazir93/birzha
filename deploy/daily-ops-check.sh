#!/usr/bin/env bash

# Ежедневная быстрая проверка состояния production.
# Запуск на сервере:
#   bash deploy/daily-ops-check.sh
#
# Переменные:
#   BIRZHA_HEALTH_URL (по умолчанию http://127.0.0.1:3000/health)
#   BIRZHA_ROOT / BIRZHA_BACKUP_DIR — каталог дампов
#   BIRZHA_BACKUP_MAX_AGE_HOURS — макс. возраст birzha-daily-*.dump (по умолчанию 36)
#   BIRZHA_BACKUP_ENV_FILE — /etc/birzha/backup.env

set -euo pipefail

ROOT="${BIRZHA_ROOT:-/opt/birzha}"
BACKUP_DIR="${BIRZHA_BACKUP_DIR:-$ROOT/backups}"
BACKUP_ENV_FILE="${BIRZHA_BACKUP_ENV_FILE:-/etc/birzha/backup.env}"
HEALTH_URL="${BIRZHA_HEALTH_URL:-http://127.0.0.1:3000/health}"
MAX_AGE_HOURS="${BIRZHA_BACKUP_MAX_AGE_HOURS:-36}"

if [[ -f "$BACKUP_ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$BACKUP_ENV_FILE"
  set +a
fi
if [[ -f "$ROOT/apps/api/.env" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ROOT/apps/api/.env"
  set +a
fi

FAIL=0

echo "=== services ==="
systemctl is-active birzha-api nginx fail2ban

echo
echo "=== health ==="
curl -fsS "$HEALTH_URL"
echo

echo
echo "=== fail2ban summary ==="
fail2ban-client status
echo
fail2ban-client status sshd
echo
if fail2ban-client status nginx-birzha-auth-limit >/dev/null 2>&1; then
  fail2ban-client status nginx-birzha-auth-limit
else
  echo "WARN: jail nginx-birzha-auth-limit отсутствует (не блокирует проверку бэкапов)"
fi

echo
echo "=== disk ==="
df -h /

echo
echo "=== backups (freshness) ==="
if [[ ! -d "$BACKUP_DIR" ]]; then
  echo "ERROR: нет каталога $BACKUP_DIR" >&2
  FAIL=1
else
  # shellcheck disable=SC2012
  LATEST="$(ls -1t "$BACKUP_DIR"/birzha-daily-*.dump 2>/dev/null | head -n1 || true)"
  if [[ -z "$LATEST" ]]; then
    echo "ERROR: нет файлов birzha-daily-*.dump в $BACKUP_DIR" >&2
    FAIL=1
  else
    NOW_EPOCH="$(date -u +%s)"
    if stat -c %Y "$LATEST" >/dev/null 2>&1; then
      FILE_EPOCH="$(stat -c %Y "$LATEST")"
    else
      FILE_EPOCH="$(stat -f %m "$LATEST")"
    fi
    AGE_SEC=$((NOW_EPOCH - FILE_EPOCH))
    AGE_HOURS=$((AGE_SEC / 3600))
    echo "latest: $LATEST (age ${AGE_HOURS}h)"
    if [[ "$AGE_HOURS" -gt "$MAX_AGE_HOURS" ]]; then
      echo "ERROR: daily dump старше ${MAX_AGE_HOURS}ч" >&2
      FAIL=1
    else
      echo "freshness: OK (<= ${MAX_AGE_HOURS}h)"
    fi
  fi
fi

if [[ -n "${BIRZHA_BACKUP_RCLONE_REMOTE:-}" ]]; then
  echo "offsite remote: $BIRZHA_BACKUP_RCLONE_REMOTE"
  if ! command -v rclone >/dev/null 2>&1; then
    echo "WARN: offsite задан, но rclone не установлен" >&2
  elif [[ -z "${LATEST:-}" ]]; then
    echo "WARN: offsite задан, но локального daily dump нет" >&2
  else
    echo "offsite: configured (локальный dump свежий — см. выше; объект в S3 проверяйте rclone ls)"
  fi
else
  echo "offsite: not configured (BIRZHA_BACKUP_RCLONE_REMOTE) — дампы только на диске VPS"
fi

echo
if [[ "$FAIL" -ne 0 ]]; then
  echo "daily-ops-check: FAIL" >&2
  exit 1
fi
echo "=== done ==="
echo "daily-ops-check: OK"
