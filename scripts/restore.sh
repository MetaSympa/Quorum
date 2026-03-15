#!/bin/bash
# DPS Dashboard — PostgreSQL Restore Script
# Usage: ./scripts/restore.sh <backup_file.sql.gz>

set -euo pipefail

if [ -z "${1:-}" ]; then
  echo "Usage: $0 <backup_file.sql.gz>"
  echo "Available backups:"
  ls -la "${BACKUP_DIR:-/var/backups/dps-dashboard}/"*.sql.gz 2>/dev/null || echo "  No backups found"
  exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Error: Backup file not found: $BACKUP_FILE"
  exit 1
fi

echo "WARNING: This will DROP and recreate the database."
echo "Restoring from: $BACKUP_FILE"
read -p "Continue? [y/N] " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 0
fi

if [ -n "${DATABASE_URL:-}" ]; then
  gunzip -c "$BACKUP_FILE" | psql "$DATABASE_URL"
elif command -v docker &> /dev/null && docker ps --format '{{.Names}}' | grep -q dps-postgres; then
  gunzip -c "$BACKUP_FILE" | docker exec -i dps-postgres psql -U postgres dps_dashboard
else
  gunzip -c "$BACKUP_FILE" | psql -U "${PGUSER:-postgres}" "${PGDATABASE:-dps_dashboard}"
fi

echo "Restore complete."
