#!/usr/bin/env bash

set -Eeuo pipefail

# Restore local Supabase database using schema.sql + data.dump only.
# globals.sql is intentionally NOT applied.
#
# Required:
#   BACKUP_RUN_DIR     Directory that contains schema.sql and data.dump
# Optional:
#   LOCAL_DB_URL       Local DB URL (default: postgresql://postgres:postgres@127.0.0.1:54322/postgres)
#   PG_CLIENT_MODE     auto | local | docker (default: auto)
#   PG_DOCKER_IMAGE    Docker image for psql/pg_restore in docker mode (default: postgres:17-alpine)
#
# Example:
#   export BACKUP_RUN_DIR="/srv/backups/supabase/20260418-125119"
#   ./scripts/backup/supabase_restore_local.sh

BACKUP_RUN_DIR="${BACKUP_RUN_DIR:-}"
LOCAL_DB_URL="${LOCAL_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
PG_CLIENT_MODE="${PG_CLIENT_MODE:-auto}"
PG_DOCKER_IMAGE="${PG_DOCKER_IMAGE:-postgres:17-alpine}"

if [[ -z "${BACKUP_RUN_DIR}" ]]; then
  echo "ERROR: BACKUP_RUN_DIR is not set."
  exit 1
fi

SCHEMA_FILE="${BACKUP_RUN_DIR}/schema.sql"
DATA_FILE="${BACKUP_RUN_DIR}/data.dump"
LOG_FILE="${BACKUP_RUN_DIR}/restore-local.log"

for required_file in "${SCHEMA_FILE}" "${DATA_FILE}"; do
  if [[ ! -f "${required_file}" ]]; then
    echo "ERROR: required file not found: ${required_file}"
    exit 1
  fi
done

HAS_LOCAL_CLIENTS=true
for command_name in psql pg_restore; do
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    HAS_LOCAL_CLIENTS=false
    break
  fi
done

HAS_DOCKER=false
if command -v docker >/dev/null 2>&1; then
  HAS_DOCKER=true
fi

case "${PG_CLIENT_MODE}" in
  local)
    if [[ "${HAS_LOCAL_CLIENTS}" != true ]]; then
      echo "ERROR: PG_CLIENT_MODE=local but psql/pg_restore is unavailable."
      exit 1
    fi
    ;;
  docker)
    if [[ "${HAS_DOCKER}" != true ]]; then
      echo "ERROR: PG_CLIENT_MODE=docker but docker is unavailable."
      exit 1
    fi
    ;;
  auto)
    if [[ "${HAS_LOCAL_CLIENTS}" == true ]]; then
      PG_CLIENT_MODE="local"
    elif [[ "${HAS_DOCKER}" == true ]]; then
      PG_CLIENT_MODE="docker"
    else
      echo "ERROR: Neither local psql/pg_restore nor docker is available."
      exit 1
    fi
    ;;
  *)
    echo "ERROR: PG_CLIENT_MODE must be one of: auto, local, docker."
    exit 1
    ;;
esac

touch "${LOG_FILE}"

log() {
  printf "%s %s\n" "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$1" | tee -a "${LOG_FILE}"
}

run_psql() {
  if [[ "${PG_CLIENT_MODE}" == "local" ]]; then
    psql "$@"
  else
    docker run --rm -i --network host "${PG_DOCKER_IMAGE}" psql "$@"
  fi
}

run_pg_restore() {
  if [[ "${PG_CLIENT_MODE}" == "local" ]]; then
    pg_restore "$@"
  else
    docker run --rm -i --network host "${PG_DOCKER_IMAGE}" pg_restore "$@"
  fi
}

log "Local restore start"
log "Backup directory: ${BACKUP_RUN_DIR}"
log "Postgres client mode: ${PG_CLIENT_MODE}"
log "Target local DB: ${LOCAL_DB_URL}"
log "Note: globals.sql is intentionally skipped."

log "Apply schema.sql"
run_psql \
  --dbname="${LOCAL_DB_URL}" \
  --set=ON_ERROR_STOP=1 \
  --file="${SCHEMA_FILE}"

log "Restore data.dump (data-only)"
run_pg_restore \
  --dbname="${LOCAL_DB_URL}" \
  --data-only \
  --no-owner \
  --no-privileges \
  --exit-on-error \
  --single-transaction \
  "${DATA_FILE}"

log "Local restore completed successfully"
