#!/usr/bin/env bash
# Локальная проверка health на VPS + опциональный Telegram при сбое.
# Не заменяет внешний мониторинг (GitHub Actions Uptime): если весь VPS мёртв,
# этот скрипт тоже не запустится.
#
#   bash deploy/notify-health-fail.sh
#
# Переменные (apps/api/.env или /etc/birzha/backup.env / monitor.env):
#   BIRZHA_HEALTH_URL          — по умолчанию http://127.0.0.1:3000/health
#   BIRZHA_READY_URL           — по умолчанию http://127.0.0.1:3000/health/ready
#   BIRZHA_TELEGRAM_BOT_TOKEN
#   BIRZHA_TELEGRAM_CHAT_ID
#   BIRZHA_MONITOR_ENV_FILE    — по умолчанию /etc/birzha/monitor.env

set -euo pipefail

ROOT="${BIRZHA_ROOT:-/opt/birzha}"
MONITOR_ENV="${BIRZHA_MONITOR_ENV_FILE:-/etc/birzha/monitor.env}"
BACKUP_ENV="${BIRZHA_BACKUP_ENV_FILE:-/etc/birzha/backup.env}"

for f in "$MONITOR_ENV" "$BACKUP_ENV" "$ROOT/apps/api/.env"; do
  if [[ -f "$f" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$f"
    set +a
  fi
done

HEALTH_URL="${BIRZHA_HEALTH_URL:-http://127.0.0.1:3000/health}"
READY_URL="${BIRZHA_READY_URL:-http://127.0.0.1:3000/health/ready}"

notify() {
  local msg="$1"
  echo "$msg" >&2
  if [[ -z "${BIRZHA_TELEGRAM_BOT_TOKEN:-}" || -z "${BIRZHA_TELEGRAM_CHAT_ID:-}" ]]; then
    echo "Telegram not configured — message only in log" >&2
    return 0
  fi
  curl -fsS -X POST "https://api.telegram.org/bot${BIRZHA_TELEGRAM_BOT_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${BIRZHA_TELEGRAM_CHAT_ID}" \
    --data-urlencode "text=${msg}" \
    >/dev/null || true
}

FAIL=0
if ! curl -fsS --max-time 20 "$HEALTH_URL" >/dev/null; then
  notify "Биржа: FAIL liveness $HEALTH_URL"
  FAIL=1
fi

body=""
if ! body="$(curl -fsS --max-time 20 "$READY_URL")"; then
  notify "Биржа: FAIL readiness $READY_URL"
  FAIL=1
elif ! echo "$body" | grep -q '"database":"ok"'; then
  notify "Биржа: FAIL database not ok ($READY_URL): $body"
  FAIL=1
fi

if [[ "$FAIL" -ne 0 ]]; then
  exit 1
fi
echo "notify-health-fail: OK"
