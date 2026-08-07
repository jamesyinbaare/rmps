#!/bin/bash
# Script to create firewall rules for SEMS staging on sems-vm
# Run this script with appropriate GCP project and network settings

set -e

PROJECT_ID="${GCP_PROJECT_ID:-your-project-id}"
NETWORK="${GCP_NETWORK:-default}"
TAGS="${VM_NETWORK_TAGS:-sems-staging}"

echo "Creating firewall rules for SEMS staging..."
echo "Project: $PROJECT_ID"
echo "Network: $NETWORK"
echo "Target tags: $TAGS"

# HTTP (80) - Open for Let's Encrypt
echo "Creating HTTP (80) firewall rule..."
gcloud compute firewall-rules create allow-sems-http \
    --project="$PROJECT_ID" \
    --network="$NETWORK" \
    --allow tcp:80 \
    --source-ranges 0.0.0.0/0 \
    --target-tags="$TAGS" \
    --description="Allow HTTP traffic for Let's Encrypt certificates (SEMS)" \
    || echo "Firewall rule may already exist"

# HTTPS (443) - Open for public access
echo "Creating HTTPS (443) firewall rule..."
gcloud compute firewall-rules create allow-sems-https \
    --project="$PROJECT_ID" \
    --network="$NETWORK" \
    --allow tcp:443 \
    --source-ranges 0.0.0.0/0 \
    --target-tags="$TAGS" \
    --description="Allow HTTPS traffic for SEMS" \
    || echo "Firewall rule may already exist"

# Traefik Dashboard (8080) - Restricted
SOURCE_RANGES="${INTERNAL_IP_RANGE:-10.0.0.0/8}"

echo "Creating Traefik Dashboard (8080) firewall rule (restricted to $SOURCE_RANGES)..."
gcloud compute firewall-rules create allow-sems-traefik-dashboard \
    --project="$PROJECT_ID" \
    --network="$NETWORK" \
    --allow tcp:8080 \
    --source-ranges "$SOURCE_RANGES" \
    --target-tags="$TAGS" \
    --description="Allow Traefik dashboard access from internal networks only (SEMS)" \
    || echo "Firewall rule may already exist"

echo ""
echo "Firewall rules created successfully!"
echo ""
echo "Ensure sems-vm has network tag: $TAGS"
echo "Note: Update SOURCE_RANGES (INTERNAL_IP_RANGE) for Traefik dashboard to match your VPN or bastion."
