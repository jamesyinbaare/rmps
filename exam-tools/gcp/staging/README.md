# GCP staging deployment (exam-tools)

Dedicated GCE VM running Docker Compose: **Traefik** (TLS), **FastAPI backend**, **Next.js frontend**, and **Cloud SQL Auth Proxy**—same pattern as [registration-portal](../../../registration-portal/gcp/staging/README.md).

## Layout

```
gcp/staging/
├── README.md
├── scripts/
│   ├── deploy.sh
│   ├── setup-secrets.sh
│   └── migrate-storage-to-gcs.sh
└── infrastructure/
    ├── firewall-rules.sh
    └── scripts/
        └── setup-gce-vm.sh
```

Root files:

- [`compose.staging.gcp.yaml`](../compose.staging.gcp.yaml) — production compose
- [`traefik/`](../traefik/) — Traefik static + dynamic config
- [`.env.staging.gcp.example`](../.env.staging.gcp.example) — environment template

## Quick start

1. **GCP**: Create or reuse a project; enable Compute Engine, Cloud SQL (PostgreSQL), **Cloud Storage**, Secret Manager, and APIs listed in [registration-portal docs](../../../registration-portal/docs/gcp-staging-deployment.md).

2. **VM**: Create an Ubuntu 22.04 VM (e.g. `e2-medium`), attach a service account with **`roles/cloudsql.client`**, **`roles/storage.objectAdmin`** (or `objectCreator` + `objectViewer` if you tighten IAM), and Secret Manager access if you use it. Tag the VM (e.g. `exam-tools-staging`) for firewall rules.

3. **GCS bucket**: Create a bucket (e.g. in `europe-west9`). Set `STORAGE_BACKEND=gcs`, `GCS_BUCKET_NAME`, and `GCS_PROJECT_ID` in `.env.staging.gcp`. Exam documents are stored under the prefix from `GCS_DOCUMENTS_PREFIX` (default `exam-tools/documents`). To migrate existing local files from a dev machine, use [`scripts/migrate-storage-to-gcs.sh`](scripts/migrate-storage-to-gcs.sh).

4. **Firewall** (from your workstation, with `gcloud` configured):

   ```bash
   export GCP_PROJECT_ID=your-project-id
   export VM_NETWORK_TAGS=exam-tools-staging
   ./gcp/staging/infrastructure/firewall-rules.sh
   ```

5. **VM bootstrap**: SSH in and run `./gcp/staging/infrastructure/scripts/setup-gce-vm.sh` (or install Docker + Compose manually).

6. **Cloud SQL**: Create a PostgreSQL instance and database/user for exam-tools. Note the **connection name** `project:region:instance`.

7. **DNS**: Point `A`/`AAAA` records for your frontend and API hostnames at the VM’s external IP. Defaults in [`traefik/dynamic.staging.yml`](../traefik/dynamic.staging.yml) use `exam.jamesyin.com` and `exam-api.jamesyin.com`—update those hosts and Traefik dashboard host in the same file and in [`compose.staging.gcp.yaml`](../compose.staging.gcp.yaml) Traefik labels if needed.

8. **Secrets** (optional): `./gcp/staging/scripts/setup-secrets.sh` — or place values only in `.env.staging.gcp`.

9. **Configure**:

   ```bash
   cp .env.staging.gcp.example .env.staging.gcp
   # Edit DATABASE_URL, SECRET_KEY, GCS_*, domains, SUPER_ADMIN_*, CLOUD_SQL_CONNECTION_NAME
   ```

10. **Deploy** (on the VM, repo root = `exam-tools`):

   ```bash
   chmod +x gcp/staging/scripts/deploy.sh
   ./gcp/staging/scripts/deploy.sh
   ```

`prestart.sh` runs **Alembic migrations** and **initial super admin** when the backend container starts.

## Related documentation

- [registration-portal GCP staging deployment](../../../registration-portal/docs/gcp-staging-deployment.md) — project setup, APIs, service accounts
- [registration-portal env reference](../../../registration-portal/docs/gcp-staging-env-vars.md) — similar variables for Cloud SQL proxy patterns
