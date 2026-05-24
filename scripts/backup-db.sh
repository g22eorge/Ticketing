#!/usr/bin/env bash
# backup-db.sh — SQLite point-in-time backup
# Usage: ./scripts/backup-db.sh [DB_PATH] [BACKUP_DIR]
# Defaults: DB_PATH=./prisma/dev.db  BACKUP_DIR=./backups
#
# Add to crontab for daily backups:
#   0 2 * * * /path/to/project/scripts/backup-db.sh >> /var/log/mrms-backup.log 2>&1

set -euo pipefail

DB_PATH="${1:-${DATABASE_URL#file:}}"
DB_PATH="${DB_PATH:-./prisma/dev.db}"
BACKUP_DIR="${2:-./backups}"
TIMESTAMP=$(date +%Y-%m-%d_%H-%M-%S)
BACKUP_FILE="${BACKUP_DIR}/mrms-${TIMESTAMP}.db"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-30}"

if [ ! -f "$DB_PATH" ]; then
  echo "ERROR: database not found at $DB_PATH" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

# Use SQLite's .backup command for a consistent snapshot (safe under live writes)
sqlite3 "$DB_PATH" ".backup '${BACKUP_FILE}'"

SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
echo "OK: backup created → ${BACKUP_FILE} (${SIZE})"

# Prune backups older than KEEP_DAYS
find "$BACKUP_DIR" -name "mrms-*.db" -mtime "+${KEEP_DAYS}" -delete
REMAINING=$(find "$BACKUP_DIR" -name "mrms-*.db" | wc -l | tr -d ' ')
echo "OK: ${REMAINING} backup(s) retained (keep_days=${KEEP_DAYS})"
