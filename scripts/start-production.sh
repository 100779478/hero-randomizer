#!/usr/bin/env bash

set -Eeuo pipefail

log() {
  printf '[%s] %s\n' "$(date '+%F %T')" "$*"
}

fail() {
  log "ERROR: $*"
  exit 1
}

run_systemctl() {
  if [ "$(id -u)" -eq 0 ]; then
    systemctl "$@"
  else
    sudo systemctl "$@"
  fi
}

run_journalctl() {
  if [ "$(id -u)" -eq 0 ]; then
    journalctl "$@"
  else
    sudo journalctl "$@"
  fi
}

show_service_diagnostics() {
  log "Service status for ${SERVICE_NAME}:"
  run_systemctl status "${SERVICE_NAME}" --no-pager -l || true
  log "Recent logs for ${SERVICE_NAME}:"
  run_journalctl -u "${SERVICE_NAME}" -n 80 --no-pager || true
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${APP_DIR:-$(cd "${SCRIPT_DIR}/.." && pwd)}"
SERVICE_NAME="${SERVICE_NAME:-hero-randomizer}"
ENV_FILE="${ENV_FILE:-/etc/hero-randomizer.env}"
HEALTH_PATH="${HEALTH_PATH:-/health}"

[ -d "${APP_DIR}" ] || fail "APP_DIR does not exist: ${APP_DIR}"

if ! command -v curl >/dev/null 2>&1; then
  fail "curl is not installed"
fi

if ! run_systemctl cat "${SERVICE_NAME}" >/dev/null 2>&1; then
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

log "Starting service ${SERVICE_NAME}"
run_systemctl start "${SERVICE_NAME}"

log "Waiting for health check: ${HEALTH_URL}"
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if ! run_systemctl is-active --quiet "${SERVICE_NAME}"; then
    show_service_diagnostics
    fail "Service is not active after start"
  fi
  if curl --fail --silent --show-error --max-time 10 "${HEALTH_URL}" >/dev/null; then
    log "Service started successfully"
    run_systemctl status "${SERVICE_NAME}" --no-pager -l || true
    exit 0
  fi
  sleep 2
done

show_service_diagnostics
fail "Health check failed: ${HEALTH_URL}"
