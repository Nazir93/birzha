#!/usr/bin/env bash
# Быстрая диагностика на VPS: API, nginx, доступность /health и /api/meta.
# Запуск: bash deploy/check-server.sh
# Переменные: BIRZHA_HEALTH_URL (по умолчанию http://127.0.0.1:3000/health)
#             BIRZHA_PUBLIC_HOST (по умолчанию 24birzha.ru) — для проверки через nginx

set -euo pipefail

SERVICE="${BIRZHA_SYSTEMD_SERVICE:-birzha-api}"
HEALTH_URL="${BIRZHA_HEALTH_URL:-http://127.0.0.1:3000/health}"
PUBLIC_HOST="${BIRZHA_PUBLIC_HOST:-24birzha.ru}"

echo "=== systemctl $SERVICE ==="
systemctl is-active "$SERVICE" 2>&1 || true
systemctl status "$SERVICE" --no-pager -l 2>&1 | head -20 || true

echo ""
echo "=== journalctl $SERVICE (последние 40 строк) ==="
journalctl -u "$SERVICE" -n 40 --no-pager 2>&1 || true

echo ""
echo "=== curl API напрямую: $HEALTH_URL ==="
if curl -fsS "$HEALTH_URL"; then
  echo ""
  echo "OK"
else
  echo ""
  echo "FAIL (API не отвечает на $HEALTH_URL)"
fi

echo ""
echo "=== curl GET /api/meta через nginx (Host: $PUBLIC_HOST) ==="
if curl -fsS -H "Host: $PUBLIC_HOST" "http://127.0.0.1/api/meta" | head -c 400; then
  echo ""
  echo "OK"
else
  echo ""
  echo "FAIL (nginx не проксирует /api/ — проверьте sites-enabled и systemctl nginx)"
fi

echo ""
echo "=== nginx ==="
nginx -t 2>&1 || true
systemctl is-active nginx 2>&1 || true
