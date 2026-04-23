#!/bin/bash
# Firewall rules for exam-tools staging VM (HTTP/HTTPS public; Traefik dashboard restricted)

set -e

PROJECT_ID="${GCP_PROJECT_ID:-your-project-id}"
NETWORK="${GCP_NETWORK:-default}"
TAGS="${VM_NETWORK_TAGS:-exam-portal-staging}"

echo "Creating firewall rules for exam-tools staging..."
echo "Project: $PROJECT_ID"
echo "Network: $NETWORK"
echo "Target tags: $TAGS"

echo "HTTP (80)..."
gcloud compute firewall-rules create allow-exam-tools-http \
    --project="$PROJECT_ID" \
    --network="$NETWORK" \
    --allow tcp:80 \
    --source-ranges 0.0.0.0/0 \
    --target-tags="$TAGS" \
    --description="HTTP for Let's Encrypt (exam-tools staging)" \
    || echo "Rule may already exist"

echo "HTTPS (443)..."
gcloud compute firewall-rules create allow-exam-tools-https \
    --project="$PROJECT_ID" \
    --network="$NETWORK" \
    --allow tcp:443 \
    --source-ranges 0.0.0.0/0 \
    --target-tags="$TAGS" \
    --description="HTTPS for exam-tools staging" \
    || echo "Rule may already exist"

SOURCE_RANGES="${INTERNAL_IP_RANGE:-10.0.0.0/8}"

echo "Traefik dashboard (8080) restricted to $SOURCE_RANGES..."
gcloud compute firewall-rules create allow-exam-tools-traefik-dashboard \
    --project="$PROJECT_ID" \
    --network="$NETWORK" \
    --allow tcp:8080 \
    --source-ranges "$SOURCE_RANGES" \
    --target-tags="$TAGS" \
    --description="Traefik dashboard (exam-tools staging)" \
    || echo "Rule may already exist"

echo "Firewall rules step finished."
