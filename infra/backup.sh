#!/usr/bin/env bash
#
# Nightly SQLite snapshot. Run by infra/systemd/aow5-backup.timer, and once more
# by infra/deploy.sh immediately before every deploy.
#
# `sqlite3 .backup` and not `cp`: the database runs in WAL mode, where the .db
# file on its own is an incomplete picture and copying it under a live writer
# produces a file that may or may not open. `.backup` goes through SQLite's
# online backup API and is safe against concurrent writes.

set -euo pipefail

DB="${AOW5_DB:-/srv/aow5/data/aow5.db}"
DEST="${AOW5_BACKUP_DIR:-/srv/aow5/backups}"
KEEP_DAYS="${AOW5_BACKUP_KEEP_DAYS:-14}"

# Not an error. Until the API ships there is no database, and deploy.sh calls
# this on every run.
if [ ! -f "$DB" ]; then
  echo "No database at $DB yet - nothing to back up."
  exit 0
fi

command -v sqlite3 >/dev/null || { echo "sqlite3 is not installed" >&2; exit 1; }
mkdir -p "$DEST"

out="$DEST/aow5-$(date -u +%Y%m%dT%H%M%SZ).db"
sqlite3 "$DB" ".backup '$out'"

# A backup nobody has verified is a guess. This is cheap at this size.
if ! sqlite3 "$out" 'PRAGMA integrity_check;' | grep -qx ok; then
  rm -f "$out"
  echo "integrity_check failed - snapshot discarded" >&2
  exit 1
fi

gzip -f "$out"
echo "Wrote $out.gz"

find "$DEST" -name 'aow5-*.db.gz' -mtime "+$KEEP_DAYS" -delete

# Reminder rather than a mechanism: a backup on the same disk as the database is
# not a backup. Copy the newest file off the box (scp/rclone) as well.
