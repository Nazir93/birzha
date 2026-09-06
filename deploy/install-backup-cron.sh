#!/usr/bin/env bash
# Ежедневный pg_dump (+ offsite через rclone, если настроен) в /opt/birzha/backups (03:15 UTC).
#
# Запуск один раз на VPS от пользователя, у которого есть доступ к БД и rclone-конфигу:
#   bash deploy/install-backup-cron.sh
#
# Offsite: см. deploy/install-backup-offsite.sh и /etc/birzha/backup.env
#
# Переменные:
#   BIRZHA_ROOT — корень клона
#   BIRZHA_BACKUP_CRON — строка cron (по умолчанию 15 3 * * *)

set -euo pipefail

ROOT="${BIRZHA_ROOT:-/opt/birzha}"
CRON_SCHEDULE="${BIRZHA_BACKUP_CRON:-15 3 * * *}"
MARKER="# birzha-pg-backup"
# PATH явно включает типичные пути rclone (/usr/bin).
JOB="$CRON_SCHEDULE cd $ROOT && PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin bash deploy/backup-database.sh >> $ROOT/backups/backup.log 2>&1 $MARKER"

if [[ ! -f "$ROOT/deploy/backup-database.sh" ]]; then
  echo "Ошибка: нет $ROOT/deploy/backup-database.sh" >&2
  exit 1
fi

chmod +x "$ROOT/deploy/backup-database.sh"
mkdir -p "$ROOT/backups"

TMP="$(mktemp)"
# Убираем старые задания (в т.ч. с CRLF после копирования с Windows)
(crontab -l 2>/dev/null | tr -d '\r' | grep -vF "$MARKER" || true) >"$TMP"
printf '%s\n' "$JOB" >>"$TMP"
crontab "$TMP"
rm -f "$TMP"

echo "OK: cron установлен для $(whoami)"
echo "    $CRON_SCHEDULE — deploy/backup-database.sh (локально + offsite при настройке)"
if command -v rclone >/dev/null 2>&1; then
  echo "    rclone: $(rclone version | head -n1)"
else
  echo "    rclone: не установлен — offsite будет SKIP, пока не запустите install-backup-offsite.sh"
fi
crontab -l | grep "$MARKER" || true
