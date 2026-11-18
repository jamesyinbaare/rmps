#!/bin/bash
# Deployment script for registration portal staging on GCP
# Rolling update with local health gates (no full stack teardown)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
ENV_FILE="${ENV_FILE:-.env.staging.gcp}"
SKIP_BUILD="${SKIP_BUILD:-0}"

cd "$PROJECT_ROOT"

echo "Starting deployment for registration portal staging..."
echo "Project root: $PROJECT_ROOT"
echo "Environment file: $ENV_FILE"

if [ ! -f "$ENV_FILE" ]; then
    echo "Error: Environment file $ENV_FILE not found"
    echo "Please copy .env.staging.gcp.example to $ENV_FILE and configure it"
    exit 1
fi

if [ -f "gcp/staging/config/load-secrets.sh" ]; then
    echo "Loading secrets from GCP Secret Manager..."
    # shellcheck source=/dev/null
    source gcp/staging/config/load-secrets.sh
fi

echo "Loading environment variables from $ENV_FILE..."
set -a
# shellcheck source=/dev/null
source "$ENV_FILE"
set +a

export COMPOSE_FILE="${COMPOSE_FILE:-compose.staging.gcp.yaml}"
STAGING_FRONTEND_DOMAIN="${STAGING_FRONTEND_DOMAIN:-reg.ctvetlabs.com}"
STAGING_API_DOMAIN="${STAGING_API_DOMAIN:-reg-api.ctvetlabs.com}"

echo "Compose file: $COMPOSE_FILE"
echo "Frontend domain: $STAGING_FRONTEND_DOMAIN"
echo "API domain: $STAGING_API_DOMAIN"

dc() {
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

container_running() {
    local service="$1"
    local cid
    cid="$(dc ps -q "$service" 2>/dev/null || true)"
    if [ -z "$cid" ]; then
        return 1
    fi
    local status
    status="$(docker inspect -f '{{.State.Status}}' "$cid" 2>/dev/null || echo "unknown")"
    [ "$status" = "running" ]
}

dump_failure_logs() {
    echo ""
    echo "===== deploy failure diagnostics ====="
    dc ps || true
    echo ""
    echo "--- cloud-sql-proxy (tail) ---"
    dc logs --tail=80 cloud-sql-proxy || true
    echo ""
    echo "--- registration-backend (tail) ---"
    dc logs --tail=120 registration-backend || true
    echo ""
    echo "--- registration-frontend (tail) ---"
    dc logs --tail=80 registration-frontend || true
    echo ""
    echo "--- traefik (tail) ---"
    dc logs --tail=80 traefik || true
    echo "===== end diagnostics ====="
}

wait_for_proxy() {
    local max_attempts="${1:-15}"
    local attempt=0
    echo "Waiting for Cloud SQL proxy..."
    while [ "$attempt" -lt "$max_attempts" ]; do
        if container_running cloud-sql-proxy; then
            echo "Cloud SQL proxy is running."
            return 0
        fi
        attempt=$((attempt + 1))
        echo "  Waiting for proxy... ($attempt/$max_attempts)"
        sleep 2
    done
    return 1
}

wait_for_backend_http() {
    local max_attempts="${1:-30}"
    local attempt=0
    echo "Waiting for backend /health..."
    while [ "$attempt" -lt "$max_attempts" ]; do
        if container_running registration-backend && \
            dc exec -T registration-backend \
                python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:80/health')" \
                >/dev/null 2>&1; then
            echo "Backend is healthy."
            return 0
        fi
        attempt=$((attempt + 1))
        echo "  Waiting for backend... ($attempt/$max_attempts)"
        sleep 2
    done
    return 1
}

wait_for_frontend_http() {
    local max_attempts="${1:-30}"
    local attempt=0
    echo "Waiting for frontend..."
    while [ "$attempt" -lt "$max_attempts" ]; do
        if container_running registration-frontend && \
            dc exec -T registration-frontend \
                wget --spider --no-verbose --tries=1 http://127.0.0.1:3001/ \
                >/dev/null 2>&1; then
            echo "Frontend is healthy."
            return 0
        fi
        attempt=$((attempt + 1))
        echo "  Waiting for frontend... ($attempt/$max_attempts)"
        sleep 2
    done
    return 1
}

# Rolling update: rebuild changed images and recreate containers (keep volumes)
if [ "$SKIP_BUILD" = "1" ]; then
    echo "SKIP_BUILD=1 — starting without rebuild..."
    dc up -d --remove-orphans
else
    echo "Building and starting services (rolling update)..."
    dc up -d --build --remove-orphans
fi

if ! wait_for_proxy 15; then
    echo "Error: Cloud SQL proxy did not become ready."
    dump_failure_logs
    exit 1
fi

if ! wait_for_backend_http 30; then
    echo "Error: Backend did not become healthy."
    dump_failure_logs
    exit 1
fi

if ! wait_for_frontend_http 30; then
    echo "Error: Frontend did not become healthy."
    dump_failure_logs
    exit 1
fi

echo ""
echo "Service status:"
dc ps

# Optional public smoke (DNS/certs may lag — warn only)
echo ""
echo "Optional public smoke checks..."
if curl -f -k -sS --max-time 5 "https://${STAGING_API_DOMAIN}/health" >/dev/null 2>&1; then
    echo "Public API https://${STAGING_API_DOMAIN}/health OK"
else
    echo "Warning: public API not reachable yet (DNS/TLS may still be provisioning)"
fi
if curl -f -k -sS --max-time 5 -o /dev/null "https://${STAGING_FRONTEND_DOMAIN}/"; then
    echo "Public frontend https://${STAGING_FRONTEND_DOMAIN}/ OK"
else
    echo "Warning: public frontend not reachable yet (DNS/TLS may still be provisioning)"
fi

echo ""
echo "Deployment complete!"
echo ""
echo "Services:"
echo "  - Frontend: https://${STAGING_FRONTEND_DOMAIN}"
echo "  - Backend API: https://${STAGING_API_DOMAIN}"
echo "  - Traefik Dashboard: http://$(hostname -I 2>/dev/null | awk '{print $1}'):8080"
echo ""
echo "View logs:"
echo "  docker compose --env-file $ENV_FILE -f $COMPOSE_FILE logs -f"
echo ""
echo "Config-only restart next time: SKIP_BUILD=1 $0"
