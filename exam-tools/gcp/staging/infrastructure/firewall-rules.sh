#!/bin/bash
# Firewall rules for monitoring-tools staging VM (HTTP/HTTPS public; Traefik dashboard restricted)

set -e

PROJECT_ID="${GCP_PROJECT_ID:-your-project-id}"
NETWORK="${GCP_NETWORK:-default}"
TAGS="${VM_NETWORK_TAGS:-monitoring-tools-staging}"

echo "Creating firewall rules for monitoring-tools staging..."
echo "Project: $PROJECT_ID"
echo "Network: $NETWORK"
echo "Target tags: $TAGS"

echo "HTTP (80)..."
gcloud compute firewall-rules create allow-monitoring-tools-http \
    --project="$PROJECT_ID" \
    --network="$NETWORK" \
    --allow tcp:80 \
    --source-ranges 0.0.0.0/0 \
    --target-tags="$TAGS" \
    --description="HTTP for Let's Encrypt (monitoring-tools staging)" \
    || echo "Rule may already exist"

echo "HTTPS (443)..."
gcloud compute firewall-rules create allow-monitoring-tools-https \
    --project="$PROJECT_ID" \
    --network="$NETWORK" \
    --allow tcp:443 \
    --source-ranges 0.0.0.0/0 \
    --target-tags="$TAGS" \
    --description="HTTPS for monitoring-tools staging" \
    || echo "Rule may already exist"

SOURCE_RANGES="${INTERNAL_IP_RANGE:-10.0.0.0/8}"

echo "Traefik dashboard (8080) restricted to $SOURCE_RANGES..."
gcloud compute firewall-rules create allow-monitoring-tools-traefik-dashboard \
    --project="$PROJECT_ID" \
    --network="$NETWORK" \
    --allow tcp:8080 \
    --source-ranges "$SOURCE_RANGES" \
    --target-tags="$TAGS" \
    --description="Traefik dashboard (monitoring-tools staging)" \
    || echo "Rule may already exist"

echo "Firewall rules step finished."
