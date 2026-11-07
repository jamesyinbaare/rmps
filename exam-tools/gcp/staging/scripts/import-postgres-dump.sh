#!/bin/bash
# Restore a dump into the Compose Postgres service (tools_postgres).
# Stops db-backup + backend during restore so an empty/mid-restore dump is not uploaded.
#
# Usage (from exam-tools repo root, stack already up):
#   ./gcp/staging/scripts/import-postgres-dump.sh ./backups/exam_tools_db_YYYYMMDD.dump
#   ./gcp/staging/scripts/import-postgres-dump.sh ./backups/exam_tools_db_YYYYMMDD.sql

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
ENV_FILE="${ENV_FILE:-.env.staging.gcp}"
COMPOSE_FILE="${COMPOSE_FILE:-compose.staging.gcp.yaml}"

if [ $# -lt 1 ]; then
    echo "Usage: $0 <dump-file.dump|.sql>"
    exit 1
fi

DUMP_FILE="$1"
if [ ! -f "$DUMP_FILE" ]; then
    echo "Error: dump file not found: $DUMP_FILE"
    exit 1
fi

cd "$PROJECT_ROOT"

if [ ! -f "$ENV_FILE" ]; then
    echo "Error: Environment file $ENV_FILE not found"
    exit 1
fi

set -a
# shellcheck source=/dev/null
source "$ENV_FILE"
set +a

DB_NAME="${POSTGRES_DB:-exam_tools_db}"
DB_USER="${POSTGRES_USER:?POSTGRES_USER is required}"
CONTAINER="${POSTGRES_CONTAINER:-monitoring-tools-postgres-staging}"

dc() {
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
    echo "Error: Postgres container '$CONTAINER' is not running."
    echo "Start the stack first: ./gcp/staging/scripts/deploy.sh"
    exit 1
fi

ABS_DUMP="$(cd "$(dirname "$DUMP_FILE")" && pwd)/$(basename "$DUMP_FILE")"
BASENAME="$(basename "$ABS_DUMP")"
SHA_FILE="${ABS_DUMP}.sha256"

if [ -f "$SHA_FILE" ]; then
    echo "Verifying SHA256 for $BASENAME ..."
    (
        cd "$(dirname "$ABS_DUMP")"
        sha256sum -c "$(basename "$SHA_FILE")"
    )
else
    echo "Warning: no ${BASENAME}.sha256 next to dump; skipping checksum verify."
fi

echo "Stopping db-backup and backend during restore (avoid publishing empty mid-cutover dumps) ..."
dc stop db-backup monitoring-tools-backend || true

restore_started=1
restart_services() {
    if [ "${restore_started:-0}" -eq 1 ]; then
        echo "Starting backend and db-backup ..."
        dc start monitoring-tools-backend db-backup || true
    fi
}
trap restart_services EXIT

echo "Copying dump into $CONTAINER ..."
docker cp "$ABS_DUMP" "$CONTAINER:/tmp/$BASENAME"

case "$BASENAME" in
    *.sql)
        echo "Restoring SQL dump into ${DB_NAME} ..."
        docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$CONTAINER" \
            psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "/tmp/$BASENAME"
        ;;
    *.dump|*.backup|*.fc)
        echo "Restoring custom-format dump into ${DB_NAME} ..."
        set +e
        docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$CONTAINER" \
            pg_restore --no-owner --no-acl --clean --if-exists \
            -U "$DB_USER" -d "$DB_NAME" "/tmp/$BASENAME"
        rc=$?
        set -e
        # pg_restore exits 1 when some objects warn; >1 is a hard failure
        if [ "$rc" -gt 1 ]; then
            echo "Error: pg_restore failed with exit code $rc"
            docker exec "$CONTAINER" rm -f "/tmp/$BASENAME"
            exit "$rc"
        fi
        ;;
    *)
        echo "Error: unknown dump type (use .dump / .fc / .sql): $BASENAME"
        docker exec "$CONTAINER" rm -f "/tmp/$BASENAME"
        exit 1
        ;;
esac

docker exec "$CONTAINER" rm -f "/tmp/$BASENAME"

echo "Validating restored schema ..."
TABLE_COUNT="$(docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$CONTAINER" \
    psql -U "$DB_USER" -d "$DB_NAME" -Atc "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';")"
echo "Public tables: ${TABLE_COUNT}"
if ! [[ "${TABLE_COUNT}" =~ ^[0-9]+$ ]] || [[ "${TABLE_COUNT}" -le 0 ]]; then
    echo "Error: restore produced zero public tables; refusing to declare success."
    exit 1
fi

ALEMBIC_COUNT="$(docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$CONTAINER" \
    psql -U "$DB_USER" -d "$DB_NAME" -Atc "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'alembic_version';" 2>/dev/null || echo 0)"
if [[ "${ALEMBIC_COUNT}" == "1" ]]; then
    docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$CONTAINER" \
        psql -U "$DB_USER" -d "$DB_NAME" -c "SELECT * FROM alembic_version;"
fi

echo ""
echo "Restore complete."
