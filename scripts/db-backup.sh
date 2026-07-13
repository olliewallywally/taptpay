#!/usr/bin/env bash
# Dump every configured Postgres database to db-backups/ (gitignored, workspace-
# persistent). Run manually (`bash scripts/db-backup.sh`) or automatically by the
# dev server on boot — so there is a fresh snapshot before any restart, update,
# or Replit rollback can touch the data.
#
#   DATABASE_URL       — workspace dev DB (Replit helium)
#   NEON_DATABASE_URL  — production DB (Neon cloud, used by the deployment)
#
# Restore example:
#   gunzip -c db-backups/neon-20260713-020000.sql.gz | psql "$NEON_DATABASE_URL"
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-$(cd "$(dirname "$0")/.." && pwd)/db-backups}"
KEEP="${KEEP:-20}" # snapshots kept per database
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

dump() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "skip $label (no URL configured)"
    return 0
  fi
  local out="$BACKUP_DIR/${label}-${STAMP}.sql.gz"
  if pg_dump "$url" --no-owner --no-privileges 2>/dev/null | gzip > "$out" && [ -s "$out" ]; then
    echo "backed up $label -> $out ($(du -h "$out" | cut -f1))"
  else
    rm -f "$out"
    echo "WARN: $label backup failed" >&2
  fi
  # Prune: keep the newest $KEEP snapshots for this database.
  ls -1t "$BACKUP_DIR/${label}"-*.sql.gz 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -f
}

dump dev "${DATABASE_URL:-}"
dump neon "${NEON_DATABASE_URL:-}"
