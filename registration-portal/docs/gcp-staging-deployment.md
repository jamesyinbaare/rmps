# GCP Staging Deployment Guide

Complete guide for deploying the registration portal to GCP staging environment.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [GCP Project Setup](#gcp-project-setup)
3. [Infrastructure Provisioning](#infrastructure-provisioning)
4. [Application Deployment](#application-deployment)
5. [Environment Configuration](#environment-configuration)
6. [Monitoring and Logging](#monitoring-and-logging)
7. [Troubleshooting](#troubleshooting)

## Prerequisites

- GCP account with billing enabled
- GCP project created
- `gcloud` CLI installed and authenticated
- Domain name configured (for Let's Encrypt certificates)
- Docker and Docker Compose installed (on local machine for building)

## GCP Project Setup

### 1. Create GCP Project

```bash
gcloud projects create registration-portal-staging \
  --name="Registration Portal Staging"

gcloud config set project registration-portal-staging
```

### 2. Enable Required APIs

```bash
gcloud services enable compute.googleapis.com
gcloud services enable sqladmin.googleapis.com
gcloud services enable storage-component.googleapis.com
gcloud services enable secretmanager.googleapis.com
gcloud services enable logging.googleapis.com
gcloud services enable monitoring.googleapis.com
```

### 3. Create Service Account

```bash
# Create service account
gcloud iam service-accounts create registration-portal-sa \
  --display-name="Registration Portal Service Account"

# Grant necessary roles
gcloud projects add-iam-policy-binding registration-portal-staging \
  --member="serviceAccount:registration-portal-sa@registration-portal-staging.iam.gserviceaccount.com" \
  --role="roles/cloudsql.client"

gcloud projects add-iam-policy-binding registration-portal-staging \
  --member="serviceAccount:registration-portal-sa@registration-portal-staging.iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"

gcloud projects add-iam-policy-binding registration-portal-staging \
  --member="serviceAccount:registration-portal-sa@registration-portal-staging.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

# Create and download key
gcloud iam service-accounts keys create service-account-key.json \
  --iam-account=registration-portal-sa@registration-portal-staging.iam.gserviceaccount.com
```

## Infrastructure Provisioning

### 1. Create GCE VM

```bash
gcloud compute instances create registration-portal-staging-vm \
  --zone=us-central1-a \
  --machine-type=e2-medium \
  --boot-disk-size=50GB \
  --boot-disk-type=pd-ssd \
  --image-family=ubuntu-2204-lts \
  --image-project=ubuntu-os-cloud \
  --tags=registration-portal-staging \
  --service-account=registration-portal-sa@registration-portal-staging.iam.gserviceaccount.com \
  --scopes=https://www.googleapis.com/auth/cloud-platform
```

### 2. Configure Firewall Rules

Run the firewall setup script:

```bash
export GCP_PROJECT_ID=registration-portal-staging
export GCP_NETWORK=default
export VM_NETWORK_TAGS=registration-portal-staging
export INTERNAL_IP_RANGE=10.0.0.0/8  # Adjust for your network

./gcp/staging/infrastructure/firewall-rules.sh
```

Or manually:

```bash
# HTTP (80) - For Let's Encrypt
gcloud compute firewall-rules create allow-registration-portal-http \
  --allow tcp:80 \
  --source-ranges 0.0.0.0/0 \
  --target-tags=registration-portal-staging

# HTTPS (443) - Public access
gcloud compute firewall-rules create allow-registration-portal-https \
  --allow tcp:443 \
  --source-ranges 0.0.0.0/0 \
  --target-tags=registration-portal-staging

# Traefik Dashboard (8080) - Restricted
gcloud compute firewall-rules create allow-registration-portal-traefik-dashboard \
  --allow tcp:8080 \
  --source-ranges 10.0.0.0/8 \
  --target-tags=registration-portal-staging
```

### 3. Set Up VM

SSH into the VM:

```bash
gcloud compute ssh registration-portal-staging-vm --zone=us-central1-a
```

Run the setup script:

```bash
# Clone repository (if not already done)
git clone <repository-url>
cd registration-portal

# Run setup script
sudo bash gcp/staging/infrastructure/scripts/setup-gce-vm.sh
```

## Application Deployment

### 1. Configure Environment

Copy and configure environment file:

```bash
cp .env.staging.gcp.example .env.staging.gcp
# Edit .env.staging.gcp with your values
```

### 2. Set Up Secrets

Create secrets in GCP Secret Manager:

```bash
export GCP_PROJECT_ID=registration-portal-staging
./gcp/staging/scripts/setup-secrets.sh
```

Or manually:

```bash
# Database password
echo -n "your-db-password" | gcloud secrets create registration-portal-db-password \
  --data-file=-

# Secret key
echo -n "your-secret-key" | gcloud secrets create registration-portal-secret-key \
  --data-file=-

# ... (see setup-secrets.sh for full list)
```

### 3. Deploy Application

Run the deployment script:

```bash
export ENV_FILE=.env.staging.gcp
export COMPOSE_FILE=compose.staging.gcp.yaml
./gcp/staging/scripts/deploy.sh
```

Or manually:

```bash
# Load secrets
source gcp/staging/config/load-secrets.sh

# Build and start services
docker compose -f compose.staging.gcp.yaml build
docker compose -f compose.staging.gcp.yaml up -d

# Run migrations (if using local PostgreSQL)
docker compose -f compose.staging.gcp.yaml exec registration-backend-staging \
  alembic upgrade head
```

### 4. Update Domain DNS

Point your domains to the VM's external IP:

```bash
# Get VM external IP
gcloud compute instances describe registration-portal-staging-vm \
  --zone=us-central1-a \
  --format="get(networkInterfaces[0].accessConfigs[0].natIP)"
```

Update DNS records:
- `staging.yourdomain.com` → VM external IP (A record)
- `staging-api.yourdomain.com` → VM external IP (A record)

### 5. Update Traefik Configuration

Update domain names in:
- `traefik/dynamic.staging.yml` - Replace `yourdomain.com` with your domain
- `compose.staging.gcp.yaml` - Update router rules with your domain

## Environment Configuration

### Local Services (Default)

Start with local PostgreSQL and file storage:

```env
ENVIRONMENT=staging
DATABASE_URL=postgresql+asyncpg://user:pass@registration-postgres-staging:5432/dbname
STORAGE_BACKEND=local
```

### Cloud SQL

Switch to Cloud SQL:

```env
USE_CLOUD_SQL=true
CLOUD_SQL_CONNECTION_NAME=project-id:region:instance-name
DATABASE_URL=postgresql+asyncpg://user:pass@cloud-sql-proxy-staging:5432/dbname
```

Start with Cloud SQL Proxy profile:

```bash
docker compose -f compose.staging.gcp.yaml --profile cloud-sql up -d
```

### Cloud Storage

Switch to GCS:

```env
STORAGE_BACKEND=gcs
GCS_BUCKET_NAME=registration-portal-staging-files
GCS_PROJECT_ID=your-project-id
```

See [Migration Guide](gcp-staging-migration.md) for detailed migration steps.

## Monitoring and Logging

### Cloud Logging

Application logs are automatically sent to Cloud Logging when running on GCE.

View logs:

```bash
gcloud logging read "resource.type=gce_instance AND resource.labels.instance_id=REGISTRATION_PORTAL_VM" --limit 50
```

### Cloud Monitoring

Enable monitoring:

1. GCP Console → Monitoring → Enable Monitoring API
2. VM instances automatically send metrics
3. Create alerts for critical metrics

### Application Logs

View container logs:

```bash
# All services
docker compose -f compose.staging.gcp.yaml logs -f

# Specific service
docker compose -f compose.staging.gcp.yaml logs -f registration-backend-staging
```

### Health Checks

Monitor application health:

```bash
# Backend health
curl https://staging-api.yourdomain.com/health

# Frontend
curl -I https://staging.yourdomain.com/
```

## Troubleshooting

### Certificate Issues

**Problem:** Let's Encrypt certificates not generating

**Solutions:**
- Verify domain DNS points to VM IP
- Check firewall allows HTTP (80) traffic
- Check Traefik logs: `docker compose logs traefik`
- Verify email in `traefik.staging.yml` is correct

### Database Connection Issues

**Problem:** Cannot connect to database

**Solutions:**
- Verify `DATABASE_URL` is correct
- Check PostgreSQL container is running: `docker compose ps`
- Check database logs: `docker compose logs registration-postgres-staging`
- For Cloud SQL: Verify Cloud SQL Proxy is running and connection name is correct

### Storage Issues

**Problem:** Files not saving/retrieving correctly

**Solutions:**
- Check `STORAGE_BACKEND` environment variable
- For GCS: Verify service account has Storage Object Admin role
- Check backend logs for storage errors
- Verify bucket exists and is accessible

### Service Startup Issues

**Problem:** Services fail to start

**Solutions:**
- Check container logs: `docker compose logs <service-name>`
- Verify environment variables are set correctly
- Check health checks: `docker compose ps`
- Verify network connectivity: `docker compose exec <service> ping <other-service>`

### Performance Issues

**Problem:** Slow response times

**Solutions:**
- Check resource limits in `compose.staging.gcp.yaml`
- Monitor VM CPU/memory usage in GCP Console
- Review database query performance
- Check GCS bucket location (use same region as VM)

## Maintenance

### Updating Application

```bash
# Pull latest code
git pull

# Rebuild and restart
docker compose -f compose.staging.gcp.yaml build
docker compose -f compose.staging.gcp.yaml up -d
```

### Database Backups

For local PostgreSQL:

```bash
docker compose -f compose.staging.gcp.yaml exec registration-postgres-staging \
  pg_dump -U registration_user registration_portal_db > backup-$(date +%Y%m%d).sql
```

For Cloud SQL:

```bash
gcloud sql backups create --instance=registration-portal-staging
```

### Log Rotation

Configure log rotation for container logs:

```bash
# Configure Docker log driver
# Add to compose.staging.gcp.yaml:
logging:
  driver: "json-file"
  options:
    max-size: "10m"
    max-file: "3"
```

## Next Steps

- Set up automated backups
- Configure Cloud Load Balancer (for production)
- Set up CI/CD pipeline
- Configure alerting and monitoring
- Plan for production deployment

See also:
- [Environment Variables Reference](gcp-staging-env-vars.md)
- [Migration Guide](gcp-staging-migration.md)
