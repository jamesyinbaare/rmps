#!/bin/bash
# One-shot: export exam_tools_db from Cloud SQL to a local custom-format dump.
# Prefer gcloud sql export when CLOUD_SQL_INSTANCE is set; fall back to a temporary
# Cloud SQL Auth Proxy + pg_dump if CLOUD_SQL_CONNECTION_NAME is set.
#
# Usage (from exam-tools repo root, or with ENV_FILE set):
#   ./gcp/staging/scripts/export-cloud-sql-dump.sh
#   ./gcp/staging/scripts/export-cloud-sql-dump.sh /path/to/out.dump

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
ENV_FILE="${ENV_FILE:-.env.staging.gcp}"

cd "$PROJECT_ROOT"

if [ -f "$ENV_FILE" ]; then
    set -a
    # shellcheck source=/dev/null
    source "$ENV_FILE"
    set +a
fi

DB_NAME="${POSTGRES_DB:-exam_tools_db}"
DB_USER="${POSTGRES_USER:-exam_tools_user}"
OUT_DIR="${OUT_DIR:-$PROJECT_ROOT/backups}"
TIMESTAMP="$(date -u +%Y%m%d_%H%M%S)"
OUT_FILE="${1:-$OUT_DIR/${DB_NAME}_${TIMESTAMP}.dump}"

mkdir -p "$(dirname "$OUT_FILE")"

GCS_BUCKET="${GCS_BUCKET_NAME:-}"

if [ -n "${CLOUD_SQL_INSTANCE:-}" ] && [ -n "$GCS_BUCKET" ] && command -v gcloud >/dev/null 2>&1; then
    # CLOUD_SQL_INSTANCE = instance ID only (not project:region:instance)
    GCS_EXPORT_URI="gs://${GCS_BUCKET}/exam-tools/db-migration/${DB_NAME}_${TIMESTAMP}.sql"
    echo "Exporting via gcloud sql export to ${GCS_EXPORT_URI} ..."
    gcloud sql export sql "$CLOUD_SQL_INSTANCE" "$GCS_EXPORT_URI" \
        --database="$DB_NAME" \
        --offload \
        ${GCP_PROJECT_ID:+--project="$GCP_PROJECT_ID"}
    echo "Downloading to ${OUT_FILE%.dump}.sql ..."
    gsutil cp "$GCS_EXPORT_URI" "${OUT_FILE%.dump}.sql"
    echo "Done. SQL dump: ${OUT_FILE%.dump}.sql"
    echo "Import with: ./gcp/staging/scripts/import-postgres-dump.sh ${OUT_FILE%.dump}.sql"
    exit 0
fi

CONNECTION_NAME="${CLOUD_SQL_CONNECTION_NAME:-}"
if [ -z "$CONNECTION_NAME" ]; then
    echo "Error: set CLOUD_SQL_CONNECTION_NAME (project:region:instance) in $ENV_FILE,"
    echo "  or set CLOUD_SQL_INSTANCE + GCS_BUCKET_NAME for gcloud sql export."
    exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1; then
    echo "Error: pg_dump not found on PATH. Install postgresql-client or use gcloud sql export."
    exit 1
fi

PROXY_PORT="${PROXY_PORT:-5433}"
PROXY_CONTAINER="exam-tools-cloud-sql-proxy-export-$$"
PROXY_WAIT_SECS="${PROXY_WAIT_SECS:-60}"

echo "Starting temporary Cloud SQL Auth Proxy for ${CONNECTION_NAME} on localhost:${PROXY_PORT} ..."
docker run -d --rm \
    --name "$PROXY_CONTAINER" \
    --network host \
    gcr.io/cloud-sql-connectors/cloud-sql-proxy:latest \
    --address=127.0.0.1 \
    --port="$PROXY_PORT" \
    "$CONNECTION_NAME"

cleanup() {
    docker stop "$PROXY_CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "Waiting for proxy on 127.0.0.1:${PROXY_PORT} (up to ${PROXY_WAIT_SECS}s) ..."
elapsed=0
until (echo >/dev/tcp/127.0.0.1/"$PROXY_PORT") >/dev/null 2>&1; do
    if ! docker inspect "$PROXY_CONTAINER" >/dev/null 2>&1; then
        echo "Error: proxy container exited early. Check: docker logs $PROXY_CONTAINER"
        exit 1
    fi
    elapsed=$((elapsed + 1))
    if [ "$elapsed" -ge "$PROXY_WAIT_SECS" ]; then
        echo "Error: proxy did not accept connections within ${PROXY_WAIT_SECS}s"
        docker logs "$PROXY_CONTAINER" || true
        exit 1
    fi
    sleep 1
done
echo "Proxy is ready."

export PGPASSWORD="${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"
echo "Dumping ${DB_NAME} via pg_dump -Fc -> ${OUT_FILE} ..."
pg_dump -Fc --no-owner --no-acl \
    -h 127.0.0.1 -p "$PROXY_PORT" -U "$DB_USER" -d "$DB_NAME" \
    -f "$OUT_FILE"

echo "Verifying dump ..."
pg_restore --list "$OUT_FILE" >/dev/null
(
    cd "$(dirname "$OUT_FILE")"
    sha256sum "$(basename "$OUT_FILE")" > "$(basename "$OUT_FILE").sha256"
)

echo "Done. Custom dump: $OUT_FILE"
echo "Checksum: ${OUT_FILE}.sha256"
echo "Import with: ./gcp/staging/scripts/import-postgres-dump.sh $OUT_FILE"
