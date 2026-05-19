#!/usr/bin/env bash

set -Eeuo pipefail

log() {
  printf '[%s] %s\n' "$(date '+%F %T')" "$*"
}

fail() {
  log "ERROR: $*"
  exit 1
}

show_service_diagnostics() {
  log "Service status for ${SERVICE_NAME}:"
  systemctl status "${SERVICE_NAME}" --no-pager -l || true
  log "Recent logs for ${SERVICE_NAME}:"
  journalctl -u "${SERVICE_NAME}" -n 80 --no-pager || true
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${APP_DIR:-$(cd "${SCRIPT_DIR}/.." && pwd)}"
SERVICE_NAME="${SERVICE_NAME:-hero-randomizer}"
ENV_FILE="${ENV_FILE:-/etc/hero-randomizer.env}"
DATA_DIR="${DATA_DIR:-${APP_DIR}/apps/server/data}"
BACKUP_ROOT="${BACKUP_ROOT:-${APP_DIR}/.backups}"
STATE_DIR="${STATE_DIR:-${APP_DIR}/.deploy-state}"
HEALTH_PATH="${HEALTH_PATH:-/health}"
SKIP_PULL="${SKIP_PULL:-0}"
SKIP_BACKUP="${SKIP_BACKUP:-0}"
FORCE_INSTALL="${FORCE_INSTALL:-0}"

[ -d "${APP_DIR}" ] || fail "APP_DIR does not exist: ${APP_DIR}"

cd "${APP_DIR}"

if ! command -v npm >/dev/null 2>&1; then
  fail "npm is not installed"
fi

if ! command -v curl >/dev/null 2>&1; then
  fail "curl is not installed"
fi

if ! command -v sha256sum >/dev/null 2>&1; then
  fail "sha256sum is not installed"
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

MANIFEST_FILES=(
  "package-lock.json"
  "package.json"
  "apps/server/package.json"
  "apps/web/package.json"
  "packages/deep-equal/package.json"
)

dependency_fingerprint() {
  local existing_files=()
  local file
  for file in "${MANIFEST_FILES[@]}"; do
    if [ -f "${file}" ]; then
      existing_files+=("${file}")
    fi
  done
  [ "${#existing_files[@]}" -gt 0 ] || return 1
  sha256sum "${existing_files[@]}" | sha256sum | awk '{print $1}'
}

if [ -d "${APP_DIR}/.git" ] && [ "${SKIP_PULL}" != "1" ]; then
  log "Pulling latest code"

  # 暂存数据库文件，确保 pull 不会覆盖服务器数据
  DB_STASH_DIR=""
  if [ -d "${DATA_DIR}" ]; then
    DB_STASH_DIR="$(mktemp -d)"
    cp -a "${DATA_DIR}"/*.db "${DATA_DIR}"/*.db-shm "${DATA_DIR}"/*.db-wal "${DB_STASH_DIR}/" 2>/dev/null || true
  fi

  git fetch --all --prune

  # 丢弃可能被追踪的数据库运行时文件的本地变更
  git checkout -- "${DATA_DIR}/app.db-shm" "${DATA_DIR}/app.db-wal" 2>/dev/null || true

  git pull --ff-only

  # 恢复数据库文件，以服务器为准
  if [ -n "${DB_STASH_DIR}" ] && [ -d "${DB_STASH_DIR}" ]; then
    cp -a "${DB_STASH_DIR}"/*.db "${DB_STASH_DIR}"/*.db-shm "${DB_STASH_DIR}"/*.db-wal "${DATA_DIR}/" 2>/dev/null || true
    rm -rf "${DB_STASH_DIR}"
    log "Database files restored (server data preserved)"
  fi
else
  log "Skipping git pull"
fi

mkdir -p "${STATE_DIR}"
FINGERPRINT_FILE="${STATE_DIR}/dependencies.sha256"
CURRENT_FINGERPRINT="$(dependency_fingerprint || true)"
PREVIOUS_FINGERPRINT=""
if [ -f "${FINGERPRINT_FILE}" ]; then
  PREVIOUS_FINGERPRINT="$(cat "${FINGERPRINT_FILE}")"
fi

if [ "${FORCE_INSTALL}" = "1" ] || [ -z "${CURRENT_FINGERPRINT}" ] || [ "${CURRENT_FINGERPRINT}" != "${PREVIOUS_FINGERPRINT}" ]; then
  log "Installing dependencies"
  npm ci
  if [ -n "${CURRENT_FINGERPRINT}" ]; then
    printf '%s\n' "${CURRENT_FINGERPRINT}" > "${FINGERPRINT_FILE}"
  fi
else
  log "Dependency manifests unchanged; skipping npm ci"
fi

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
  if ! systemctl is-active --quiet "${SERVICE_NAME}"; then
    show_service_diagnostics
    fail "Service is not active after restart"
  fi
  if curl --fail --silent --show-error --max-time 10 "${HEALTH_URL}" >/dev/null; then
    log "Update finished successfully"
    exit 0
  fi
  sleep 2
done

show_service_diagnostics
fail "Health check failed: ${HEALTH_URL}"
