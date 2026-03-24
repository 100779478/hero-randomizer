#!/usr/bin/env bash

set -Eeuo pipefail

log() {
  printf '[%s] %s\n' "$(date '+%F %T')" "$*"
}

fail() {
  log "ERROR: $*"
  exit 1
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${APP_DIR:-$(cd "${SCRIPT_DIR}/.." && pwd)}"
SERVICE_NAME="${SERVICE_NAME:-hero-randomizer}"
ENV_FILE="${ENV_FILE:-/etc/hero-randomizer.env}"
DATA_DIR="${DATA_DIR:-${APP_DIR}/apps/server/data}"
BACKUP_ROOT="${BACKUP_ROOT:-${APP_DIR}/.backups}"
HEALTH_PATH="${HEALTH_PATH:-/health}"
SKIP_PULL="${SKIP_PULL:-0}"
SKIP_BACKUP="${SKIP_BACKUP:-0}"

[ -d "${APP_DIR}" ] || fail "APP_DIR does not exist: ${APP_DIR}"

cd "${APP_DIR}"

if ! command -v npm >/dev/null 2>&1; then
  fail "npm is not installed"
fi

if ! command -v curl >/dev/null 2>&1; then
  fail "curl is not installed"
fi

if ! systemctl cat "${SERVICE_NAME}" >/dev/null 2>&1; then
  fail "systemd service not found: ${SERVICE_NAME}"
fi

if [ -f "${ENV_FILE}" ]; then
  log "Loading environment from ${ENV_FILE}"
  set -a
  # shellcheck disable=SC1090
  . "${ENV_FILE}"
  set +a
fi

APP_PORT="${APP_PORT:-${PORT:-3000}}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:${APP_PORT}${HEALTH_PATH}}"

if [ -d "${APP_DIR}/.git" ] && [ "${SKIP_PULL}" != "1" ]; then
  log "Pulling latest code"
  git fetch --all --prune
  git pull --ff-only
else
  log "Skipping git pull"
fi

log "Installing dependencies"
npm ci

if systemctl is-active --quiet "${SERVICE_NAME}"; then
  log "Stopping service ${SERVICE_NAME}"
  systemctl stop "${SERVICE_NAME}"
else
  log "Service ${SERVICE_NAME} is not running; skipping stop"
fi

if [ "${SKIP_BACKUP}" != "1" ] && [ -d "${DATA_DIR}" ]; then
  BACKUP_DIR="${BACKUP_ROOT}/$(date '+%Y%m%d-%H%M%S')"
  mkdir -p "${BACKUP_DIR}"
  cp -a "${DATA_DIR}" "${BACKUP_DIR}/data"
  log "Database backup saved to ${BACKUP_DIR}/data"
else
  log "Skipping database backup"
fi

log "Starting service ${SERVICE_NAME}"
systemctl restart "${SERVICE_NAME}"

log "Waiting for health check: ${HEALTH_URL}"
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if curl --fail --silent --show-error --max-time 10 "${HEALTH_URL}" >/dev/null; then
    log "Update finished successfully"
    exit 0
  fi
  sleep 2
done

fail "Health check failed: ${HEALTH_URL}"
