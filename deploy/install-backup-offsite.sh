#!/usr/bin/env bash
# Установка rclone и проверка offsite remote для бэкапов Биржи.
#
# Запуск на VPS (обычно от root или с sudo для apt):
#   bash deploy/install-backup-offsite.sh
#
# Перед проверкой remote:
#   1. Создайте бакет в S3-совместимом хранилище (Яндекс Object Storage и т.п.)
#   2. Настройте rclone remote: rclone config
#      (тип s3, provider Other/Yandex, endpoint, access_key_id, secret_access_key)
#   3. Запишите переменные в /etc/birzha/backup.env (см. deploy/backup-offsite.env.example)
#      или в apps/api/.env
#
# Переменные:
#   BIRZHA_ROOT — корень клона (по умолчанию /opt/birzha)
#   BIRZHA_BACKUP_ENV_FILE — путь к env (по умолчанию /etc/birzha/backup.env)

set -euo pipefail

ROOT="${BIRZHA_ROOT:-/opt/birzha}"
BACKUP_ENV_FILE="${BIRZHA_BACKUP_ENV_FILE:-/etc/birzha/backup.env}"
EXAMPLE="$ROOT/deploy/backup-offsite.env.example"

echo "=== install rclone ==="
if command -v rclone >/dev/null 2>&1; then
  echo "rclone уже установлен: $(rclone version | head -n1)"
else
  if command -v apt-get >/dev/null 2>&1; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    apt-get install -y -qq rclone
  else
    echo "Ошибка: apt-get не найден — установите rclone вручную: https://rclone.org/install/" >&2
    exit 1
  fi
  echo "rclone установлен: $(rclone version | head -n1)"
fi

echo
echo "=== backup.env ==="
if [[ ! -f "$BACKUP_ENV_FILE" ]]; then
  mkdir -p "$(dirname "$BACKUP_ENV_FILE")"
  if [[ -f "$EXAMPLE" ]]; then
    cp "$EXAMPLE" "$BACKUP_ENV_FILE"
    chmod 600 "$BACKUP_ENV_FILE"
    echo "Создан $BACKUP_ENV_FILE из example — заполните BIRZHA_BACKUP_RCLONE_REMOTE"
  else
    touch "$BACKUP_ENV_FILE"
    chmod 600 "$BACKUP_ENV_FILE"
    echo "Создан пустой $BACKUP_ENV_FILE"
  fi
else
  echo "Уже есть $BACKUP_ENV_FILE"
fi

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

echo
echo "=== checklist ==="
echo "1. rclone config  → remote (напр. birzha-s3), тип S3"
echo "2. В $BACKUP_ENV_FILE:"
echo "     BIRZHA_BACKUP_RCLONE_REMOTE=birzha-s3:имя-бакета"
echo "     BIRZHA_BACKUP_HEALTHCHECK_URL=https://hc-ping.com/...   # опционально"
echo "3. Lifecycle в бакете (рекомендуется): daily 7д, weekly 28д"
echo "4. Проверка: bash deploy/backup-database.sh"

if [[ -z "${BIRZHA_BACKUP_RCLONE_REMOTE:-}" ]]; then
  echo
  echo "SKIP remote check: BIRZHA_BACKUP_RCLONE_REMOTE не задан"
  echo "OK: rclone установлен; offsite ещё не настроен"
  exit 0
fi

echo
echo "=== rclone lsd $BIRZHA_BACKUP_RCLONE_REMOTE ==="
rclone lsd "$BIRZHA_BACKUP_RCLONE_REMOTE" --s3-no-check-bucket
echo "OK: remote доступен"
