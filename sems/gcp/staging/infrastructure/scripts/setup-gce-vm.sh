#!/bin/bash
# Script to set up GCE VM (sems-vm) for SEMS staging deployment
# This script should be run on a new Ubuntu 22.04 LTS VM

set -e

echo "Setting up GCE VM for SEMS staging deployment..."

# Update system packages
echo "Updating system packages..."
sudo apt-get update
sudo apt-get upgrade -y

# Install Docker
echo "Installing Docker..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker "$USER"
    rm get-docker.sh
else
    echo "Docker is already installed"
fi

# Install Docker Compose (plugin version)
echo "Installing Docker Compose..."
if ! docker compose version &> /dev/null; then
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
mkdir -p ~/sems/staging
mkdir -p ~/sems/staging/logs

echo "GCE VM setup complete!"
echo ""
echo "Next steps:"
echo "1. Log out and back in (or newgrp docker) so docker group membership applies"
echo "2. Ensure VM service account has roles/cloudsql.client and storage.objectAdmin"
echo "3. Apply firewall rules: gcp/staging/infrastructure/firewall-rules.sh (tag sems-staging)"
echo "4. Clone the repository (or sync sems/) onto this VM"
echo "5. Copy .env.staging.gcp.example to .env.staging.gcp and configure"
echo "6. Run: ./gcp/staging/scripts/deploy.sh"
