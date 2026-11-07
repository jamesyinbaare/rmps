#!/bin/bash
# Monthly restore drill: download latest GCS dump (+ checksum), verify list,
# optionally restore into a throwaway postgres:18.6 container.
#
# Usage (from exam-tools repo root):
#   ./gcp/staging/scripts/verify-db-backup.sh
#   VERIFY_RESTORE=1 ./gcp/staging/scripts/verify-db-backup.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
ENV_FILE="${ENV_FILE:-.env.staging.gcp}"
VERIFY_RESTORE="${VERIFY_RESTORE:-0}"
POSTGRES_IMAGE="${POSTGRES_IMAGE:-postgres:18.6}"

cd "$PROJECT_ROOT"

if [ -f "$ENV_FILE" ]; then
    set -a
    # shellcheck source=/dev/null
    source "$ENV_FILE"
    set +a
fi

: "${GCS_BUCKET_NAME:?GCS_BUCKET_NAME is required}"
PREFIX="${DB_BACKUP_GCS_PREFIX:-exam-tools/db-backups}"
PREFIX="${PREFIX#/}"
PREFIX="${PREFIX%/}"
GCS_URI="gs://${GCS_BUCKET_NAME}/${PREFIX}"

if ! command -v gsutil >/dev/null 2>&1; then
    echo "Error: gsutil not found. Install Google Cloud SDK."
    exit 1
fi

if ! command -v pg_restore >/dev/null 2>&1 && [ "$VERIFY_RESTORE" != "1" ]; then
    echo "Warning: pg_restore not on PATH; will use docker ${POSTGRES_IMAGE} for --list."
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "Listing dumps under ${GCS_URI}/ ..."
# Newest last; take last .dump line
LATEST="$(gsutil ls "${GCS_URI}/*.dump" 2>/dev/null | sort | tail -n 1 || true)"
if [ -z "$LATEST" ]; then
    echo "Error: no .dump objects found under ${GCS_URI}/"
    exit 1
fi

DUMP_BASENAME="$(basename "$LATEST")"
LOCAL_DUMP="${TMP_DIR}/${DUMP_BASENAME}"
LOCAL_SHA="${TMP_DIR}/${DUMP_BASENAME}.sha256"

echo "Downloading ${LATEST} ..."
gsutil -q cp "$LATEST" "$LOCAL_DUMP"
if gsutil -q cp "${LATEST}.sha256" "$LOCAL_SHA" 2>/dev/null; then
    echo "Verifying checksum ..."
    (
        cd "$TMP_DIR"
        sha256sum -c "${DUMP_BASENAME}.sha256"
    )
else
    echo "Warning: no sibling .sha256 for ${DUMP_BASENAME}; skipping checksum."
fi

echo "Verifying dump TOC (pg_restore --list) ..."
if command -v pg_restore >/dev/null 2>&1; then
    pg_restore --list "$LOCAL_DUMP" >/dev/null
else
    docker run --rm -v "$TMP_DIR:/dump:ro" "$POSTGRES_IMAGE" \
        pg_restore --list "/dump/${DUMP_BASENAME}" >/dev/null
fi
echo "TOC OK."

if [ "$VERIFY_RESTORE" = "1" ]; then
    if ! command -v docker >/dev/null 2>&1; then
        echo "Error: VERIFY_RESTORE=1 requires docker."
        exit 1
    fi
    VERIFY_NAME="exam-tools-backup-verify-$$"
    echo "Restoring into throwaway container ${VERIFY_NAME} (${POSTGRES_IMAGE}) ..."
    docker run -d --rm \
        --name "$VERIFY_NAME" \
        -e POSTGRES_PASSWORD=verify \
        -e POSTGRES_USER=verify \
        -e POSTGRES_DB=verify_db \
        "$POSTGRES_IMAGE" >/dev/null

    cleanup_verify() {
        docker stop "$VERIFY_NAME" >/dev/null 2>&1 || true
    }
    trap 'cleanup_verify; rm -rf "$TMP_DIR"' EXIT

    echo "Waiting for throwaway Postgres ..."
    for _ in $(seq 1 60); do
        if docker exec "$VERIFY_NAME" pg_isready -U verify -d verify_db >/dev/null 2>&1; then
            break
        fi
        sleep 1
    done

    docker cp "$LOCAL_DUMP" "${VERIFY_NAME}:/tmp/${DUMP_BASENAME}"
    set +e
    docker exec "$VERIFY_NAME" \
        pg_restore --no-owner --no-acl -U verify -d verify_db "/tmp/${DUMP_BASENAME}"
    rc=$?
    set -e
    if [ "$rc" -gt 1 ]; then
        echo "Error: pg_restore failed with exit code $rc"
        exit "$rc"
    fi
    TABLE_COUNT="$(docker exec "$VERIFY_NAME" \
        psql -U verify -d verify_db -Atc "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';")"
    echo "Public tables after restore: ${TABLE_COUNT}"
    if ! [[ "${TABLE_COUNT}" =~ ^[0-9]+$ ]] || [[ "${TABLE_COUNT}" -le 0 ]]; then
        echo "Error: restore drill produced zero public tables."
        exit 1
    fi
    echo "Restore drill OK."
fi

echo ""
echo "Verified backup: ${LATEST}"
echo "Monthly drill tip: VERIFY_RESTORE=1 $0"
