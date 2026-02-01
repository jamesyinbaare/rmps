# GCP Staging Environment Variables Reference

Complete reference for all environment variables used in GCP staging deployment.

## Environment Configuration

### Core Environment

| Variable | Description | Example | Required |
|----------|-------------|---------|----------|
| `ENVIRONMENT` | Application environment | `staging` | Yes |
| `APP_ENV` | Application environment (logging) | `staging` | Yes |
| `APP_LOG_LEVEL` | Log level (INFO, DEBUG, etc.) | `INFO` | No |
| `APP_LOG_FORMAT` | Log format (json, text) | `json` | No |

## Database Configuration (Cloud SQL)

Staging uses Cloud SQL only. The backend connects via the Cloud SQL Proxy container.

| Variable | Description | Example | Required |
|----------|-------------|---------|----------|
| `CLOUD_SQL_CONNECTION_NAME` | Cloud SQL connection name | `project-id:region:instance-name` | Yes |
| `DATABASE_URL` | PostgreSQL connection URL (host = proxy container) | `postgresql+asyncpg://user:pass@cloud-sql-proxy-staging:5432/dbname` | Yes |

Example `.env.staging.gcp`:
```env
CLOUD_SQL_CONNECTION_NAME=project-id:region:instance-name
DATABASE_URL=postgresql+asyncpg://user:pass@cloud-sql-proxy-staging:5432/dbname
```

## Storage Configuration

### Local Storage (Default)

| Variable | Description | Example | Required |
|----------|-------------|---------|----------|
| `STORAGE_BACKEND` | Storage backend type | `local` | Yes |
| `STORAGE_PATH` | Documents storage path | `storage/documents` | No |
| `PHOTO_STORAGE_PATH` | Photos storage path | `storage/photos` | No |
| `EXPORT_STORAGE_PATH` | Exports storage path | `storage/exports` | No |
| `CERTIFICATE_REQUEST_STORAGE_PATH` | Certificate requests path | `storage/certificate_requests` | No |

### Google Cloud Storage

| Variable | Description | Example | Required |
|----------|-------------|---------|----------|
| `STORAGE_BACKEND` | Storage backend type | `gcs` | Yes (to use GCS) |
| `GCS_BUCKET_NAME` | GCS bucket name | `registration-portal-staging-files` | Yes (if `STORAGE_BACKEND=gcs`) |
| `GCS_PROJECT_ID` | GCP project ID | `your-project-id` | No (uses default if not set) |
| `GCS_CREDENTIALS_PATH` | Path to service account JSON | `/path/to/service-account-key.json` | No (uses ADC if not set) |

**Switching between local and GCS:**

1. **To use GCS:**
   ```env
   STORAGE_BACKEND=gcs
   GCS_BUCKET_NAME=registration-portal-staging-files
   GCS_PROJECT_ID=your-project-id
   ```
   Then restart backend:
   ```bash
   docker compose -f compose.staging.gcp.yaml restart registration-backend-staging
   ```

2. **To use local storage:**
   ```env
   STORAGE_BACKEND=local
   ```

## CORS Configuration

| Variable | Description | Example | Required |
|----------|-------------|---------|----------|
| `CORS_ORIGINS` | Comma-separated list of allowed origins | `https://reg.example.com,https://admin.example.com` | No |
| `CORS_ALLOW_CREDENTIALS` | Allow credentials (cookies, auth headers) | `true` | No (default: `true`) |
| `CORS_ALLOW_METHODS` | Allowed HTTP methods (`*` or comma-separated) | `*` or `GET,POST,PUT,DELETE` | No |
| `CORS_ALLOW_HEADERS` | Allowed request headers (`*` or comma-separated) | `*` | No |
| `CORS_EXPOSE_HEADERS` | Headers exposed to browser (comma-separated) | `Content-Disposition,content-disposition` | No |

Example for staging:
```env
CORS_ORIGINS=https://reg.jamesyin.com,https://reg-api.jamesyin.com,http://localhost:3001
```

Default origins (when not set): localhost variants for development.

## Authentication Configuration

| Variable | Description | Example | Required |
|----------|-------------|---------|----------|
| `SECRET_KEY` | JWT secret key | `your-secret-key` | Yes |
| `ALGORITHM` | JWT algorithm | `HS256` | No (default: `HS256`) |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Access token expiry | `30` | No |
| `REFRESH_TOKEN_EXPIRE_DAYS` | Refresh token expiry | `7` | No |

## System Admin Configuration

| Variable | Description | Example | Required |
|----------|-------------|---------|----------|
| `SYSTEM_ADMIN_EMAIL` | System admin email | `admin@example.com` | Yes |
| `SYSTEM_ADMIN_PASSWORD` | System admin password | `secure-password` | Yes |
| `SYSTEM_ADMIN_FULL_NAME` | System admin full name | `System Administrator` | Yes |

## Paystack Configuration

| Variable | Description | Example | Required |
|----------|-------------|---------|----------|
| `PAYSTACK_SECRET_KEY` | Paystack secret key | `sk_test_xxx` | No |
| `PAYSTACK_PUBLIC_KEY` | Paystack public key | `pk_test_xxx` | No |
| `PAYSTACK_WEBHOOK_SECRET` | Webhook verification secret | `whsec_xxx` | No |
| `PAYSTACK_CALLBACK_BASE_URL` | Callback base URL | `https://staging.yourdomain.com` | No |

## Domain/URL Configuration

| Variable | Description | Example | Required |
|----------|-------------|---------|----------|
| `FRONTEND_BASE_URL` | Frontend base URL | `https://staging.yourdomain.com` | Yes |
| `FRONTEND_API_BASE_URL` | Frontend API base URL | `https://staging-api.yourdomain.com` | Yes |
| `STAGING_FRONTEND_DOMAIN` | Frontend domain | `staging.yourdomain.com` | Yes |
| `STAGING_API_DOMAIN` | API domain | `staging-api.yourdomain.com` | Yes |
| `PAYSTACK_CALLBACK_BASE_URL` | Paystack callback URL | `https://staging.yourdomain.com` | No |

## Traefik Configuration

Traefik configuration is in:
- `traefik/traefik.staging.yml` - Static configuration
- `traefik/dynamic.staging.yml` - Dynamic configuration

Key settings:
- Let's Encrypt email (in `traefik.staging.yml`)
- Domain names (in `dynamic.staging.yml`)
- CORS origins (in `dynamic.staging.yml`)

## Security Best Practices

### Secret Management

**Recommended:** Use GCP Secret Manager for sensitive values:

1. Store secrets in Secret Manager:
   ```bash
   ./gcp/staging/scripts/setup-secrets.sh
   ```

2. Load secrets at runtime:
   ```bash
   source gcp/staging/config/load-secrets.sh
   ```

3. Or use Secret Manager in environment file:
   ```bash
   # In deployment script, load secrets before docker compose
   source gcp/staging/config/load-secrets.sh
   docker compose -f compose.staging.gcp.yaml up -d
   ```

### Sensitive Variables

These should **never** be committed to version control:
- `SECRET_KEY`
- `POSTGRES_PASSWORD`
- `PAYSTACK_SECRET_KEY`
- `PAYSTACK_WEBHOOK_SECRET`
- `SYSTEM_ADMIN_PASSWORD`
- Any API keys or tokens

Use GCP Secret Manager or `.env.staging.gcp` (gitignored).

## Environment File Structure

Example `.env.staging.gcp`:

```env
# Environment
ENVIRONMENT=staging
APP_ENV=staging
APP_LOG_LEVEL=INFO
APP_LOG_FORMAT=json

# Database (Local PostgreSQL)
DATABASE_URL=postgresql+asyncpg://registration_user:${POSTGRES_PASSWORD}@registration-postgres-staging:5432/registration_portal_db
POSTGRES_USER=registration_user
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}  # Load from Secret Manager
REGISTRATION_POSTGRES_DB=registration_portal_db

# Storage (Local)
STORAGE_BACKEND=local
STORAGE_PATH=storage/documents
PHOTO_STORAGE_PATH=storage/photos
EXPORT_STORAGE_PATH=storage/exports
CERTIFICATE_REQUEST_STORAGE_PATH=storage/certificate_requests

# Authentication
SECRET_KEY=${SECRET_KEY}  # Load from Secret Manager

# System Admin
SYSTEM_ADMIN_EMAIL=admin@example.com
SYSTEM_ADMIN_PASSWORD=${SYSTEM_ADMIN_PASSWORD}  # Load from Secret Manager
SYSTEM_ADMIN_FULL_NAME=System Administrator

# Paystack
PAYSTACK_SECRET_KEY=${PAYSTACK_SECRET_KEY}  # Load from Secret Manager
PAYSTACK_PUBLIC_KEY=${PAYSTACK_PUBLIC_KEY}  # Load from Secret Manager
PAYSTACK_WEBHOOK_SECRET=${PAYSTACK_WEBHOOK_SECRET}  # Load from Secret Manager
PAYSTACK_CALLBACK_BASE_URL=https://staging.yourdomain.com

# Domains
FRONTEND_BASE_URL=https://staging.yourdomain.com
FRONTEND_API_BASE_URL=https://staging-api.yourdomain.com
STAGING_FRONTEND_DOMAIN=staging.yourdomain.com
STAGING_API_DOMAIN=staging-api.yourdomain.com
```

## Switching Configuration

### Quick Reference: Storage Switch

**Local → GCS:**
```env
STORAGE_BACKEND=gcs
GCS_BUCKET_NAME=registration-portal-staging-files
GCS_PROJECT_ID=your-project-id
```
```bash
docker compose -f compose.staging.gcp.yaml restart registration-backend-staging
```

**GCS → Local:**
```env
STORAGE_BACKEND=local
```
```bash
docker compose -f compose.staging.gcp.yaml restart registration-backend-staging
```

## Validation

Validate environment configuration:

```bash
# Check required variables are set
python3 -c "
import os
required = ['DATABASE_URL', 'SECRET_KEY', 'SYSTEM_ADMIN_EMAIL', 'FRONTEND_BASE_URL']
missing = [v for v in required if not os.getenv(v)]
if missing:
    print(f'Missing required variables: {missing}')
    exit(1)
print('All required variables are set')
"
```
