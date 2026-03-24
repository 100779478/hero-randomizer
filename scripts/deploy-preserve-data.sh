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
REMOTE_NAME="${REMOTE_NAME:-origin}"
CURRENT_BRANCH="$(git -C "${APP_DIR}" rev-parse --abbrev-ref HEAD 2>/dev/null || echo HEAD)"
if [ "${CURRENT_BRANCH}" = "HEAD" ]; then
  CURRENT_BRANCH="dev"
fi
DEPLOY_BRANCH="${DEPLOY_BRANCH:-${CURRENT_BRANCH}}"
SERVICE_NAME="${SERVICE_NAME:-hero-randomizer}"
DATA_DIR="${DATA_DIR:-${APP_DIR}/apps/server/data}"
PERSIST_ROOT="${PERSIST_ROOT:-/opt/hero-randomizer-data}"
BACKUP_ROOT="${BACKUP_ROOT:-${PERSIST_ROOT}/backups}"
WORKING_COPY_DIR="${WORKING_COPY_DIR:-${PERSIST_ROOT}/working-data}"
UPDATE_SCRIPT="${UPDATE_SCRIPT:-${APP_DIR}/scripts/update-production.sh}"

[ -d "${APP_DIR}" ] || fail "APP_DIR does not exist: ${APP_DIR}"
[ -d "${APP_DIR}/.git" ] || fail "Git repository not found: ${APP_DIR}"
[ -f "${UPDATE_SCRIPT}" ] || fail "Update script not found: ${UPDATE_SCRIPT}"
[ -d "${DATA_DIR}" ] || fail "Data directory not found: ${DATA_DIR}"

for cmd in git cp rm mkdir bash systemctl; do
  command -v "${cmd}" >/dev/null 2>&1 || fail "Required command not found: ${cmd}"
done

if ! systemctl cat "${SERVICE_NAME}" >/dev/null 2>&1; then
  fail "systemd service not found: ${SERVICE_NAME}"
fi

TIMESTAMP="$(date '+%Y%m%d-%H%M%S')"
BACKUP_DIR="${BACKUP_ROOT}/${TIMESTAMP}"

log "Using branch ${REMOTE_NAME}/${DEPLOY_BRANCH}"
log "Stopping service ${SERVICE_NAME}"
systemctl stop "${SERVICE_NAME}" || true
systemctl reset-failed "${SERVICE_NAME}" || true

log "Backing up current database to ${BACKUP_DIR}/data"
mkdir -p "${BACKUP_DIR}"
cp -a "${DATA_DIR}" "${BACKUP_DIR}/data"

log "Creating working database copy at ${WORKING_COPY_DIR}"
rm -rf "${WORKING_COPY_DIR}"
mkdir -p "$(dirname "${WORKING_COPY_DIR}")"
cp -a "${DATA_DIR}" "${WORKING_COPY_DIR}"

log "Fetching latest code"
git -C "${APP_DIR}" fetch "${REMOTE_NAME}" --prune

log "Resetting code to ${REMOTE_NAME}/${DEPLOY_BRANCH}"
git -C "${APP_DIR}" reset --hard "${REMOTE_NAME}/${DEPLOY_BRANCH}"

log "Restoring preserved database into repository"
rm -rf "${DATA_DIR}"
cp -a "${WORKING_COPY_DIR}" "${DATA_DIR}"

log "Running application update script without pulling code again"
SKIP_PULL=1 SKIP_BACKUP=1 bash "${UPDATE_SCRIPT}"

log "Deployment finished successfully"
log "Database backup saved at ${BACKUP_DIR}/data"
