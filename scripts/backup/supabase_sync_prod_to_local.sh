#!/usr/bin/env bash
# Sync production Supabase DB -> local: dump, reset+restore, verify.
#
# Guarantees checked by this script:
#   1) Production content is unchanged across the whole run (before vs after fingerprint).
#   2) Local matches remote for the verified scope (public schema + auth.users/identities).
#
# Usage (repo root, Git Bash or WSL):
#   ./scripts/backup/supabase_sync_prod_to_local.sh
#
# Windows PowerShell:
#   .\scripts\backup\supabase_sync_prod_to_local.ps1
#
# Requirements: npx supabase (linked project), docker (pg_dump/psql/pg_restore), local supabase up.
# Optional:
#   BACKUP_ROOT   default: <repo>/backups/manual
#   LOCAL_DB_URL  default: postgresql://postgres:postgres@127.0.0.1:54322/postgres
#   PG_DOCKER_IMAGE default: postgres:17
#   PG_RESTORE_EXCLUDE_TABLE_DATA  extra TOC exclusions (merged with script defaults)

set -Eeuo pipefail

# When executed via `tr … | bash` (Windows CRLF strip), BASH_SOURCE is empty.
if [[ -n "${SYNC_REPO_ROOT:-}" ]]; then
  REPO_ROOT="${SYNC_REPO_ROOT}"
  SCRIPT_DIR="${SYNC_SCRIPT_DIR:-${REPO_ROOT}/scripts/backup}"
elif [[ -n "${BASH_SOURCE[0]:-}" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
else
  echo "ERROR: set SYNC_REPO_ROOT (and preferably SYNC_SCRIPT_DIR), or run this file directly with bash." >&2
  exit 1
fi
cd "${REPO_ROOT}"

BACKUP_ROOT="${BACKUP_ROOT:-${REPO_ROOT}/backups/manual}"
LOCAL_DB_URL="${LOCAL_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
PG_DOCKER_IMAGE="${PG_DOCKER_IMAGE:-postgres:17}"
RESTORE_SCRIPT="${SCRIPT_DIR}/supabase_restore_local.sh"

# Platform tables that often drift vs local Supabase image; never restored, never part of equality scope.
DEFAULT_EXCLUDE="auth.schema_migrations,auth.custom_oauth_providers,storage.buckets_vectors,storage.migrations,storage.s3_multipart_uploads,storage.vector_indexes,vault.secrets"
if [[ -n "${PG_RESTORE_EXCLUDE_TABLE_DATA:-}" ]]; then
  PG_RESTORE_EXCLUDE_TABLE_DATA="${DEFAULT_EXCLUDE},${PG_RESTORE_EXCLUDE_TABLE_DATA}"
else
  PG_RESTORE_EXCLUDE_TABLE_DATA="${DEFAULT_EXCLUDE}"
fi

TS="$(date -u +%Y%m%d-%H%M%S)"
BACKUP_RUN_DIR="${BACKUP_ROOT}/${TS}"
mkdir -p "${BACKUP_RUN_DIR}"
LOG_FILE="${BACKUP_RUN_DIR}/sync-prod-to-local.log"

log() {
  # stderr so command substitutions (e.g. FP="$(fingerprint_db …)") stay clean
  printf "%s %s\n" "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$*" | tee -a "${LOG_FILE}" >&2
}


die() {
  log "ERROR: $*"
  exit 1
}

to_docker_mount() {
  local p="$1"
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -m "$p"
  elif [[ "$p" =~ ^/c/ ]]; then
    echo "C:${p#/c}"
  else
    echo "$p"
  fi
}

is_msys() {
  [[ -n "${MSYSTEM:-}" ]] || [[ "${OSTYPE:-}" == msys* ]]
}

docker_run_base() {
  # $1 = network mode: "host" | "bridge"
  local net="$1"
  shift
  local net_args=()
  if [[ "${net}" == "host" ]]; then
    net_args=(--network host)
  fi
  if is_msys; then
    MSYS_NO_PATHCONV=1 docker run --rm -i "${net_args[@]}" "$@"
  else
    docker run --rm -i "${net_args[@]}" "$@"
  fi
}

run_pg_dump_prod() {
  docker_run_base bridge \
    -e LC_ALL=C \
    -e "PGPASSWORD=${PGPASSWORD}" \
    -v "$(to_docker_mount "${BACKUP_RUN_DIR}"):/backup" \
    "${PG_DOCKER_IMAGE}" \
    pg_dump \
      --host="${PGHOST}" \
      --port="${PGPORT}" \
      --username="${PGUSER}" \
      --dbname="${PGDATABASE}" \
      --role=postgres \
      "$@"
}

run_psql_prod() {
  docker_run_base bridge \
    -e LC_ALL=C \
    -e "PGPASSWORD=${PGPASSWORD}" \
    -v "$(to_docker_mount "${BACKUP_RUN_DIR}"):/backup" \
    "${PG_DOCKER_IMAGE}" \
    psql \
      --host="${PGHOST}" \
      --port="${PGPORT}" \
      --username="${PGUSER}" \
      --dbname="${PGDATABASE}" \
      "$@"
}

run_psql_local() {
  docker_run_base host \
    -e LC_ALL=C \
    -v "$(to_docker_mount "${BACKUP_RUN_DIR}"):/backup" \
    "${PG_DOCKER_IMAGE}" \
    psql \
      --dbname="${LOCAL_DB_URL}" \
      "$@"
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"
}

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

load_prod_env_from_dry_run() {
  local dry_file="${BACKUP_RUN_DIR}/_dryrun.tmp.txt"
  log "Resolve production connection via: npx supabase db dump --linked --dry-run"
  set +e
  npx supabase db dump --linked --dry-run >"${dry_file}" 2>&1
  local ec=$?
  set -e
  if [[ "${ec}" -ne 0 ]]; then
    sed -E 's/(PASSWORD|password|PGPASSWORD)=[^[:space:]]+/\1=***/g' "${dry_file}" >>"${LOG_FILE}" || true
    die "supabase db dump --linked --dry-run failed (exit ${ec})"
  fi

  extract_export() {
    local name="$1"
    local line
    line="$(grep -E "^export ${name}=" "${dry_file}" | head -n1 || true)"
    [[ -n "${line}" ]] || die "dry-run output missing export ${name}"
    line="${line#export ${name}=}"
    line="${line#\"}"
    line="${line%\"}"
    printf '%s' "${line}"
  }

  PGHOST="$(extract_export PGHOST)"
  PGPORT="$(extract_export PGPORT)"
  PGUSER="$(extract_export PGUSER)"
  PGPASSWORD="$(extract_export PGPASSWORD)"
  PGDATABASE="$(extract_export PGDATABASE)"
  rm -f "${dry_file}"
  export PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE
  log "Production target: host=${PGHOST} port=${PGPORT} user=${PGUSER} db=${PGDATABASE}"
}

write_fingerprint_runner() {
  local out="$1"
  cat >"${out}" <<'SQL'
\set ON_ERROR_STOP on
\pset pager off
-- Linked CLI role can SET ROLE postgres (same as pg_dump --role=postgres).
SET ROLE postgres;
CREATE TEMP TABLE _fp (
  kind text NOT NULL,
  name text NOT NULL,
  payload text NOT NULL
);

DO $$
DECLARE
  r record;
  col_sig text;
  row_sig text;
  cnt bigint;
  sql text;
BEGIN
  FOR r IN
    SELECT n.nspname AS schemaname, c.relname AS tablename
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r'
      AND (
        n.nspname = 'public'
        OR (n.nspname = 'auth' AND c.relname IN ('users', 'identities'))
      )
    ORDER BY 1, 2
  LOOP
    SELECT string_agg(
             column_name || ':' || data_type || ':' || is_nullable || ':' || coalesce(column_default, ''),
             ',' ORDER BY ordinal_position
           )
      INTO col_sig
    FROM information_schema.columns
    WHERE table_schema = r.schemaname AND table_name = r.tablename;

    INSERT INTO _fp(kind, name, payload)
    VALUES ('cols', r.schemaname || '.' || r.tablename, coalesce(col_sig, ''));

    sql := format(
      'SELECT count(*)::bigint, coalesce(md5(string_agg(md5(row_to_json(t)::text), '','' ORDER BY md5(row_to_json(t)::text))), ''empty'') FROM %I.%I AS t',
      r.schemaname, r.tablename
    );
    EXECUTE sql INTO cnt, row_sig;

    INSERT INTO _fp(kind, name, payload)
    VALUES ('data', r.schemaname || '.' || r.tablename, cnt::text || '|' || row_sig);
  END LOOP;
END $$;

COPY (
  SELECT kind || '|' || name || '|' || payload
  FROM _fp
  ORDER BY kind, name
) TO STDOUT;
SQL
}

fingerprint_db() {
  local label="$1"
  local which="$2" # prod | local
  local fp_sql_name="_fingerprint_${label}.sql"
  local fp_sql="${BACKUP_RUN_DIR}/${fp_sql_name}"
  local fp_out="${BACKUP_RUN_DIR}/fingerprint-${label}.txt"
  write_fingerprint_runner "${fp_sql}"

  if [[ "${which}" == "local" ]]; then
    run_psql_local -v ON_ERROR_STOP=1 -f "/backup/${fp_sql_name}" >"${fp_out}"
  else
    run_psql_prod -v ON_ERROR_STOP=1 -f "/backup/${fp_sql_name}" >"${fp_out}"
  fi

  grep -E '^(cols|data)\|' "${fp_out}" >"${fp_out}.clean" || true
  mv "${fp_out}.clean" "${fp_out}"
  [[ -s "${fp_out}" ]] || die "fingerprint for ${label} is empty"
  local digest
  digest="$(sha256_file "${fp_out}")"
  printf '%s\n' "${digest}" >"${BACKUP_RUN_DIR}/fingerprint-${label}.sha256"
  log "Fingerprint ${label}: sha256=${digest} (see fingerprint-${label}.txt)"
  printf '%s' "${digest}"
}

write_equality_view() {
  local src="$1"
  local dest="$2"
  # Equality scope: public schema+data, and auth.users/identities data only
  # (auth column catalogs can differ by platform image without affecting app data).
  {
    grep -E '^cols\|public\.' "${src}" || true
    grep -E '^data\|public\.' "${src}" || true
    grep -E '^data\|auth\.(users|identities)\|' "${src}" || true
  } >"${dest}"
}

assert_files_equal() {
  local a="$1"
  local b="$2"
  local msg="$3"
  if ! cmp -s "$a" "$b"; then
    log "Mismatch detail: ${a} vs ${b}"
    if command -v diff >/dev/null 2>&1; then
      diff -u "$a" "$b" | tee -a "${LOG_FILE}" || true
    fi
    die "${msg}"
  fi
}

assert_local_matches_prod() {
  local local_fp="$1"
  local prod_fp="$2"
  write_equality_view "${local_fp}" "${BACKUP_RUN_DIR}/equality-local.txt"
  write_equality_view "${prod_fp}" "${BACKUP_RUN_DIR}/equality-prod.txt"
  assert_files_equal \
    "${BACKUP_RUN_DIR}/equality-local.txt" \
    "${BACKUP_RUN_DIR}/equality-prod.txt" \
    "Local does not fully match remote (public + auth.users/identities data)."
}


dump_production() {
  log "Dump production schema.sql"
  run_pg_dump_prod \
    --schema-only \
    --no-owner --no-privileges \
    --file=/backup/schema.sql

  log "Dump production data.dump (data-only, custom)"
  run_pg_dump_prod \
    --data-only \
    --format=custom \
    --compress=1 \
    --file=/backup/data.dump

  local schema_bytes data_bytes
  schema_bytes="$(wc -c <"${BACKUP_RUN_DIR}/schema.sql" | tr -d ' ')"
  data_bytes="$(wc -c <"${BACKUP_RUN_DIR}/data.dump" | tr -d ' ')"
  [[ "${schema_bytes}" -gt 64 ]] || die "schema.sql too small (${schema_bytes})"
  [[ "${data_bytes}" -gt 64 ]] || die "data.dump too small (${data_bytes})"
  log "Dump OK: schema.sql=${schema_bytes} bytes, data.dump=${data_bytes} bytes"
}

reset_and_restore_local() {
  log "Reset local database (npx supabase db reset)"
  npx supabase db reset

  log "Truncate all public tables (clear migration seed so restore can match prod)"
  run_psql_local -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  LOOP
    EXECUTE format('TRUNCATE TABLE public.%I CASCADE', r.tablename);
  END LOOP;
END $$;
SQL

  log "Check schema: local migrations vs production (public cols must match before restore)"
  fingerprint_db local_pre_restore local >/dev/null
  # Compare public.* columns only (auth catalog can differ by platform image).
  grep -E '^cols\|public\.' "${BACKUP_RUN_DIR}/fingerprint-before_prod.txt" \
    >"${BACKUP_RUN_DIR}/cols-public-before_prod.txt" || true
  grep -E '^cols\|public\.' "${BACKUP_RUN_DIR}/fingerprint-local_pre_restore.txt" \
    >"${BACKUP_RUN_DIR}/cols-public-local_pre_restore.txt" || true
  if ! cmp -s \
    "${BACKUP_RUN_DIR}/cols-public-before_prod.txt" \
    "${BACKUP_RUN_DIR}/cols-public-local_pre_restore.txt"; then
    log "Schema mismatch detail (public cols only):"
    if command -v diff >/dev/null 2>&1; then
      diff -u \
        "${BACKUP_RUN_DIR}/cols-public-before_prod.txt" \
        "${BACKUP_RUN_DIR}/cols-public-local_pre_restore.txt" | tee -a "${LOG_FILE}" || true
    fi
    die "Local migrations diverge from production public schema. Push/apply the same migrations on both sides before syncing data (otherwise local cannot fully match remote)."
  fi
  log "Schema check OK (public columns match)."

  log "Restore data.dump into local (RESTORE_DATA_ONLY=1)"
  [[ -f "${RESTORE_SCRIPT}" ]] || die "missing restore script: ${RESTORE_SCRIPT}"
  local restore_runner
  restore_runner="$(mktemp)"
  tr -d '\r' <"${RESTORE_SCRIPT}" >"${restore_runner}"
  chmod +x "${restore_runner}"
  BACKUP_RUN_DIR="${BACKUP_RUN_DIR}" \
    RESTORE_DATA_ONLY=1 \
    LOCAL_DB_URL="${LOCAL_DB_URL}" \
    PG_DOCKER_IMAGE="${PG_DOCKER_IMAGE}" \
    PG_RESTORE_EXCLUDE_TABLE_DATA="${PG_RESTORE_EXCLUDE_TABLE_DATA}" \
    bash "${restore_runner}"
  rm -f "${restore_runner}"
}

cleanup_secrets() {
  unset PGPASSWORD || true
}

main() {
  require_cmd npx
  require_cmd docker
  require_cmd grep
  require_cmd tee

  log "=== supabase_sync_prod_to_local start ==="
  log "Repo: ${REPO_ROOT}"
  log "Backup dir: ${BACKUP_RUN_DIR}"
  log "Local DB: ${LOCAL_DB_URL}"

  docker info >/dev/null 2>&1 || die "docker is not available / daemon not running"
  if ! npx supabase status >/dev/null 2>&1; then
    die "local supabase is not running (npx supabase start)"
  fi
  # Confirm Postgres accepts connections (status can be flaky when optional services are stopped).
  run_psql_local -v ON_ERROR_STOP=1 -c "SELECT 1;" >/dev/null \
    || die "cannot connect to local DB at ${LOCAL_DB_URL}"

  load_prod_env_from_dry_run

  log "Check 0: production fingerprint (before)"
  FP_BEFORE="$(fingerprint_db before_prod prod)"

  dump_production

  log "Check 1a: production fingerprint immediately after dump (must equal before)"
  FP_AFTER_DUMP="$(fingerprint_db after_dump_prod prod)"
  [[ "${FP_BEFORE}" == "${FP_AFTER_DUMP}" ]] \
    || die "Production changed during dump (before=${FP_BEFORE} after_dump=${FP_AFTER_DUMP})"
  assert_files_equal \
    "${BACKUP_RUN_DIR}/fingerprint-before_prod.txt" \
    "${BACKUP_RUN_DIR}/fingerprint-after_dump_prod.txt" \
    "Production fingerprint changed during dump."

  reset_and_restore_local

  log "Check 2: local fingerprint vs production fingerprint (must match)"
  fingerprint_db local local >/dev/null
  fingerprint_db after_restore_prod prod >/dev/null
  assert_local_matches_prod \
    "${BACKUP_RUN_DIR}/fingerprint-local.txt" \
    "${BACKUP_RUN_DIR}/fingerprint-after_restore_prod.txt"

  log "Check 1b: production fingerprint at end (must equal initial before)"
  assert_files_equal \
    "${BACKUP_RUN_DIR}/fingerprint-before_prod.txt" \
    "${BACKUP_RUN_DIR}/fingerprint-after_restore_prod.txt" \
    "Production fingerprint drifted vs start of run."
  FP_PROD_NOW="$(cat "${BACKUP_RUN_DIR}/fingerprint-after_restore_prod.sha256")"
  [[ "${FP_BEFORE}" == "${FP_PROD_NOW}" ]] \
    || die "Production changed during sync (before=${FP_BEFORE} after=${FP_PROD_NOW})"

  cleanup_secrets
  log "=== SUCCESS ==="
  log "Verified: production unchanged (before == after)."
  log "Verified: local matches remote (public schema/data + auth.users/identities)."
  log "Artifacts: ${BACKUP_RUN_DIR}"
}

trap cleanup_secrets EXIT
main "$@"
