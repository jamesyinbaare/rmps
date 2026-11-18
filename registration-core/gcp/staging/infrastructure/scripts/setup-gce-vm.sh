#!/bin/bash
# Script to set up GCE VM for registration portal staging deployment
# This script should be run on a new Ubuntu 22.04 LTS VM

set -e

echo "Setting up GCE VM for registration portal staging deployment..."

# Update system packages
echo "Updating system packages..."
sudo apt-get update
sudo apt-get upgrade -y

# Install Docker
echo "Installing Docker..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    rm get-docker.sh
else
    echo "Docker is already installed"
fi

# Install Docker Compose (plugin version)
echo "Installing Docker Compose..."
if ! command -v docker compose &> /dev/null; then
    sudo apt-get install -y docker-compose-plugin
else
    echo "Docker Compose is already installed"
fi

# Install gcloud CLI (if not present)
echo "Installing gcloud CLI..."
if ! command -v gcloud &> /dev/null; then
    echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" | sudo tee -a /etc/apt/sources.list.d/google-cloud-sdk.list
    curl https://packages.cloud.google.com/apt/doc/apt-key.gpg | sudo apt-key --keyring /usr/share/keyrings/cloud.google.gpg add -
    sudo apt-get update && sudo apt-get install -y google-cloud-cli
else
    echo "gcloud CLI is already installed"
fi

# Create necessary directories
echo "Creating necessary directories..."
mkdir -p ~/registration-portal/staging
mkdir -p ~/registration-portal/staging/storage
mkdir -p ~/registration-portal/staging/logs

# Set up firewall rules (if not already configured)
echo "Setting up firewall rules..."
# Note: These should ideally be set up via GCP Console or gcloud commands
# HTTP (80) and HTTPS (443) should be open for Let's Encrypt
# Traefik dashboard (8080) should be restricted to internal IP or VPN

echo "GCE VM setup complete!"
echo ""
echo "Next steps:"
echo "1. Configure GCP service account credentials"
echo "2. Set up firewall rules for ports 80, 443, and 8080"
echo "3. Clone the registration-portal repository"
echo "4. Copy .env.staging.gcp.example to .env.staging.gcp and configure"
echo "5. Run deployment script: ./gcp/staging/scripts/deploy.sh"
