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
     --zone=us-central1-a \
     --machine-type=e2-medium \
     --image-family=ubuntu-2204-lts \
     --tags=registration-portal-staging
   ```

3. **Set up VM:**
   ```bash
   # SSH into VM
   gcloud compute ssh registration-portal-staging-vm --zone=us-central1-a

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

- **Swappable Services:**
  - Database: Local PostgreSQL ↔ Cloud SQL (via environment variable)
  - Storage: Local filesystem ↔ Cloud Storage (via `STORAGE_BACKEND`)

- **Starting Configuration:**
  - Local PostgreSQL container
  - Local file storage volumes
  - Traefik reverse proxy with Let's Encrypt
  - Docker Compose orchestration

- **Migration Path:**
  - Easy migration to Cloud SQL via Cloud SQL Proxy
  - Easy migration to Cloud Storage via environment variable
  - Rollback support for both services

## Key Files

- `compose.staging.gcp.yaml` - Docker Compose configuration for GCP staging
- `traefik/traefik.staging.yml` - Traefik static configuration
- `traefik/dynamic.staging.yml` - Traefik dynamic configuration
- `.env.staging.gcp.example` - Environment variables template

## Switching Services

### Switch to Cloud SQL

1. Create Cloud SQL instance
2. Update `.env.staging.gcp`:
   ```env
   USE_CLOUD_SQL=true
   CLOUD_SQL_CONNECTION_NAME=project-id:region:instance
   DATABASE_URL=postgresql+asyncpg://user:pass@cloud-sql-proxy-staging:5432/dbname
   ```
3. Start with Cloud SQL profile:
   ```bash
   docker compose -f compose.staging.gcp.yaml --profile cloud-sql up -d
   ```

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
