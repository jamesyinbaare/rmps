#!/bin/bash
# Deployment script for registration portal staging on GCP
# This script builds, deploys, and verifies the application

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="${ENV_FILE:-.env.staging.gcp}"
COMPOSE_FILE="${COMPOSE_FILE:-compose.staging.gcp.yaml}"

cd "$PROJECT_ROOT"

echo "Starting deployment for registration portal staging..."
echo "Project root: $PROJECT_ROOT"
echo "Environment file: $ENV_FILE"
echo "Compose file: $COMPOSE_FILE"

# Check if environment file exists
if [ ! -f "$ENV_FILE" ]; then
    echo "Error: Environment file $ENV_FILE not found"
    echo "Please copy .env.staging.gcp.example to $ENV_FILE and configure it"
    exit 1
fi

# Load secrets from GCP Secret Manager (if script exists)
if [ -f "gcp/staging/config/load-secrets.sh" ]; then
    echo "Loading secrets from GCP Secret Manager..."
    source gcp/staging/config/load-secrets.sh
fi

# Load environment variables
echo "Loading environment variables from $ENV_FILE..."
set -a
source "$ENV_FILE"
set +a

# Stop existing services (if running)
echo "Stopping existing services..."
docker compose -f "$COMPOSE_FILE" down || true

# Build images
echo "Building Docker images..."
docker compose -f "$COMPOSE_FILE" build

# Pull latest images (if using pre-built images)
echo "Pulling latest images..."
docker compose -f "$COMPOSE_FILE" pull || true

# Run database migrations (if not using Cloud SQL)
if [ "${USE_CLOUD_SQL:-false}" != "true" ]; then
    echo "Running database migrations..."
    docker compose -f "$COMPOSE_FILE" run --rm registration-backend alembic upgrade head || echo "Migration failed or already up to date"
fi

# Start services
echo "Starting services..."
docker compose -f "$COMPOSE_FILE" up -d

# Wait for services to be healthy
echo "Waiting for services to be healthy..."
sleep 10

# Check service health
echo "Checking service health..."
docker compose -f "$COMPOSE_FILE" ps

# Verify backend health
echo "Verifying backend health..."
MAX_RETRIES=30
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -f -k "https://${STAGING_API_DOMAIN:-staging-api.yourdomain.com}/health" > /dev/null 2>&1; then # TODO: Change to the actual domain
        echo "Backend is healthy!"
        break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo "Waiting for backend... ($RETRY_COUNT/$MAX_RETRIES)"
    sleep 5
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo "Warning: Backend health check failed after $MAX_RETRIES retries"
    echo "Check logs with: docker compose -f $COMPOSE_FILE logs registration-backend"
fi

# Verify frontend health
echo "Verifying frontend health..."
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -f -k "https://${STAGING_FRONTEND_DOMAIN:-staging.yourdomain.com}/" > /dev/null 2>&1; then # TODO: Change to the actual domain
        echo "Frontend is healthy!"
        break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo "Waiting for frontend... ($RETRY_COUNT/$MAX_RETRIES)"
    sleep 5
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo "Warning: Frontend health check failed after $MAX_RETRIES retries"
    echo "Check logs with: docker compose -f $COMPOSE_FILE logs registration-frontend"
fi

echo ""
echo "Deployment complete!"
echo ""
echo "Services:"
echo "  - Frontend: https://${STAGING_FRONTEND_DOMAIN:-staging.yourdomain.com}" # TODO: Change to the actual domain
echo "  - Backend API: https://${STAGING_API_DOMAIN:-staging-api.yourdomain.com}" # TODO: Change to the actual domain
echo "  - Traefik Dashboard: http://$(hostname -I | awk '{print $1}'):8080"
echo ""
echo "View logs:"
echo "  docker compose -f $COMPOSE_FILE logs -f"
