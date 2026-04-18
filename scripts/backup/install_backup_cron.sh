#!/usr/bin/env bash

set -Eeuo pipefail

# Install/update daily backup cron entry.
#
# Optional:
#   BACKUP_CRON_SCHEDULE   Cron schedule (default: 0 3 * * *)

BACKUP_CRON_SCHEDULE="${BACKUP_CRON_SCHEDULE:-0 3 * * *}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
ENV_FILE="${REPO_ROOT}/scripts/backup/backup.env"
BACKUP_SCRIPT="${REPO_ROOT}/scripts/backup/supabase_backup.sh"
CRON_TAG="# monocore-supabase-backup"
CRON_CMD=". ${ENV_FILE} && /bin/bash ${BACKUP_SCRIPT} >> /srv/backups/supabase/cron.log 2>&1 ${CRON_TAG}"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "ERROR: ${ENV_FILE} not found."
  exit 1
fi

tmp_cron="$(mktemp)"
existing_cron="$(mktemp)"
trap 'rm -f "${tmp_cron}" "${existing_cron}"' EXIT

crontab -l > "${existing_cron}" 2>/dev/null || true
grep -v "${CRON_TAG}" "${existing_cron}" > "${tmp_cron}" || true
printf "%s %s\n" "${BACKUP_CRON_SCHEDULE}" "${CRON_CMD}" >> "${tmp_cron}"

crontab "${tmp_cron}"

echo "Installed cron entry:"
echo "${BACKUP_CRON_SCHEDULE} ${CRON_CMD}"
