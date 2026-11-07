#!/bin/bash
# Restore live Compose Postgres from a GCS db-backup dump.
#
# Usage (from exam-tools repo root, stack should be up with healthy tools_postgres):
#   ./gcp/staging/scripts/restore-from-gcs-backup.sh
#   ./gcp/staging/scripts/restore-from-gcs-backup.sh gs://bucket/exam-tools/db-backups/exam_tools_db_....dump
#   ./gcp/staging/scripts/restore-from-gcs-backup.sh exam_tools_db_20260101_020000.dump
#
# If POSTGRES_DATA_DIR is corrupt and Postgres will not start, wipe/recreate the
# data dir and redeploy first (see staging README Disaster recovery).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
ENV_FILE="${ENV_FILE:-.env.staging.gcp}"
OUT_DIR="${OUT_DIR:-$PROJECT_ROOT/backups}"

cd "$PROJECT_ROOT"

if [ ! -f "$ENV_FILE" ]; then
    echo "Error: Environment file $ENV_FILE not found"
    exit 1
fi

set -a
# shellcheck source=/dev/null
source "$ENV_FILE"
set +a

: "${GCS_BUCKET_NAME:?GCS_BUCKET_NAME is required}"
PREFIX="${DB_BACKUP_GCS_PREFIX:-exam-tools/db-backups}"
PREFIX="${PREFIX#/}"
PREFIX="${PREFIX%/}"
GCS_URI="gs://${GCS_BUCKET_NAME}/${PREFIX}"

if ! command -v gsutil >/dev/null 2>&1; then
    echo "Error: gsutil not found. Install Google Cloud SDK."
    exit 1
fi

mkdir -p "$OUT_DIR"

resolve_dump_uri() {
    local arg="${1:-}"
    if [ -z "$arg" ]; then
        local latest
        latest="$(gsutil ls "${GCS_URI}/*.dump" 2>/dev/null | sort | tail -n 1 || true)"
        if [ -z "$latest" ]; then
            echo "Error: no .dump objects found under ${GCS_URI}/" >&2
            exit 1
        fi
        echo "$latest"
        return
    fi
    if [[ "$arg" == gs://* ]]; then
        echo "$arg"
        return
    fi
    # Basename or relative path under the backup prefix
    local base
    base="$(basename "$arg")"
    echo "${GCS_URI}/${base}"
}

DUMP_URI="$(resolve_dump_uri "${1:-}")"
DUMP_BASENAME="$(basename "$DUMP_URI")"
LOCAL_DUMP="${OUT_DIR}/${DUMP_BASENAME}"
LOCAL_SHA="${LOCAL_DUMP}.sha256"

echo "Selected backup: ${DUMP_URI}"
echo "Downloading to ${LOCAL_DUMP} ..."
gsutil -q cp "$DUMP_URI" "$LOCAL_DUMP"

if gsutil -q cp "${DUMP_URI}.sha256" "$LOCAL_SHA" 2>/dev/null; then
    echo "Verifying SHA256 ..."
    (
        cd "$OUT_DIR"
        sha256sum -c "$(basename "$LOCAL_SHA")"
    )
else
    echo "Warning: no sibling .sha256 for ${DUMP_BASENAME}; continuing without checksum."
fi

echo "Importing into live Compose Postgres via import-postgres-dump.sh ..."
exec "$SCRIPT_DIR/import-postgres-dump.sh" "$LOCAL_DUMP"
