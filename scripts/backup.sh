#!/bin/bash
# DPS Dashboard — PostgreSQL Backup Script
# Usage: ./scripts/backup.sh
# Cron: 0 2 * * * /path/to/scripts/backup.sh

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/dps-dashboard}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/dps_dashboard_${TIMESTAMP}.sql.gz"

# Create backup directory if needed
mkdir -p "$BACKUP_DIR"

# Run pg_dump (uses DATABASE_URL or PGHOST/PGUSER/PGDATABASE env vars)
# For Docker: docker exec dps-postgres pg_dump -U postgres dps_dashboard
if [ -n "${DATABASE_URL:-}" ]; then
  pg_dump "$DATABASE_URL" | gzip > "$BACKUP_FILE"
elif command -v docker &> /dev/null && docker ps --format '{{.Names}}' | grep -q dps-postgres; then
  docker exec dps-postgres pg_dump -U postgres dps_dashboard | gzip > "$BACKUP_FILE"
else
  pg_dump -U "${PGUSER:-postgres}" "${PGDATABASE:-dps_dashboard}" | gzip > "$BACKUP_FILE"
fi

# Delete backups older than retention period
find "$BACKUP_DIR" -name "dps_dashboard_*.sql.gz" -mtime +"$RETENTION_DAYS" -delete

echo "Backup created: $BACKUP_FILE"
echo "Size: $(du -h "$BACKUP_FILE" | cut -f1)"

# Optional: rsync to offsite
if [ -n "${OFFSITE_BACKUP_PATH:-}" ]; then
  rsync -az "$BACKUP_FILE" "$OFFSITE_BACKUP_PATH/"
  echo "Offsite copy sent to: $OFFSITE_BACKUP_PATH"
fi
