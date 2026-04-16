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

SERVICE_NAME="${SERVICE_NAME:-hero-randomizer}"

if ! run_systemctl cat "${SERVICE_NAME}" >/dev/null 2>&1; then
  fail "systemd service not found: ${SERVICE_NAME}"
fi

if run_systemctl is-active --quiet "${SERVICE_NAME}"; then
  log "Stopping service ${SERVICE_NAME}"
  run_systemctl stop "${SERVICE_NAME}"
else
  log "Service ${SERVICE_NAME} is not running"
fi

log "Current service status:"
run_systemctl status "${SERVICE_NAME}" --no-pager -l || true
