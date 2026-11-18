# GCP Staging Migration Guide

This guide covers migrating from local services (PostgreSQL and file storage) to GCP services (Cloud SQL and Cloud Storage).

**Note:** Staging Compose (`compose.staging.gcp.yaml`) now uses Cloud SQL only; there is no local Postgres container. Use this guide to create and configure Cloud SQL and to migrate data from an existing local Postgres if needed.

## Table of Contents

1. [Migrating from Local PostgreSQL to Cloud SQL](#migrating-from-local-postgresql-to-cloud-sql)
2. [Migrating from Local Storage to Cloud Storage](#migrating-from-local-storage-to-cloud-storage)
3. [Rollback Procedures](#rollback-procedures)

## Migrating from Local PostgreSQL to Cloud SQL

### Prerequisites

- Cloud SQL instance created in GCP
- Service account with Cloud SQL Client role
- Cloud SQL Proxy installed or available as Docker image
- Backup of local PostgreSQL database

### Step 1: Create Cloud SQL Instance

```bash
gcloud sql instances create registration-portal-staging \
  --database-version=POSTGRES_18 \
  --edition=ENTERPRISE \
  --tier=db-f1-micro \
  --region=europe-west9 \
  --network=default \
  --backup-start-time=03:00 \
  --enable-bin-log
```

Create a database:

```bash
gcloud sql databases create registration_portal_db \
  --instance=registration-portal-staging
```

Create a user:

```bash
gcloud sql users create registration_user \
  --instance=registration-portal-staging \
  --password=YOUR_SECURE_PASSWORD
```

### Step 2: Export Data from Local PostgreSQL

```bash
# From your local machine or VM with access to local PostgreSQL
docker compose -f compose.staging.gcp.yaml exec registration-postgres-staging \
  pg_dump -U registration_user -d registration_portal_db > backup.sql
```

### Step 3: Import Data to Cloud SQL

Using Cloud SQL Proxy:

```bash
# Start Cloud SQL Proxy
cloud-sql-proxy \
  --port=5432 \
  PROJECT_ID:REGION:registration-portal-staging

# In another terminal, import data
export PGHOST=127.0.0.1
export PGPORT=5432
export PGDATABASE=registration_portal_db
export PGUSER=registration_user
export PGPASSWORD=YOUR_SECURE_PASSWORD

psql < backup.sql
```

Or using `gcloud sql import`:

```bash
# Upload backup to Cloud Storage first
gsutil cp backup.sql gs://your-bucket/backup.sql

# Import to Cloud SQL
gcloud sql import sql registration-portal-staging \
  gs://your-bucket/backup.sql \
  --database=registration_portal_db \
  --user=registration_user
```

### Step 4: Update Environment Configuration

Update `.env.staging.gcp`:

```env
# Cloud SQL (staging uses Cloud SQL only)
CLOUD_SQL_CONNECTION_NAME=PROJECT_ID:REGION:registration-portal-staging
DATABASE_URL=postgresql+asyncpg://registration_user:YOUR_PASSWORD@cloud-sql-proxy-staging:5432/registration_portal_db

# Comment out or remove local PostgreSQL DATABASE_URL
# DATABASE_URL=postgresql+asyncpg://registration_user:YOUR_PASSWORD@registration-postgres-staging:5432/registration_portal_db
```

### Step 5: Update Docker Compose

Start services with Cloud SQL Proxy profile:

```bash
docker compose -f compose.staging.gcp.yaml --profile cloud-sql up -d
```

Or update `compose.staging.gcp.yaml` to conditionally include Cloud SQL Proxy based on environment variable.

### Step 6: Run Migrations

```bash
docker compose -f compose.staging.gcp.yaml exec registration-backend-staging \
  alembic upgrade head
```

### Step 7: Verify Migration

1. Check backend logs for database connection
2. Verify application functionality
3. Test database queries and operations
4. Check Cloud SQL metrics in GCP Console

## Migrating from Local Storage to Cloud Storage

### Prerequisites

- GCS bucket created
- Service account with Storage Admin or Object Admin role
- `gsutil` installed or Google Cloud SDK
- Existing local storage files to migrate

### Step 1: Create GCS Bucket

```bash
gsutil mb -l europe-west9 gs://registration-portal-staging-files

# Set bucket lifecycle (optional)
gsutil lifecycle set lifecycle.json gs://registration-portal-staging-files
```

### Step 2: Upload Existing Files

Use the migration script:

```bash
export GCS_BUCKET_NAME=registration-portal-staging-files
./gcp/staging/scripts/migrate-storage-to-gcs.sh
```

Or manually:

```bash
# Migrate photos
gsutil -m rsync -r storage/photos gs://registration-portal-staging-files/photos

# Migrate documents
gsutil -m rsync -r storage/documents gs://registration-portal-staging-files/documents

# Migrate exports
gsutil -m rsync -r storage/exports gs://registration-portal-staging-files/exports

# Migrate certificate requests
gsutil -m rsync -r storage/certificate_requests gs://registration-portal-staging-files/certificate_requests
```

### Step 3: Verify Upload

```bash
# List files in bucket
gsutil ls -r gs://registration-portal-staging-files

# Check file count
gsutil ls -r gs://registration-portal-staging-files | wc -l
```

### Step 4: Update Environment Configuration

Update `.env.staging.gcp`:

```env
# Use Cloud Storage
STORAGE_BACKEND=gcs
GCS_BUCKET_NAME=registration-portal-staging-files
GCS_PROJECT_ID=your-project-id

# Optional: Path to service account JSON (uses ADC by default)
# GCS_CREDENTIALS_PATH=/path/to/service-account-key.json
```

### Step 5: Configure Service Account

Ensure the VM's service account has Storage Object Admin role:

```bash
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:SERVICE_ACCOUNT@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"
```

Or create a dedicated service account:

```bash
# Create service account
gcloud iam service-accounts create registration-portal-storage \
  --display-name="Registration Portal Storage"

# Grant Storage Admin role
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:registration-portal-storage@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"

# Create and download key
gcloud iam service-accounts keys create service-account-key.json \
  --iam-account=registration-portal-storage@PROJECT_ID.iam.gserviceaccount.com
```

### Step 6: Restart Backend Service

```bash
docker compose -f compose.staging.gcp.yaml restart registration-backend-staging
```

### Step 7: Verify Migration

1. Check backend logs for GCS operations
2. Test file upload/download functionality
3. Verify files are stored in GCS bucket
4. Test existing files are accessible

## Rollback Procedures

### Rollback: Cloud SQL

Staging Compose uses Cloud SQL only; there is no local Postgres container. To move data off Cloud SQL (e.g. for backup or migration to another environment):

1. **Export from Cloud SQL:**
   ```bash
   gcloud sql export sql registration-portal-staging \
     gs://your-bucket/cloud-sql-backup.sql \
     --database=registration_portal_db
   ```

2. **Download backup (if needed):**
   ```bash
   gsutil cp gs://your-bucket/cloud-sql-backup.sql .
   ```

### Rollback: Cloud Storage to Local Storage

1. **Update environment:**
   ```env
   STORAGE_BACKEND=local
   ```

2. **Download files from GCS (if needed):**
   ```bash
   gsutil -m rsync -r gs://registration-portal-staging-files/photos storage/photos
   gsutil -m rsync -r gs://registration-portal-staging-files/documents storage/documents
   gsutil -m rsync -r gs://registration-portal-staging-files/exports storage/exports
   gsutil -m rsync -r gs://registration-portal-staging-files/certificate_requests storage/certificate_requests
   ```

3. **Restart backend:**
   ```bash
   docker compose -f compose.staging.gcp.yaml restart registration-backend-staging
   ```

## Testing After Migration

1. **Database Testing:**
   - Verify all database queries work
   - Test CRUD operations
   - Check connection pooling
   - Monitor query performance

2. **Storage Testing:**
   - Upload test files
   - Download existing files
   - Verify file paths and organization
   - Test file deletion

3. **Integration Testing:**
   - Test full user workflows
   - Verify file uploads/downloads in application
   - Check API endpoints
   - Test authentication and authorization

## Troubleshooting

### Cloud SQL Connection Issues

- Verify Cloud SQL instance is running
- Check firewall rules allow connections
- Verify service account has Cloud SQL Client role
- Check Cloud SQL Proxy logs
- Verify connection name format: `PROJECT_ID:REGION:INSTANCE_NAME`

### GCS Access Issues

- Verify service account has Storage Object Admin role
- Check bucket name and project ID are correct
- Verify Application Default Credentials (ADC) are configured
- Check bucket permissions
- Review GCS access logs

### Migration Issues

- Verify data integrity after migration
- Check file counts match between local and GCS
- Verify database row counts match
- Test with sample data before full migration
