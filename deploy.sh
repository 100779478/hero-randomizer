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
APP_DIR="${APP_DIR:-${SCRIPT_DIR}}"
BRANCH="${BRANCH:-}"
REMOTE_NAME="${REMOTE_NAME:-origin}"
ENV_FILE="${ENV_FILE:-/etc/hero-randomizer.env}"
PM2_APP_NAME="${PM2_APP_NAME:-hero-randomizer}"
PM2_START_FILE="${PM2_START_FILE:-apps/server/src/index.js}"
DATA_DIR="${DATA_DIR:-${APP_DIR}/apps/server/data}"
BACKUP_ROOT="${BACKUP_ROOT:-${APP_DIR}/.backups}"
STATE_DIR="${STATE_DIR:-${APP_DIR}/.deploy-state}"
HEALTH_PATH="${HEALTH_PATH:-/health}"
SKIP_PULL="${SKIP_PULL:-0}"
SKIP_BACKUP="${SKIP_BACKUP:-0}"
FORCE_INSTALL="${FORCE_INSTALL:-0}"

MANIFEST_FILES=(
  "package-lock.json"
  "package.json"
  "apps/server/package.json"
  "apps/web/package.json"
  "packages/deep-equal/package.json"
)

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "$1 is not installed"
}

load_env_file() {
  if [ -f "${ENV_FILE}" ]; then
    log "Loading environment from ${ENV_FILE}"
    set -a
    # shellcheck disable=SC1090
    . "${ENV_FILE}"
    set +a
  else
    log "Environment file not found, skipping: ${ENV_FILE}"
  fi
}

dependency_fingerprint() {
  local existing_files=()
  local file
  for file in "${MANIFEST_FILES[@]}"; do
    if [ -f "${APP_DIR}/${file}" ]; then
      existing_files+=("${APP_DIR}/${file}")
    fi
  done
  [ "${#existing_files[@]}" -gt 0 ] || return 1
  sha256sum "${existing_files[@]}" | sha256sum | awk '{print $1}'
}

pm2_process_exists() {
  pm2 describe "${PM2_APP_NAME}" >/dev/null 2>&1
}

stop_pm2_process() {
  if pm2_process_exists; then
    log "Stopping pm2 app ${PM2_APP_NAME}"
    pm2 stop "${PM2_APP_NAME}" >/dev/null
  else
    log "pm2 app ${PM2_APP_NAME} does not exist yet; skipping stop"
  fi
}

start_pm2_process() {
  local target_file="${APP_DIR}/${PM2_START_FILE}"
  [ -f "${target_file}" ] || fail "PM2 start file not found: ${target_file}"

  if pm2_process_exists; then
    log "Restarting pm2 app ${PM2_APP_NAME}"
    pm2 restart "${PM2_APP_NAME}" --update-env >/dev/null
  else
    log "Starting pm2 app ${PM2_APP_NAME}"
    pm2 start "${target_file}" --name "${PM2_APP_NAME}" --cwd "${APP_DIR}" >/dev/null
  fi
}

backup_data_dir() {
  if [ "${SKIP_BACKUP}" = "1" ]; then
    log "Skipping database backup"
    return
  fi

  if [ ! -d "${DATA_DIR}" ]; then
    log "Data directory not found, skipping backup: ${DATA_DIR}"
    return
  fi

  local backup_dir="${BACKUP_ROOT}/$(date '+%Y%m%d-%H%M%S')"
  mkdir -p "${backup_dir}"
  cp -a "${DATA_DIR}" "${backup_dir}/data"
  log "Database backup saved to ${backup_dir}/data"
}

stash_database_files() {
  DB_STASH_DIR=""
  if [ ! -d "${DATA_DIR}" ]; then
    return
  fi

  DB_STASH_DIR="$(mktemp -d)"
  cp -a "${DATA_DIR}"/*.db "${DATA_DIR}"/*.db-shm "${DATA_DIR}"/*.db-wal "${DB_STASH_DIR}/" 2>/dev/null || true
}

restore_database_files() {
  if [ -n "${DB_STASH_DIR:-}" ] && [ -d "${DB_STASH_DIR}" ] && [ -d "${DATA_DIR}" ]; then
    cp -a "${DB_STASH_DIR}"/*.db "${DB_STASH_DIR}"/*.db-shm "${DB_STASH_DIR}"/*.db-wal "${DATA_DIR}/" 2>/dev/null || true
    rm -rf "${DB_STASH_DIR}"
    DB_STASH_DIR=""
    log "Database files restored (server data preserved)"
  fi
}

pull_latest_code() {
  if [ "${SKIP_PULL}" = "1" ]; then
    log "Skipping git pull"
    return
  fi

  [ -d "${APP_DIR}/.git" ] || fail "Git repository not found: ${APP_DIR}"

  log "Pulling latest code"
  stash_database_files

  git -C "${APP_DIR}" fetch "${REMOTE_NAME}" --prune

  local target_branch="${BRANCH}"
  if [ -z "${target_branch}" ]; then
    target_branch="$(git -C "${APP_DIR}" rev-parse --abbrev-ref HEAD)"
  fi
  [ -n "${target_branch}" ] || fail "Unable to determine current branch"

  git -C "${APP_DIR}" pull --ff-only "${REMOTE_NAME}" "${target_branch}"
  restore_database_files
}

install_dependencies_if_needed() {
  mkdir -p "${STATE_DIR}"

  local fingerprint_file="${STATE_DIR}/dependencies.sha256"
  local current_fingerprint
  local previous_fingerprint=""

  current_fingerprint="$(dependency_fingerprint || true)"
  if [ -f "${fingerprint_file}" ]; then
    previous_fingerprint="$(cat "${fingerprint_file}")"
  fi

  if [ "${FORCE_INSTALL}" = "1" ] || [ -z "${current_fingerprint}" ] || [ "${current_fingerprint}" != "${previous_fingerprint}" ]; then
    log "Installing dependencies"
    npm --prefix "${APP_DIR}" ci
    if [ -n "${current_fingerprint}" ]; then
      printf '%s\n' "${current_fingerprint}" > "${fingerprint_file}"
    fi
  else
    log "Dependency manifests unchanged; skipping npm ci"
  fi
}

wait_for_healthcheck() {
  local app_port="${APP_PORT:-${PORT:-9000}}"
  local health_url="${HEALTH_URL:-http://127.0.0.1:${app_port}${HEALTH_PATH}}"

  log "Waiting for health check: ${health_url}"
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    if curl --fail --silent --show-error --max-time 10 "${health_url}" >/dev/null; then
      log "Deploy finished successfully"
      return
    fi
    sleep 2
  done

  pm2 logs "${PM2_APP_NAME}" --lines 80 --nostream || true
  fail "Health check failed: ${health_url}"
}

main() {
  [ -d "${APP_DIR}" ] || fail "APP_DIR does not exist: ${APP_DIR}"

  require_command git
  require_command npm
  require_command pm2
  require_command curl
  require_command sha256sum

  cd "${APP_DIR}"
  load_env_file
  stop_pm2_process
  backup_data_dir
  pull_latest_code
  install_dependencies_if_needed
  start_pm2_process
  wait_for_healthcheck
}

main "$@"
