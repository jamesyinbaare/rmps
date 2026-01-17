#!/bin/bash
# Script to migrate local file storage to Google Cloud Storage
# This script uploads all files from local storage directories to GCS bucket

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Load environment variables
ENV_FILE="${ENV_FILE:-.env.staging.gcp}"
if [ -f "$PROJECT_ROOT/$ENV_FILE" ]; then
    set -a
    source "$PROJECT_ROOT/$ENV_FILE"
    set +a
fi

GCS_BUCKET="${GCS_BUCKET_NAME:-registration-portal-staging-files}"
STORAGE_PATH="${STORAGE_PATH:-storage}"

if [ -z "$GCS_BUCKET" ] || [ "$GCS_BUCKET" = "registration-portal-staging-files" ]; then
    echo "Error: GCS_BUCKET_NAME not set in environment"
    echo "Please set GCS_BUCKET_NAME in $ENV_FILE or export it"
    exit 1
fi

cd "$PROJECT_ROOT"

echo "Migrating local storage to Google Cloud Storage..."
echo "Source: $STORAGE_PATH"
echo "Destination: gs://$GCS_BUCKET"
echo ""

# Check if gsutil is available
if ! command -v gsutil &> /dev/null; then
    echo "Error: gsutil not found. Install Google Cloud SDK:"
    echo "  gcloud components install gsutil"
    exit 1
fi

# Check if bucket exists
if ! gsutil ls -b "gs://$GCS_BUCKET" > /dev/null 2>&1; then
    echo "Bucket $GCS_BUCKET does not exist. Creating..."
    gsutil mb -l "${GCS_BUCKET_LOCATION:-us-central1}" "gs://$GCS_BUCKET"
    echo "Bucket created: gs://$GCS_BUCKET"
fi

# Storage directories to migrate
STORAGE_DIRS=(
    "storage/documents"
    "storage/photos"
    "storage/exports"
    "storage/certificate_requests"
)

# Migrate each directory
for dir in "${STORAGE_DIRS[@]}"; do
    if [ -d "$dir" ] && [ "$(ls -A $dir 2>/dev/null)" ]; then
        echo "Migrating $dir to gs://$GCS_BUCKET/$dir..."
        gsutil -m rsync -r "$dir" "gs://$GCS_BUCKET/$dir"
        echo "Completed: $dir"
    else
        echo "Skipping empty or non-existent directory: $dir"
    fi
done

echo ""
echo "Storage migration complete!"
echo ""
echo "Next steps:"
echo "1. Verify files in GCS: gsutil ls -r gs://$GCS_BUCKET"
echo "2. Update .env.staging.gcp:"
echo "   STORAGE_BACKEND=gcs"
echo "   GCS_BUCKET_NAME=$GCS_BUCKET"
echo "3. Restart backend service:"
echo "   docker compose -f compose.staging.gcp.yaml restart registration-backend"
