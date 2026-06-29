#!/usr/bin/env bash
# Ежедневный pg_dump в /opt/birzha/backups (03:15 UTC).
#
# Запуск один раз на VPS от пользователя deploy:
#   bash deploy/install-backup-cron.sh
#
# Переменные:
#   BIRZHA_ROOT — корень клона
#   BIRZHA_BACKUP_CRON — строка cron (по умолчанию 15 3 * * *)

set -euo pipefail

ROOT="${BIRZHA_ROOT:-/opt/birzha}"
CRON_SCHEDULE="${BIRZHA_BACKUP_CRON:-15 3 * * *}"
MARKER="# birzha-pg-backup"
JOB="$CRON_SCHEDULE cd $ROOT && bash deploy/backup-database.sh >> $ROOT/backups/backup.log 2>&1 $MARKER"

if [[ ! -f "$ROOT/deploy/backup-database.sh" ]]; then
  echo "Ошибка: нет $ROOT/deploy/backup-database.sh" >&2
  exit 1
fi

chmod +x "$ROOT/deploy/backup-database.sh"

TMP="$(mktemp)"
# Убираем старые задания (в т.ч. с CRLF после копирования с Windows)
(crontab -l 2>/dev/null | tr -d '\r' | grep -vF "$MARKER" || true) >"$TMP"
printf '%s\n' "$JOB" >>"$TMP"
crontab "$TMP"
rm -f "$TMP"

echo "OK: cron установлен для $(whoami)"
echo "    $CRON_SCHEDULE — deploy/backup-database.sh"
crontab -l | grep "$MARKER" || true
