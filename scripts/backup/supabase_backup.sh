#!/usr/bin/env bash

set -Eeuo pipefail

# Required:
#   PROD_DB_URL       PostgreSQL connection URL for production Supabase
# Optional:
#   BACKUP_DIR        Backup root directory (default: /srv/backups/supabase)
#   KEEP_GENERATIONS  Number of timestamp directories to keep (default: 10)
#   DUMP_COMPRESSION  Compression level for custom dump (0-9, default: 1)
#   PG_CLIENT_MODE    auto | local | docker (default: auto)
#   PG_DOCKER_IMAGE   Docker image when using docker mode (default: postgres:17-alpine)

PROD_DB_URL="${PROD_DB_URL:-}"
BACKUP_DIR="${BACKUP_DIR:-/srv/backups/supabase}"
KEEP_GENERATIONS="${KEEP_GENERATIONS:-10}"
DUMP_COMPRESSION="${DUMP_COMPRESSION:-1}"
PG_CLIENT_MODE="${PG_CLIENT_MODE:-auto}"
PG_DOCKER_IMAGE="${PG_DOCKER_IMAGE:-postgres:17-alpine}"
TIMESTAMP="$(date -u +"%Y%m%d-%H%M%S")"
RUN_DIR="${BACKUP_DIR}/${TIMESTAMP}"
LOG_FILE="${BACKUP_DIR}/backup.log"

if [[ -z "${PROD_DB_URL}" ]]; then
  echo "ERROR: PROD_DB_URL is not set."
  exit 1
fi

if ! [[ "${KEEP_GENERATIONS}" =~ ^[0-9]+$ ]]; then
  echo "ERROR: KEEP_GENERATIONS must be a non-negative integer."
  exit 1
fi

if ! [[ "${DUMP_COMPRESSION}" =~ ^[0-9]$ ]]; then
  echo "ERROR: DUMP_COMPRESSION must be an integer between 0 and 9."
  exit 1
fi

HAS_LOCAL_CLIENTS=true
for command_name in pg_dump pg_dumpall; do
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
      echo "ERROR: PG_CLIENT_MODE=local but pg_dump/pg_dumpall is unavailable."
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
      echo "ERROR: Neither local pg_dump nor docker is available."
      exit 1
    fi
    ;;
  *)
    echo "ERROR: PG_CLIENT_MODE must be one of: auto, local, docker."
    exit 1
    ;;
esac

mkdir -p "${RUN_DIR}"
touch "${LOG_FILE}"

log() {
  printf "%s %s\n" "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$1" | tee -a "${LOG_FILE}"
}

log "Backup start: ${TIMESTAMP}"
log "Output directory: ${RUN_DIR}"
log "Postgres client mode: ${PG_CLIENT_MODE}"

run_pg_dump() {
  if [[ "${PG_CLIENT_MODE}" == "local" ]]; then
    pg_dump "$@"
  else
    docker run --rm -i "${PG_DOCKER_IMAGE}" pg_dump "$@"
  fi
}

run_pg_dumpall() {
  if [[ "${PG_CLIENT_MODE}" == "local" ]]; then
    pg_dumpall "$@"
  else
    docker run --rm -i "${PG_DOCKER_IMAGE}" pg_dumpall "$@"
  fi
}

GLOBAL_FILE="${RUN_DIR}/globals.sql"
SCHEMA_FILE="${RUN_DIR}/schema.sql"
DATA_FILE="${RUN_DIR}/data.dump"

log "Dump globals.sql"
run_pg_dumpall \
  --dbname="${PROD_DB_URL}" \
  --globals-only \
  > "${GLOBAL_FILE}"

log "Dump schema.sql"
run_pg_dump \
  --dbname="${PROD_DB_URL}" \
  --schema-only \
  > "${SCHEMA_FILE}"

log "Dump data.dump"
run_pg_dump \
  --dbname="${PROD_DB_URL}" \
  --data-only \
  --format=custom \
  --compress="${DUMP_COMPRESSION}" \
  > "${DATA_FILE}"

for output_file in "${GLOBAL_FILE}" "${SCHEMA_FILE}" "${DATA_FILE}"; do
  if [[ ! -s "${output_file}" ]]; then
    log "ERROR: file missing or empty: ${output_file}"
    exit 1
  fi
done

if [[ "${KEEP_GENERATIONS}" -gt 0 ]]; then
  mapfile -t backup_dirs < <(find "${BACKUP_DIR}" -mindepth 1 -maxdepth 1 -type d -printf "%f\n" | sort -r)
  if [[ "${#backup_dirs[@]}" -gt "${KEEP_GENERATIONS}" ]]; then
    for old_dir in "${backup_dirs[@]:${KEEP_GENERATIONS}}"; do
      rm -rf "${BACKUP_DIR:?}/${old_dir}"
      log "Removed old backup: ${old_dir}"
    done
  fi
fi

log "Backup completed successfully: ${TIMESTAMP}"
