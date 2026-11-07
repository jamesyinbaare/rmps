#!/bin/bash
# Apply a GCS lifecycle rule that deletes exam-tools DB backup objects after N days.
# Belt-and-suspenders alongside the db-backup container prune.
#
# Usage (from exam-tools repo root):
#   ./gcp/staging/scripts/ensure-db-backup-lifecycle.sh
#   DB_BACKUP_RETENTION_DAYS=14 GCS_BUCKET_NAME=my-bucket ./gcp/staging/scripts/ensure-db-backup-lifecycle.sh

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

: "${GCS_BUCKET_NAME:?GCS_BUCKET_NAME is required}"
PREFIX="${DB_BACKUP_GCS_PREFIX:-exam-tools/db-backups}"
PREFIX="${PREFIX#/}"
PREFIX="${PREFIX%/}"
DAYS="${DB_BACKUP_RETENTION_DAYS:-14}"

if ! [[ "${DAYS}" =~ ^[0-9]+$ ]] || [[ "${DAYS}" -le 0 ]]; then
    echo "Error: DB_BACKUP_RETENTION_DAYS must be a positive integer (got: ${DAYS})"
    exit 1
fi

if ! command -v gcloud >/dev/null 2>&1; then
    echo "Error: gcloud not found. Install Google Cloud SDK."
    exit 1
fi

TMP_JSON="$(mktemp)"
trap 'rm -f "$TMP_JSON"' EXIT

# Matches objects under the backup prefix (dumps + checksums + .uploading leftovers).
cat >"$TMP_JSON" <<EOF
{
  "rule": [
    {
      "action": {"type": "Delete"},
      "condition": {
        "age": ${DAYS},
        "matchesPrefix": ["${PREFIX}/"]
      }
    }
  ]
}
EOF

echo "Setting lifecycle on gs://${GCS_BUCKET_NAME} (delete age=${DAYS}d, prefix=${PREFIX}/) ..."
echo "Note: gcloud storage buckets update --lifecycle-file replaces the bucket lifecycle config."
echo "Merge manually if this bucket already has other lifecycle rules."
gcloud storage buckets update "gs://${GCS_BUCKET_NAME}" --lifecycle-file="$TMP_JSON" \
    ${GCP_PROJECT_ID:+--project="$GCP_PROJECT_ID"}

echo "Done. Verify with:"
echo "  gcloud storage buckets describe gs://${GCS_BUCKET_NAME} --format='yaml(lifecycle_config)'"
