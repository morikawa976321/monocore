#!/usr/bin/env bash

set -Eeuo pipefail

# Restore local Supabase database using schema.sql + data.dump only.
# globals.sql is intentionally NOT applied.
#
# Required:
#   BACKUP_RUN_DIR     Directory that contains schema.sql and data.dump
# Optional:
#   LOCAL_DB_URL         Local DB URL (default: postgresql://postgres:postgres@127.0.0.1:54322/postgres)
#   PG_RESTORE_VERIFY    If 1 (default), require pg_restore --verbose "processing data" count to
#                        match active TABLE DATA TOC entries, and run post-restore row sanity checks.
#   PG_CLIENT_MODE       auto | local | docker (default: auto)
#   PG_DOCKER_IMAGE      Docker image for psql/pg_restore in docker mode (default: postgres:17-alpine)
#   RESTORE_DATA_ONLY    If 1, skip schema.sql and only run pg_restore on data.dump (use after
#                        `npx supabase db reset` when local migrations match production schema)
#   PG_RESTORE_SKIP_MISSING_TABLES   If 1 (default), comment out TABLE DATA for any schema.table that
#                        does not exist in the target DB (queries pg_class). Use with RESTORE_DATA_ONLY
#                        when prod has newer auth/storage tables than local migrations. Requires --use-list.
#   PG_RESTORE_EXCLUDE_TABLE_DATA   Comma-separated schema.table names to always omit (TOC ';' prefix).
#                        Default includes auth.schema_migrations; storage.* and vault.secrets entries
#                        that fail locally (permission, column drift vs prod). Also auto-comments
#                        *.schema_migrations. Override with export if needed. Empty disables manual list only.
#                        Applied before PG_RESTORE_SKIP_MISSING_TABLES.
#
# Example:
#   export BACKUP_RUN_DIR="/srv/backups/supabase/20260418-125119"
#   ./scripts/backup/supabase_restore_local.sh

BACKUP_RUN_DIR="${BACKUP_RUN_DIR:-}"
LOCAL_DB_URL="${LOCAL_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
PG_CLIENT_MODE="${PG_CLIENT_MODE:-auto}"
PG_DOCKER_IMAGE="${PG_DOCKER_IMAGE:-postgres:17-alpine}"
RESTORE_DATA_ONLY="${RESTORE_DATA_ONLY:-0}"
PG_RESTORE_VERIFY="${PG_RESTORE_VERIFY:-1}"
PG_RESTORE_SKIP_MISSING_TABLES="${PG_RESTORE_SKIP_MISSING_TABLES:-1}"
if [[ -z "${PG_RESTORE_EXCLUDE_TABLE_DATA+x}" ]]; then
  PG_RESTORE_EXCLUDE_TABLE_DATA="auth.schema_migrations,storage.buckets_vectors,storage.migrations,storage.s3_multipart_uploads,storage.vector_indexes,vault.secrets"
fi

if [[ -z "${BACKUP_RUN_DIR}" ]]; then
  echo "ERROR: BACKUP_RUN_DIR is not set."
  exit 1
fi

# Windows paths (C:\...) must become Unix paths for bash/psql/docker. Try several strategies.
normalize_windows_backup_dir() {
  local d="$1"
  if [[ ! "${d}" =~ ^[A-Za-z]: ]]; then
    printf '%s' "${d}"
    return 0
  fi
  if command -v wslpath >/dev/null 2>&1; then
    local converted
    converted="$(wslpath -u "${d}" 2>/dev/null)" || true
    if [[ -n "${converted}" ]]; then
      printf '%s' "${converted}"
      return 0
    fi
  fi
  if command -v cygpath >/dev/null 2>&1; then
    local converted
    converted="$(cygpath -u "${d}" 2>/dev/null)" || true
    if [[ -n "${converted}" ]]; then
      printf '%s' "${converted}"
      return 0
    fi
  fi
  # Last resort: C:\path\to\dir -> /mnt/c/path/to/dir (WSL-style)
  local drive rest
  drive="${d:0:1}"
  rest="${d:2}"
  rest="${rest//\\//}"
  printf '/mnt/%s/%s' "${drive,,}" "${rest}"
}

BACKUP_RUN_DIR="$(normalize_windows_backup_dir "${BACKUP_RUN_DIR}")"

SCHEMA_FILE="${BACKUP_RUN_DIR}/schema.sql"
DATA_FILE="${BACKUP_RUN_DIR}/data.dump"
LOG_FILE="${BACKUP_RUN_DIR}/restore-local.log"

if [[ "${RESTORE_DATA_ONLY}" == "1" ]]; then
  if [[ ! -f "${DATA_FILE}" ]]; then
    echo "ERROR: required file not found: ${DATA_FILE}"
    exit 1
  fi
else
  for required_file in "${SCHEMA_FILE}" "${DATA_FILE}"; do
    if [[ ! -f "${required_file}" ]]; then
      echo "ERROR: required file not found: ${required_file}"
      echo "Hint: run this script from bash (WSL or Git Bash), not PowerShell."
      echo "      Example (WSL): export BACKUP_RUN_DIR='/mnt/c/Users/you/mf/20260418-141837'"
      exit 1
    fi
  done
fi

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

if [[ ! -d "${BACKUP_RUN_DIR}" ]]; then
  echo "ERROR: BACKUP_RUN_DIR is not a directory: ${BACKUP_RUN_DIR}"
  exit 1
fi

BACKUP_RUN_ABS="$(cd "${BACKUP_RUN_DIR}" && pwd -P)" || {
  echo "ERROR: cannot enter BACKUP_RUN_DIR: ${BACKUP_RUN_DIR}"
  exit 1
}
SCHEMA_IN_CLIENT="${SCHEMA_FILE}"
DATA_IN_CLIENT="${DATA_FILE}"
if [[ "${PG_CLIENT_MODE}" == "docker" ]]; then
  SCHEMA_IN_CLIENT="/backup/schema.sql"
  DATA_IN_CLIENT="/backup/data.dump"
fi

touch "${LOG_FILE}"

log() {
  printf "%s %s\n" "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$1" | tee -a "${LOG_FILE}"
}

# Git Bash (MINGW/MSYS) rewrites paths like /backup/... into C:/Program Files/Git/...
# unless MSYS_NO_PATHCONV=1, which breaks psql --file=/backup/schema.sql inside Docker.
run_docker_pg() {
  local subcmd="$1"
  shift
  if [[ -n "${MSYSTEM:-}" ]] || [[ "${OSTYPE:-}" == msys* ]]; then
    MSYS_NO_PATHCONV=1 docker run --rm -i --network host \
      -e LC_ALL=C \
      -v "${BACKUP_RUN_ABS}:/backup:ro" \
      "${PG_DOCKER_IMAGE}" "${subcmd}" "$@"
  else
    docker run --rm -i --network host \
      -e LC_ALL=C \
      -v "${BACKUP_RUN_ABS}:/backup:ro" \
      "${PG_DOCKER_IMAGE}" "${subcmd}" "$@"
  fi
}

run_psql() {
  if [[ "${PG_CLIENT_MODE}" == "local" ]]; then
    psql "$@"
  else
    run_docker_pg psql "$@"
  fi
}

run_pg_restore() {
  if [[ "${PG_CLIENT_MODE}" == "local" ]]; then
    env LC_ALL=C pg_restore "$@"
  else
    run_docker_pg pg_restore "$@"
  fi
}

# --use-list for Docker: write the TOC file *inside* BACKUP_RUN_DIR and pass
# --use-list=/backup/<filename>. A separate -v hostfile:/tmp/restore_toc.lst bind on Windows Docker
# Desktop often yields an empty mount (wrong path / MSYS path rewrite), so pg_restore restores
# nothing and prints only "connecting to database for restore".

log "Local restore start"
log "Backup directory: ${BACKUP_RUN_DIR}"
log "Postgres client mode: ${PG_CLIENT_MODE}"
log "Target local DB: ${LOCAL_DB_URL}"
if [[ -n "${MSYSTEM:-}" ]] && [[ "${PG_CLIENT_MODE}" == "docker" ]]; then
  log "Git Bash + Docker: if psql cannot connect to Postgres on the host, try LOCAL_DB_URL with host.docker.internal:54322 (see docs/supabase-backup.md)."
fi
log "Note: globals.sql is intentionally skipped."

log "Step 0: verify connection (must be the local Supabase Postgres you intend to restore)"
run_psql --dbname="${LOCAL_DB_URL}" -v ON_ERROR_STOP=1 -c "SELECT current_database() AS db, current_user AS role, inet_server_addr() AS server_addr, inet_server_port() AS server_port;"

if [[ "${RESTORE_DATA_ONLY}" == "1" ]]; then
  log "RESTORE_DATA_ONLY=1: skipping schema.sql (schema comes from supabase migrations / db reset)."
else
  log "Step 1: apply schema.sql"
  run_psql \
    --dbname="${LOCAL_DB_URL}" \
    --set=ON_ERROR_STOP=1 \
    --file="${SCHEMA_IN_CLIENT}"
  log "Step 1: OK (schema.sql applied)"
fi

log "Restore data.dump (data-only)"

dump_bytes="$(wc -c < "${DATA_FILE}" 2>/dev/null || echo 0)"
log "Step 2: data.dump size ${dump_bytes} bytes (${DATA_FILE})"
if [[ "${dump_bytes}" -lt 64 ]]; then
  log "ERROR: data.dump is too small; aborting."
  exit 1
fi

RESTORE_TOC_LIST=""
RESTORE_TOC_RAW=""
TMP_PGRESTORE_OUT=""
EXISTING_TABLES_FILE=""
cleanup_restore_toc() {
  rm -f "${RESTORE_TOC_LIST}" "${RESTORE_TOC_RAW}" "${RESTORE_TOC_LIST}.new" "${TMP_PGRESTORE_OUT}" "${EXISTING_TABLES_FILE}" 2>/dev/null || true
}
trap cleanup_restore_toc EXIT

log "Step 3: pg_restore -l (build TOC snapshot)"
RESTORE_TOC_RAW="$(mktemp "${TMPDIR:-/tmp}/pg_restore_toc_raw.XXXXXX" 2>/dev/null || true)"
if [[ -z "${RESTORE_TOC_RAW}" ]]; then
  RESTORE_TOC_RAW="${TMPDIR:-/tmp}/pg_restore_toc_raw_$$.${RANDOM}.lst"
fi
if ! run_pg_restore -l "${DATA_IN_CLIENT}" | tr -d '\r' > "${RESTORE_TOC_RAW}"; then
  log "ERROR: pg_restore -l failed (pipe)."
  exit 1
fi
if [[ ! -s "${RESTORE_TOC_RAW}" ]]; then
  log "ERROR: pg_restore -l produced an empty TOC file."
  exit 1
fi
EXPECTED_TOC_DATA="$(grep -c '^[0-9].*TABLE DATA' "${RESTORE_TOC_RAW}" 2>/dev/null || true)"
EXPECTED_TOC_DATA="${EXPECTED_TOC_DATA:-0}"
log "Step 3: OK — archive has ${EXPECTED_TOC_DATA} TABLE DATA TOC entries"

need_use_list=false
if [[ -n "${PG_RESTORE_EXCLUDE_TABLE_DATA}" ]] || [[ "${PG_RESTORE_SKIP_MISSING_TABLES}" == "1" ]]; then
  need_use_list=true
fi

n_toc_expected="${EXPECTED_TOC_DATA}"

if [[ "${need_use_list}" == true ]]; then
  log "Step 4: build use-list under ${BACKUP_RUN_ABS}"
  RESTORE_TOC_LIST="${BACKUP_RUN_ABS}/.pg_restore_use_list_$$.lst"
  cp "${RESTORE_TOC_RAW}" "${RESTORE_TOC_LIST}"
  n_toc_before="${EXPECTED_TOC_DATA}"
  excl_applied=0

  if [[ -n "${PG_RESTORE_EXCLUDE_TABLE_DATA}" ]]; then
    log "Step 4a: manual TOC exclusions: ${PG_RESTORE_EXCLUDE_TABLE_DATA}"
    IFS=',' read -ra EXCL_PARTS <<< "${PG_RESTORE_EXCLUDE_TABLE_DATA}" || true
    for entry in "${EXCL_PARTS[@]}"; do
      entry_trimmed="${entry//[[:space:]]/}"
      if [[ -z "${entry_trimmed}" ]]; then
        continue
      fi
      schema="${entry_trimmed%%.*}"
      tbl="${entry_trimmed#*.}"
      if [[ "${schema}" == "${entry_trimmed}" ]] || [[ -z "${tbl}" ]]; then
        echo "ERROR: PG_RESTORE_EXCLUDE_TABLE_DATA entries must be schema.table (e.g. auth.schema_migrations), got: ${entry_trimmed}"
        exit 1
      fi
      awk -v s="${schema}" -v t="${tbl}" '
        /^[0-9]/ && index($0, "TABLE DATA " s " " t) > 0 { print ";" $0; next }
        { print }
      ' "${RESTORE_TOC_LIST}" > "${RESTORE_TOC_LIST}.new"
      mv "${RESTORE_TOC_LIST}.new" "${RESTORE_TOC_LIST}"
      excl_applied=$((excl_applied + 1))
    done
    tr -d '\r' < "${RESTORE_TOC_LIST}" > "${RESTORE_TOC_LIST}.new" && mv "${RESTORE_TOC_LIST}.new" "${RESTORE_TOC_LIST}"
    n_after_manual="$(grep -c '^[0-9].*TABLE DATA' "${RESTORE_TOC_LIST}" 2>/dev/null || true)"
    n_after_manual="${n_after_manual:-0}"
    if [[ "${excl_applied}" -gt 0 ]] && [[ "${n_after_manual}" -ge "${n_toc_before}" ]]; then
      log "ERROR: Step 4a did not comment out any TABLE DATA lines (before=${n_toc_before} after=${n_after_manual}). Check PG_RESTORE_EXCLUDE_TABLE_DATA."
      exit 1
    fi
    if [[ "${n_after_manual}" -lt 1 ]] && [[ "${PG_RESTORE_SKIP_MISSING_TABLES}" != "1" ]]; then
      log "ERROR: After manual exclusions, no TABLE DATA entries remain."
      exit 1
    fi
    log "Step 4a: OK — ${n_after_manual} TABLE DATA entries remain"
  else
    log "Step 4a: skipped (PG_RESTORE_EXCLUDE_TABLE_DATA empty)"
  fi

  log "Step 4a: TOC comment-out TABLE DATA for *.schema_migrations (auth / realtime / supabase_migrations / …)"
  awk '
/^[0-9]/ && /TABLE DATA/ {
  idx = index($0, "TABLE DATA ")
  if (idx > 0) {
    rest = substr($0, idx + length("TABLE DATA "))
    n = split(rest, w, " ")
    if (n >= 3 && w[2] == "schema_migrations") {
      print ";" $0
      next
    }
  }
}
{ print }
' "${RESTORE_TOC_LIST}" > "${RESTORE_TOC_LIST}.new"
  mv "${RESTORE_TOC_LIST}.new" "${RESTORE_TOC_LIST}"
  tr -d '\r' < "${RESTORE_TOC_LIST}" > "${RESTORE_TOC_LIST}.new" && mv "${RESTORE_TOC_LIST}.new" "${RESTORE_TOC_LIST}"

  if [[ "${PG_RESTORE_SKIP_MISSING_TABLES}" == "1" ]]; then
    log "Step 4b: skip TABLE DATA when relation is missing in target DB (pg_class)"
    EXISTING_TABLES_FILE="$(mktemp "${TMPDIR:-/tmp}/pg_restore_existing.XXXXXX" 2>/dev/null || true)"
    if [[ -z "${EXISTING_TABLES_FILE}" ]]; then
      EXISTING_TABLES_FILE="${TMPDIR:-/tmp}/pg_restore_existing_$$.${RANDOM}.txt"
    fi
    run_psql --dbname="${LOCAL_DB_URL}" -v ON_ERROR_STOP=1 -t -A -c "SELECT n.nspname || '.' || c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relkind IN ('r', 'p', 'm') AND n.nspname NOT IN ('pg_catalog', 'information_schema') ORDER BY 1;" | tr -d '\r' > "${EXISTING_TABLES_FILE}"
    n_exist="$(wc -l < "${EXISTING_TABLES_FILE}" 2>/dev/null | tr -d ' \r\n')"
    n_exist="${n_exist:-0}"
    log "Step 4b: loaded ${n_exist} relation names from target for TOC matching"
    n_before_skip="$(grep -c '^[0-9].*TABLE DATA' "${RESTORE_TOC_LIST}" 2>/dev/null || true)"
    n_before_skip="${n_before_skip:-0}"
    awk -v f="${EXISTING_TABLES_FILE}" '
BEGIN {
  while ((getline line < f) > 0) {
    gsub(/^[ \t\r]+|[ \t\r]+$/, "", line)
    if (line != "") ok[line] = 1
  }
  close(f)
}
{
  if ($0 ~ /^[0-9]/ && $0 ~ /TABLE DATA/) {
    idx = index($0, "TABLE DATA ")
    if (idx > 0) {
      rest = substr($0, idx + length("TABLE DATA "))
      n = split(rest, w, " ")
      if (n >= 3 && w[1] != "" && w[2] != "") {
        fq = w[1] "." w[2]
        if (!(fq in ok)) {
          print ";" $0
          next
        }
      }
    }
  }
  print
}
' "${RESTORE_TOC_LIST}" > "${RESTORE_TOC_LIST}.new"
    mv "${RESTORE_TOC_LIST}.new" "${RESTORE_TOC_LIST}"
    tr -d '\r' < "${RESTORE_TOC_LIST}" > "${RESTORE_TOC_LIST}.new" && mv "${RESTORE_TOC_LIST}.new" "${RESTORE_TOC_LIST}"
    n_toc_expected="$(grep -c '^[0-9].*TABLE DATA' "${RESTORE_TOC_LIST}" 2>/dev/null || true)"
    n_toc_expected="${n_toc_expected:-0}"
    skipped=$((n_before_skip - n_toc_expected))
    log "Step 4b: OK — ${skipped} TABLE DATA entries commented (not in target); ${n_toc_expected} will be restored"
  else
    log "Step 4b: skipped (PG_RESTORE_SKIP_MISSING_TABLES=0)"
    n_toc_expected="$(grep -c '^[0-9].*TABLE DATA' "${RESTORE_TOC_LIST}" 2>/dev/null || true)"
    n_toc_expected="${n_toc_expected:-0}"
  fi

  if [[ "${n_toc_expected}" -lt 1 ]]; then
    log "ERROR: No TABLE DATA entries left to restore after TOC filtering (check migrations / dump)."
    exit 1
  fi
  log "Step 4: OK — ${n_toc_expected} TABLE DATA entries will be restored"
else
  log "Step 4: skipped (full archive restore — no use-list; set PG_RESTORE_SKIP_MISSING_TABLES=1 to skip missing relations)"
fi
rm -f "${RESTORE_TOC_RAW}"
RESTORE_TOC_RAW=""

restore_args=(
  --verbose
  --dbname="${LOCAL_DB_URL}"
  --data-only
  --no-owner
  --no-privileges
  --exit-on-error
  --single-transaction
)
if [[ -n "${RESTORE_TOC_LIST}" ]]; then
  if [[ "${PG_CLIENT_MODE}" == "docker" ]]; then
    restore_args+=(--use-list="/backup/$(basename "${RESTORE_TOC_LIST}")")
  else
    restore_args+=(--use-list="${RESTORE_TOC_LIST}")
  fi
fi
restore_args+=("${DATA_IN_CLIENT}")

TMP_PGRESTORE_OUT="$(mktemp "${TMPDIR:-/tmp}/pg_restore_run.XXXXXX" 2>/dev/null || true)"
if [[ -z "${TMP_PGRESTORE_OUT}" ]]; then
  TMP_PGRESTORE_OUT="${TMPDIR:-/tmp}/pg_restore_run_$$.${RANDOM}.log"
fi

if [[ -n "${RESTORE_TOC_LIST}" ]]; then
  use_list_bytes="$(wc -c < "${RESTORE_TOC_LIST}" 2>/dev/null || echo 0)"
  log "Step 5: use-list file ${RESTORE_TOC_LIST} (${use_list_bytes} bytes); Docker path $(basename "${RESTORE_TOC_LIST}")"
  if [[ ! -s "${RESTORE_TOC_LIST}" ]]; then
    log "ERROR: use-list file is missing or empty."
    exit 1
  fi
fi

log "Step 5: pg_restore (data-only), capturing output for verification"
set +e
if [[ "${PG_CLIENT_MODE}" == "docker" ]]; then
  run_docker_pg pg_restore "${restore_args[@]}" > "${TMP_PGRESTORE_OUT}" 2>&1
else
  run_pg_restore "${restore_args[@]}" > "${TMP_PGRESTORE_OUT}" 2>&1
fi
restore_exit=$?
set -e
cat "${TMP_PGRESTORE_OUT}" | tee -a "${LOG_FILE}"
if [[ "${restore_exit}" -ne 0 ]]; then
  log "ERROR: Step 5 failed — pg_restore exit status ${restore_exit} (see ${LOG_FILE})."
  exit 1
fi

VERBOSE_LINES="$(grep -cE 'processing data for table' "${TMP_PGRESTORE_OUT}" 2>/dev/null || true)"
VERBOSE_LINES="${VERBOSE_LINES:-0}"
log "Step 5: pg_restore exit 0; ${VERBOSE_LINES} lines match 'processing data for table' (expected ${n_toc_expected})."

if [[ "${PG_RESTORE_VERIFY}" == "1" ]]; then
  if [[ "${n_toc_expected}" -lt 1 ]]; then
    log "ERROR: Verification failed — TOC had 0 TABLE DATA entries; nothing should have been restored."
    exit 1
  fi
  if [[ "${VERBOSE_LINES}" -ne "${n_toc_expected}" ]]; then
    log "ERROR: Verification failed — pg_restore --verbose reported ${VERBOSE_LINES} data restores but TOC expected ${n_toc_expected}. Wrong DB/port, bad --use-list, or archive/TOC mismatch."
    exit 1
  fi
fi

log "Step 6: post-restore sanity (ANALYZE + pg_stat_user_tables row estimate)"
run_psql --dbname="${LOCAL_DB_URL}" -v ON_ERROR_STOP=1 -c "ANALYZE;"
POST_SUM="$(run_psql --dbname="${LOCAL_DB_URL}" -t -A -c "SELECT COALESCE(SUM(n_live_tup),0)::bigint FROM pg_stat_user_tables WHERE schemaname NOT IN ('pg_catalog','information_schema');" | tr -d ' \r\n')"
log "Step 6: SUM(n_live_tup) for user schemas ≈ ${POST_SUM} (approximate; use SQL if you need exact counts)"
if [[ "${PG_RESTORE_VERIFY}" == "1" ]] && [[ "${VERBOSE_LINES}" -gt 0 ]] && [[ "${POST_SUM}" == "0" ]]; then
  log "WARNING: pg_restore reported copying data but pg_stat_user_tables still sums to 0 — run SELECT on your tables, or check you connected to the correct database (Step 0)."
fi

log "Local restore completed successfully"
