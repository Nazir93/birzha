#!/usr/bin/env bash
# Полное обновление на сервере из корня клона: git pull → install → build → pg_dump → схема БД → API → healthcheck.
# Схема БД: по умолчанию db:push; для журнала SQL (`drizzle/*.sql`) — BIRZHA_DB_APPLY=migrate (см. server-update.sh).
# Запуск: из каталога репозитория на VPS, например:
#   bash deploy/obnovit-server.sh
# или:
#   chmod +x deploy/obnovit-server.sh && ./deploy/obnovit-server.sh
#
# Нужны: git, pnpm, Node, pg_dump, curl; права sudo на systemctl restart birzha-api.
# Переменные как у server-update.sh (BIRZHA_ROOT, SKIP_DB, RELOAD_NGINX и т.д.).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
export BIRZHA_ROOT="${BIRZHA_ROOT:-$ROOT}"
export BIRZHA_AUTO_BACKUP=1

exec bash "$SCRIPT_DIR/server-update.sh"
