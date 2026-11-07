#!/bin/bash
# Deployment script for exam-tools staging on GCP (dedicated VM + Docker Compose + Traefik)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
ENV_FILE="${ENV_FILE:-.env.staging.gcp}"

cd "$PROJECT_ROOT"

echo "Starting deployment for exam-tools staging..."
echo "Project root: $PROJECT_ROOT"
echo "Environment file: $ENV_FILE"

if [ ! -f "$ENV_FILE" ]; then
    echo "Error: Environment file $ENV_FILE not found"
    echo "Please copy .env.staging.gcp.example to $ENV_FILE and configure it"
    exit 1
fi

echo "Loading environment variables from $ENV_FILE..."
set -a
source "$ENV_FILE"
set +a

if [ -z "${POSTGRES_USER:-}" ] || [ -z "${POSTGRES_PASSWORD:-}" ]; then
    echo "Error: POSTGRES_USER and POSTGRES_PASSWORD must be set in $ENV_FILE"
    exit 1
fi

if [ -z "${DATABASE_URL:-}" ]; then
    echo "Error: DATABASE_URL is not set in $ENV_FILE"
    exit 1
fi

if ! echo "$DATABASE_URL" | grep -q "@tools_postgres:"; then
    echo "Error: DATABASE_URL host must be tools_postgres (Compose Postgres service)."
    echo "  Example: postgresql+asyncpg://USER:PASSWORD@tools_postgres:5432/exam_tools_db"
    exit 1
fi

if [ -z "${GCS_BUCKET_NAME:-}" ]; then
    echo "Error: GCS_BUCKET_NAME is not set in $ENV_FILE (required for document storage and DB backups)"
    exit 1
fi

export COMPOSE_FILE="${COMPOSE_FILE:-compose.staging.gcp.yaml}"
echo "Compose file: $COMPOSE_FILE"

POSTGRES_DATA_DIR="${POSTGRES_DATA_DIR:-/var/lib/exam-tools/postgres}"
export POSTGRES_DATA_DIR
echo "Postgres data directory (persists across rebuilds): $POSTGRES_DATA_DIR"
mkdir -p "$POSTGRES_DATA_DIR"

dc() {
    # Never pass -v / --volumes here: named volumes for Traefik must stay, and
    # Postgres uses a host bind mount that down -v would not wipe anyway—but we
    # still refuse -v so operators cannot accidentally wipe other project state.
    for arg in "$@"; do
        if [ "$arg" = "-v" ] || [ "$arg" = "--volumes" ]; then
            echo "Error: deploy.sh refuses docker compose ... -v/--volumes (would risk wiping project volumes)."
            exit 1
        fi
    done
    docker compose --env-file "$ENV_FILE" "$@"
}

echo "Stopping existing services (containers only; Postgres data dir kept)..."
# Intentionally no -v: host bind mount at POSTGRES_DATA_DIR survives this.
dc down || true

echo "Building Docker images..."
dc build

echo "Pulling latest images (non-fatal if none)..."
dc pull || true

echo "Starting services..."
dc up -d

echo "Waiting for tools_postgres to become healthy..."
PG_RETRIES=36
PG_COUNT=0
while [ $PG_COUNT -lt $PG_RETRIES ]; do
    if dc exec -T tools_postgres pg_isready -U "${POSTGRES_USER}" -d "${POSTGRES_DB:-exam_tools_db}" >/dev/null 2>&1; then
        echo "tools_postgres is ready."
        break
    fi
    PG_COUNT=$((PG_COUNT + 1))
    echo "Waiting for Postgres... ($PG_COUNT/$PG_RETRIES)"
    sleep 5
done
if [ $PG_COUNT -eq $PG_RETRIES ]; then
    echo "Warning: tools_postgres not ready after retries; continuing health checks."
fi

echo "Waiting for db-backup health (initial dump + marker; may take several minutes)..."
BACKUP_RETRIES=36
BACKUP_COUNT=0
while [ $BACKUP_COUNT -lt $BACKUP_RETRIES ]; do
    HEALTH="$(docker inspect --format='{{.State.Health.Status}}' monitoring-tools-db-backup-staging 2>/dev/null || echo missing)"
    if [ "$HEALTH" = "healthy" ]; then
        echo "db-backup is healthy."
        break
    fi
    BACKUP_COUNT=$((BACKUP_COUNT + 1))
    echo "Waiting for db-backup... status=${HEALTH} ($BACKUP_COUNT/$BACKUP_RETRIES)"
    sleep 10
done
if [ $BACKUP_COUNT -eq $BACKUP_RETRIES ]; then
    echo "Warning: db-backup not healthy after retries. Check: dc logs db-backup"
fi

echo "Waiting for backend to become healthy..."
sleep 5

echo "Checking service status..."
dc ps

echo "Verifying backend health..."
MAX_RETRIES=30
RETRY_COUNT=0
API_DOMAIN="${STAGING_API_DOMAIN:-monitoring-api.jamesyin.com}"
FRONTEND_DOMAIN="${STAGING_FRONTEND_DOMAIN:-monitoring.jamesyin.com}"

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -fsS "https://${API_DOMAIN}/health" > /dev/null 2>&1; then
        echo "Backend is healthy!"
        break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo "Waiting for backend... ($RETRY_COUNT/$MAX_RETRIES)"
    sleep 5
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo "Warning: Backend health check failed after $MAX_RETRIES retries"
    echo "Check logs with: dc logs exam-tools-backend"
fi

echo "Verifying frontend..."
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -fsS "https://${FRONTEND_DOMAIN}/" > /dev/null 2>&1; then
        echo "Frontend is reachable!"
        break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo "Waiting for frontend... ($RETRY_COUNT/$MAX_RETRIES)"
    sleep 5
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo "Warning: Frontend check failed after $MAX_RETRIES retries"
    echo "Check logs with: dc logs exam-tools-frontend"
fi

echo ""
echo "Deployment complete!"
echo ""
echo "Services:"
echo "  - Frontend: https://${FRONTEND_DOMAIN}"
echo "  - Backend API: https://${API_DOMAIN}"
echo "  - Traefik dashboard (if configured): port 8080 on this host (restrict via firewall)"
echo "  - Postgres data: ${POSTGRES_DATA_DIR}"
echo ""
echo "View logs:"
echo "  docker compose --env-file $ENV_FILE -f $COMPOSE_FILE logs -f"
