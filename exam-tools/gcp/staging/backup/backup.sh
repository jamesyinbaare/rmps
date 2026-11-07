#!/usr/bin/env bash
# Dump Postgres (custom format), verify, checksum, atomic GCS upload, prune old dumps.
set -euo pipefail

: "${PGHOST:?PGHOST is required}"
: "${PGUSER:?PGUSER is required}"
: "${PGPASSWORD:?PGPASSWORD is required}"
: "${PGDATABASE:?PGDATABASE is required}"
: "${GCS_BUCKET_NAME:?GCS_BUCKET_NAME is required}"

PGPORT="${PGPORT:-5432}"
DB_BACKUP_GCS_PREFIX="${DB_BACKUP_GCS_PREFIX:-exam-tools/db-backups}"
DB_BACKUP_RETENTION_DAYS="${DB_BACKUP_RETENTION_DAYS:-14}"
LOCK_FILE="${DB_BACKUP_LOCK_FILE:-/var/tmp/db-backup.lock}"
MARKER_FILE="${DB_BACKUP_MARKER_FILE:-/var/tmp/last-backup-ok}"

PREFIX="${DB_BACKUP_GCS_PREFIX#/}"
PREFIX="${PREFIX%/}"
GCS_URI="gs://${GCS_BUCKET_NAME}/${PREFIX}"

TIMESTAMP="$(date -u +%Y%m%d_%H%M%S)"
DUMP_NAME="${PGDATABASE}_${TIMESTAMP}.dump"
TMP_DIR="$(mktemp -d)"
DUMP_PATH="${TMP_DIR}/${DUMP_NAME}"
SHA_PATH="${TMP_DIR}/${DUMP_NAME}.sha256"

cleanup() {
    rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

# Exclusive lock so a slow dump cannot overlap the next cron tick.
exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
    echo "[db-backup] Another backup is already running (lock ${LOCK_FILE}); exiting."
    exit 0
fi

echo "[db-backup] Starting pg_dump of ${PGDATABASE}@${PGHOST}:${PGPORT} ..."
pg_dump -Fc --no-owner --no-acl -f "${DUMP_PATH}"

echo "[db-backup] Verifying dump with pg_restore --list ..."
pg_restore --list "${DUMP_PATH}" >/dev/null

echo "[db-backup] Writing SHA256 checksum ..."
(
    cd "${TMP_DIR}"
    sha256sum "${DUMP_NAME}" > "${DUMP_NAME}.sha256"
)

upload_atomic() {
    local local_path="$1"
    local object_name="$2"
    local final_uri="${GCS_URI}/${object_name}"
    local tmp_uri="${final_uri}.uploading"

    echo "[db-backup] Uploading ${object_name} (atomic) ..."
    gsutil -q cp "${local_path}" "${tmp_uri}"
    gsutil -q mv "${tmp_uri}" "${final_uri}"
}

upload_atomic "${DUMP_PATH}" "${DUMP_NAME}"
upload_atomic "${SHA_PATH}" "${DUMP_NAME}.sha256"
echo "[db-backup] Upload complete: ${GCS_URI}/${DUMP_NAME}"

prune_old_backups() {
    if ! [[ "${DB_BACKUP_RETENTION_DAYS}" =~ ^[0-9]+$ ]] || [[ "${DB_BACKUP_RETENTION_DAYS}" -le 0 ]]; then
        return 0
    fi
    echo "[db-backup] Pruning objects older than ${DB_BACKUP_RETENTION_DAYS} days under ${GCS_URI}/ ..."
    CUTOFF_EPOCH="$(date -u -d "${DB_BACKUP_RETENTION_DAYS} days ago" +%s)"

    if command -v gcloud >/dev/null 2>&1 && command -v python3 >/dev/null 2>&1; then
        local json stale
        json="$(gcloud storage ls --json "${GCS_URI}/**" 2>/dev/null || true)"
        if [[ -n "${json}" && "${json}" != "[]" ]]; then
            stale="$(CUTOFF_EPOCH="${CUTOFF_EPOCH}" python3 -c '
import json, os, datetime, sys
cutoff = int(os.environ["CUTOFF_EPOCH"])
raw = sys.stdin.read().strip()
if not raw:
    raise SystemExit(0)
try:
    data = json.loads(raw)
except json.JSONDecodeError:
    data = [json.loads(line) for line in raw.splitlines() if line.strip()]
if not isinstance(data, list):
    data = [data]
for obj in data:
    url = obj.get("url") or ""
    if not url and obj.get("name"):
        # Some shapes use bucket/name without gs://
        url = obj["name"] if str(obj["name"]).startswith("gs://") else ""
    if not url.endswith(".dump"):
        continue
    ts = obj.get("timeCreated") or obj.get("updated") or ""
    if not ts and isinstance(obj.get("metadata"), dict):
        ts = obj["metadata"].get("timeCreated") or obj["metadata"].get("updated") or ""
    if not ts:
        continue
    try:
        dt = datetime.datetime.fromisoformat(ts.replace("Z", "+00:00"))
        epoch = int(dt.timestamp())
    except Exception:
        continue
    if epoch < cutoff:
        print(url)
' <<<"${json}")"
            while IFS= read -r uri; do
                [[ -z "${uri}" ]] && continue
                echo "[db-backup] Deleting old backup ${uri}"
                gsutil -q rm "${uri}" || true
                gsutil -q rm "${uri}.sha256" 2>/dev/null || true
            done <<<"${stale}"
            return 0
        fi
    fi

    # Fallback: list dumps and use gsutil stat Update time
    local obj update_line update_ts obj_epoch
    while IFS= read -r obj; do
        [[ -z "${obj}" || "${obj}" != *.dump ]] && continue
        update_line="$(gsutil stat "${obj}" 2>/dev/null | grep -i 'Update time:' || true)"
        update_ts="$(echo "${update_line}" | sed -n 's/.*Update time:[[:space:]]*//p')"
        [[ -z "${update_ts}" ]] && continue
        obj_epoch="$(date -u -d "${update_ts}" +%s 2>/dev/null || true)"
        if [[ -n "${obj_epoch}" && "${obj_epoch}" -lt "${CUTOFF_EPOCH}" ]]; then
            echo "[db-backup] Deleting old backup ${obj}"
            gsutil -q rm "${obj}" || true
            gsutil -q rm "${obj}.sha256" 2>/dev/null || true
        fi
    done < <(gsutil ls "${GCS_URI}/*.dump" 2>/dev/null || true)
}

prune_old_backups

date -u +%Y-%m-%dT%H:%M:%SZ > "${MARKER_FILE}"
echo "[db-backup] Done. Marker written to ${MARKER_FILE}"
