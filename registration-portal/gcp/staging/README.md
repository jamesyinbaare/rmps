# GCP Staging Deployment

This directory contains configuration and scripts for deploying the registration portal to GCP staging environment.

## Quick Start

1. **Set up GCP project and infrastructure:**
   ```bash
   # Create project and enable APIs
   gcloud projects create registration-portal-staging
   gcloud config set project registration-portal-staging

   # Run infrastructure setup (see infrastructure/scripts/)
   ```

2. **Create GCE VM:**
   ```bash
   gcloud compute instances create registration-portal-staging-vm \
     --zone=europe-west9-a \
     --machine-type=e2-medium \
     --image-family=ubuntu-2204-lts \
     --tags=registration-portal-staging
   ```

3. **Set up VM:**
   ```bash
   # SSH into VM
   gcloud compute ssh registration-portal-staging-vm --zone=europe-west9-a

   # Clone repository and run setup script
   ./gcp/staging/infrastructure/scripts/setup-gce-vm.sh
   ```

4. **Configure environment:**
   ```bash
   cp .env.staging.gcp.example .env.staging.gcp
   # Edit .env.staging.gcp with your values
   ```

5. **Set up secrets:**
   ```bash
   export GCP_PROJECT_ID=registration-portal-staging
   ./gcp/staging/scripts/setup-secrets.sh
   ```

6. **Deploy:**
   ```bash
   ./gcp/staging/scripts/deploy.sh
   ```

## Directory Structure

```
gcp/staging/
├── infrastructure/
│   ├── scripts/
│   │   └── setup-gce-vm.sh       # VM setup script
│   └── firewall-rules.sh          # Firewall configuration
├── scripts/
│   ├── deploy.sh                  # Main deployment script
│   ├── setup-secrets.sh           # Secret Manager setup
│   └── migrate-storage-to-gcs.sh  # Storage migration script
├── config/
│   └── load-secrets.sh            # Load secrets from Secret Manager
└── README.md                      # This file
```

## Documentation

- [Deployment Guide](../../docs/gcp-staging-deployment.md) - Complete deployment instructions
- [Migration Guide](../../docs/gcp-staging-migration.md) - Migrating to Cloud SQL and GCS
- [Environment Variables Reference](../../docs/gcp-staging-env-vars.md) - All environment variables

## Features

- **Database:** Cloud SQL only (via Cloud SQL Proxy container)
- **Storage:** Local filesystem or GCS (via `STORAGE_BACKEND`)
- **Reverse proxy:** Traefik with Let's Encrypt
- **Orchestration:** Docker Compose

## Key Files

- `compose.staging.gcp.yaml` - Docker Compose configuration for GCP staging
- `traefik/traefik.staging.yml` - Traefik static configuration
- `traefik/dynamic.staging.yml` - Traefik dynamic configuration
- `.env.staging.gcp.example` - Environment variables template

## Switching Services

### Switch to Cloud Storage

1. Create GCS bucket
2. Migrate existing files: `./gcp/staging/scripts/migrate-storage-to-gcs.sh`
3. Update `.env.staging.gcp`:
   ```env
   STORAGE_BACKEND=gcs
   GCS_BUCKET_NAME=your-bucket-name
   GCS_PROJECT_ID=your-project-id
   ```
4. Restart backend:
   ```bash
   docker compose -f compose.staging.gcp.yaml restart registration-backend-staging
   ```

See [Migration Guide](../../docs/gcp-staging-migration.md) for detailed steps.
