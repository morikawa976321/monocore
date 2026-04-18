#!/usr/bin/env bash

set -Eeuo pipefail

# One-time setup helper for Raspberry Pi (Debian/Raspberry Pi OS).
#
# Optional:
#   BACKUP_DIR   Backup root directory (default: /srv/backups/supabase)

BACKUP_DIR="${BACKUP_DIR:-/srv/backups/supabase}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

log() {
  printf "%s %s\n" "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$1"
}

if ! command -v apt-get >/dev/null 2>&1; then
  echo "ERROR: apt-get not found. This setup script expects Debian-based Linux."
  exit 1
fi

if ! command -v sudo >/dev/null 2>&1; then
  echo "ERROR: sudo not found."
  exit 1
fi

log "Install postgres client tools"
sudo apt-get update
sudo apt-get install -y postgresql-client

log "Prepare backup directory: ${BACKUP_DIR}"
sudo mkdir -p "${BACKUP_DIR}"
sudo chown -R "${USER}:${USER}" "${BACKUP_DIR}"

log "Set executable permission for backup scripts"
chmod +x "${REPO_ROOT}/scripts/backup/supabase_backup.sh"
chmod +x "${REPO_ROOT}/scripts/backup/supabase_restore_local.sh"
chmod +x "${REPO_ROOT}/scripts/backup/raspi_preflight.sh"
chmod +x "${REPO_ROOT}/scripts/backup/install_backup_cron.sh"

if [[ ! -f "${REPO_ROOT}/scripts/backup/backup.env" ]]; then
  log "Create backup.env from template"
  cp "${REPO_ROOT}/scripts/backup/backup.env.example" "${REPO_ROOT}/scripts/backup/backup.env"
fi

log "Done. Edit scripts/backup/backup.env and run raspi_preflight.sh."
