#!/usr/bin/env bash
# Wait for Postgres, run initial backup (fail hard), then supercronic on schedule.
set -euo pipefail

SCHEDULE="${DB_BACKUP_SCHEDULE:-0 2 * * *}"
CRONTAB="/tmp/db-backup.crontab"
MARKER_FILE="${DB_BACKUP_MARKER_FILE:-/var/tmp/last-backup-ok}"
PG_WAIT_ATTEMPTS="${DB_BACKUP_PG_WAIT_ATTEMPTS:-60}"
PG_WAIT_SLEEP_SECS="${DB_BACKUP_PG_WAIT_SLEEP_SECS:-2}"

echo "${SCHEDULE} /usr/local/bin/backup.sh" > "${CRONTAB}"
echo "[db-backup] Schedule: ${SCHEDULE}"

echo "[db-backup] Waiting for Postgres at ${PGHOST:-tools_postgres}:${PGPORT:-5432} ..."
attempt=0
until pg_isready -h "${PGHOST:-tools_postgres}" -p "${PGPORT:-5432}" -U "${PGUSER}" -d "${PGDATABASE}" >/dev/null 2>&1; do
    attempt=$((attempt + 1))
    if [[ "${attempt}" -ge "${PG_WAIT_ATTEMPTS}" ]]; then
        echo "[db-backup] Postgres not ready after ${PG_WAIT_ATTEMPTS} attempts; exiting."
        exit 1
    fi
    sleep "${PG_WAIT_SLEEP_SECS}"
done
echo "[db-backup] Postgres is ready."

echo "[db-backup] Running initial backup on startup (must succeed)..."
/usr/local/bin/backup.sh
echo "[db-backup] Initial backup OK (marker: ${MARKER_FILE}). Starting supercronic."

exec supercronic "${CRONTAB}"
