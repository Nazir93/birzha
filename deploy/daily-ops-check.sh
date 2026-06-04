#!/usr/bin/env bash

# Ежедневная быстрая проверка состояния production.
# Запуск на сервере:
#   bash deploy/daily-ops-check.sh
#
# Переменные:
#   BIRZHA_HEALTH_URL (по умолчанию http://127.0.0.1:3000/health)

set -euo pipefail

HEALTH_URL="${BIRZHA_HEALTH_URL:-http://127.0.0.1:3000/health}"

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
fail2ban-client status nginx-birzha-auth-limit

echo
echo "=== disk ==="
df -h /

echo
echo "=== done ==="
echo "daily-ops-check: OK"
