#!/usr/bin/env bash

set -Eeuo pipefail

# Validate Raspberry Pi backup environment before running scheduled jobs.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
ENV_FILE="${REPO_ROOT}/scripts/backup/backup.env"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "ERROR: ${ENV_FILE} not found."
  exit 1
fi

set -a
# shellcheck source=/dev/null
source "${ENV_FILE}"
set +a

PROD_DB_URL="${PROD_DB_URL:-}"
BACKUP_DIR="${BACKUP_DIR:-/srv/backups/supabase}"
PG_CLIENT_MODE="${PG_CLIENT_MODE:-auto}"
PG_DOCKER_IMAGE="${PG_DOCKER_IMAGE:-postgres:17-alpine}"

log() {
  printf "%s %s\n" "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$1"
}

if [[ -z "${PROD_DB_URL}" ]]; then
  echo "ERROR: PROD_DB_URL is not set in backup.env."
  exit 1
fi

if [[ "${PROD_DB_URL}" == *"[YOUR-PASSWORD]"* ]]; then
  echo "ERROR: PROD_DB_URL still contains [YOUR-PASSWORD] placeholder."
  exit 1
fi

if [[ "${PROD_DB_URL}" != postgresql://* ]]; then
  echo "ERROR: PROD_DB_URL must start with postgresql://"
  exit 1
fi

mkdir -p "${BACKUP_DIR}"
if [[ ! -w "${BACKUP_DIR}" ]]; then
  echo "ERROR: BACKUP_DIR is not writable: ${BACKUP_DIR}"
  exit 1
fi

HAS_LOCAL_CLIENTS=true
for command_name in pg_dump pg_dumpall psql pg_restore; do
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
      echo "ERROR: PG_CLIENT_MODE=local but postgres client commands are unavailable."
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
    if [[ "${HAS_LOCAL_CLIENTS}" != true ]] && [[ "${HAS_DOCKER}" != true ]]; then
      echo "ERROR: Neither local postgres clients nor docker is available."
      exit 1
    fi
    ;;
  *)
    echo "ERROR: PG_CLIENT_MODE must be one of auto/local/docker."
    exit 1
    ;;
esac

log "Preflight summary"
log "- BACKUP_DIR: ${BACKUP_DIR}"
log "- PG_CLIENT_MODE: ${PG_CLIENT_MODE}"
if [[ "${HAS_LOCAL_CLIENTS}" == true ]]; then
  log "- Local postgres clients: available"
else
  log "- Local postgres clients: unavailable"
fi
if [[ "${HAS_DOCKER}" == true ]]; then
  log "- Docker: available (${PG_DOCKER_IMAGE})"
else
  log "- Docker: unavailable"
fi

log "Checking DB connectivity with pg_dump (schema-only, output discarded)"
if [[ "${PG_CLIENT_MODE}" == "docker" ]] || ([[ "${PG_CLIENT_MODE}" == "auto" ]] && [[ "${HAS_LOCAL_CLIENTS}" != true ]] && [[ "${HAS_DOCKER}" == true ]]); then
  docker run --rm -i "${PG_DOCKER_IMAGE}" pg_dump --dbname="${PROD_DB_URL}" --schema-only >/dev/null
else
  pg_dump --dbname="${PROD_DB_URL}" --schema-only >/dev/null
fi

log "Preflight succeeded."
