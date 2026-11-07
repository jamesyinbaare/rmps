# GCP staging deployment (exam-tools)

Dedicated GCE VM running Docker Compose: **Traefik** (TLS), **FastAPI backend**, **Next.js frontend**, **Postgres**, and a **db-backup** sidecar that uploads daily dumps to GCS.

**Current staging VM:** `monitoring-staging-vm` in `us-central1-a` (project `monitoring-portal-staging`), `e2-medium`, 40 GB `pd-ssd`, **ephemeral** external IP (no reserved static address — re-point DNS if the instance is stopped/started and the IP changes).

```bash
gcloud compute ssh monitoring-staging-vm --zone=us-central1-a --project=monitoring-portal-staging
```

## Layout

```
gcp/staging/
├── README.md
├── backup/
│   ├── Dockerfile
│   ├── backup.sh
│   └── entrypoint.sh
├── scripts/
│   ├── deploy.sh
│   ├── setup-secrets.sh
│   ├── migrate-storage-to-gcs.sh
│   ├── export-cloud-sql-dump.sh
│   ├── import-postgres-dump.sh
│   ├── restore-from-gcs-backup.sh
│   ├── verify-db-backup.sh
│   └── ensure-db-backup-lifecycle.sh
└── infrastructure/
    ├── firewall-rules.sh
    └── scripts/
        └── setup-gce-vm.sh
```

Root files:

- [`compose.staging.gcp.yaml`](../../compose.staging.gcp.yaml) — production compose
- [`traefik/`](../../traefik/) — Traefik static + dynamic config
- [`.env.staging.gcp.example`](../../.env.staging.gcp.example) — environment template

## Quick start

1. **GCP**: Create or reuse a project; enable Compute Engine, **Cloud Storage**, Secret Manager, and APIs listed in [registration-portal docs](../../../registration-portal/docs/gcp-staging-deployment.md). Cloud SQL is **not** required for exam-tools (Postgres runs in Compose).

2. **VM**: Create an Ubuntu 22.04 VM in a cheap region (staging uses **`us-central1-a`**; e.g. `e2-medium` for exam-tools alone; use **`e2-standard-2`** when co-locating SEMS), attach a service account with **`roles/storage.objectAdmin`** (or `objectCreator` + `objectViewer` if you tighten IAM), and Secret Manager access if you use it. Tag the VM (e.g. `monitoring-tools-staging`) for firewall rules. Size the boot disk for Postgres data plus temporary dumps (**40 GB** `pd-ssd` on current staging). Prefer an ephemeral external IP unless you need a stable address. Before risky ops (major upgrades, volume experiments), snapshot the GCE disk.

3. **GCS bucket**: Create a bucket (staging uses multi-region **`US`**, e.g. `ctvet-monitoring`). Set `STORAGE_BACKEND=gcs`, `GCS_BUCKET_NAME`, and `GCS_PROJECT_ID` in `.env.staging.gcp`. Exam documents are stored under the prefix from `GCS_DOCUMENTS_PREFIX` (default `exam-tools/documents`). Inspector attendance sheets use a separate prefix, `GCS_ATTENDANCE_SHEETS_PREFIX` (default `exam-tools/attendance-sheets`). DB backups use `DB_BACKUP_GCS_PREFIX` (default `exam-tools/db-backups`). To migrate existing local files from a dev machine, use [`scripts/migrate-storage-to-gcs.sh`](scripts/migrate-storage-to-gcs.sh).

   Apply bucket lifecycle (belt-and-suspenders with container prune):

   ```bash
   ./gcp/staging/scripts/ensure-db-backup-lifecycle.sh
   ```

4. **Firewall** (from your workstation, with `gcloud` configured):

   ```bash
   export GCP_PROJECT_ID=your-project-id
   export VM_NETWORK_TAGS=exam-tools-staging
   ./gcp/staging/infrastructure/firewall-rules.sh
   ```

5. **VM bootstrap**: SSH in and run `./gcp/staging/infrastructure/scripts/setup-gce-vm.sh` (or install Docker + Compose manually).

6. **DNS**: Point `A`/`AAAA` records for your frontend and API hostnames at the VM’s **current** external IP (`gcloud compute instances describe monitoring-staging-vm --zone=us-central1-a --format='get(networkInterfaces[0].accessConfigs[0].natIP)'`). Defaults in [`traefik/dynamic.staging.yml`](../../traefik/dynamic.staging.yml) use `monitoring.jamesyin.com` and `monitoring-api.jamesyin.com`—update those hosts and Traefik dashboard host in the same file and in [`compose.staging.gcp.yaml`](../../compose.staging.gcp.yaml) Traefik labels if needed. With an ephemeral IP, update DNS again after any stop/start that changes the address.

7. **Secrets** (optional): `./gcp/staging/scripts/setup-secrets.sh` — or place values only in `.env.staging.gcp`.

8. **Configure**:

   ```bash
   cp .env.staging.gcp.example .env.staging.gcp
   # Edit POSTGRES_*, DATABASE_URL (host = tools_postgres), SECRET_KEY, GCS_*, domains, SUPER_ADMIN_*
   ```

9. **Deploy** (on the VM, repo root = `exam-tools`):

   ```bash
   chmod +x gcp/staging/scripts/deploy.sh
   ./gcp/staging/scripts/deploy.sh
   ```

`prestart.sh` runs **Alembic migrations** and **initial super admin** when the backend container starts. `deploy.sh` waits for Postgres readiness and for `db-backup` to become healthy (initial verified dump uploaded) before finishing.

### Postgres data persistence

- Staging Postgres uses a **host bind mount** at `POSTGRES_DATA_DIR` (default `/var/lib/exam-tools/postgres`).
- Destroying and rebuilding all containers (`deploy.sh` → `compose down` + `up`) **keeps the database**. `docker compose down -v` also does **not** delete bind-mounted host data.
- What *does* wipe data: deleting `POSTGRES_DATA_DIR`, reformatting the VM disk, or restoring an empty disk snapshot. Prefer GCE disk snapshots before risky ops.
- `deploy.sh` creates `POSTGRES_DATA_DIR` if missing and refuses `-v`/`--volumes`.
- Postgres is not published on the host; only containers on `monitoring-tools-network-staging` can connect.
- Staging Postgres runs with explicit `fsync=on` / `full_page_writes=on`, resource limits, and image pin `postgres:18.6`.

#### One-time migrate from an old named volume

If you previously ran staging with the Compose named volume `exam_tools_db_data`, copy it onto the host path **before** the first deploy that uses the bind mount (stop Postgres first). Confirm the volume name with `docker volume ls`:

```bash
sudo mkdir -p /var/lib/exam-tools/postgres
# Example name — replace with the exact name from `docker volume ls`:
docker run --rm \
  -v exam-tools_exam_tools_db_data:/from:ro \
  -v /var/lib/exam-tools/postgres:/to \
  alpine sh -c 'cp -a /from/. /to/'
```

### Automated DB backups

The `db-backup` service:

1. Waits for Postgres, then runs an initial backup that **must succeed** (container exits/restarts on failure).
2. Runs `pg_dump -Fc`, verifies with `pg_restore --list`, writes a `.sha256`, and uploads atomically (`.uploading` → final name).
3. Schedules further dumps via supercronic (default **02:00 UTC**).
4. Prunes objects older than `DB_BACKUP_RETENTION_DAYS` (default **14**), with GCS lifecycle as backup.

Override with `DB_BACKUP_SCHEDULE`, `DB_BACKUP_GCS_PREFIX`, and `DB_BACKUP_RETENTION_DAYS` in `.env.staging.gcp`. Healthcheck fails if `/var/tmp/last-backup-ok` is older than 36 hours.

```bash
docker compose --env-file .env.staging.gcp -f compose.staging.gcp.yaml logs db-backup
docker compose --env-file .env.staging.gcp -f compose.staging.gcp.yaml ps
```

### Monthly restore drill

```bash
./gcp/staging/scripts/verify-db-backup.sh              # download + checksum + TOC
VERIFY_RESTORE=1 ./gcp/staging/scripts/verify-db-backup.sh  # also restore into throwaway postgres:18.6
```

For a real recovery into the live stack, use [`restore-from-gcs-backup.sh`](scripts/restore-from-gcs-backup.sh) (see [Disaster recovery](#disaster-recovery)).

## Migrating from Cloud SQL (one-time cutover)

Use a short maintenance window. Keep Cloud SQL credentials in `.env.staging.gcp` **only for the export step** (`CLOUD_SQL_CONNECTION_NAME` or `CLOUD_SQL_INSTANCE` + bucket), and set the Compose target `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` / `POSTGRES_DATA_DIR` that the container will use.

1. **Export** from Cloud SQL (custom-format dump + checksum via Auth Proxy + `pg_dump -Fc`, or plain SQL via `gcloud sql export`):

   ```bash
   ./gcp/staging/scripts/export-cloud-sql-dump.sh
   # produces e.g. ./backups/exam_tools_db_YYYYMMDD_HHMMSS.dump (+ .sha256)
   ```

2. **Update** `.env.staging.gcp` for runtime: `DATABASE_URL` host = `tools_postgres`, `POSTGRES_DATA_DIR=/var/lib/exam-tools/postgres` (see `.env.staging.gcp.example`). You can remove `CLOUD_SQL_CONNECTION_NAME` after export succeeds.

3. **Deploy** the new stack (creates the host data dir, starts Postgres + apps + backup):

   ```bash
   ./gcp/staging/scripts/deploy.sh
   ```

4. **Import** the dump (script stops `db-backup` + backend during restore so empty mid-cutover dumps are not published, then starts them again):

   ```bash
   ./gcp/staging/scripts/import-postgres-dump.sh ./backups/exam_tools_db_YYYYMMDD_HHMMSS.dump
   ```

5. Smoke-test `https://$STAGING_API_DOMAIN/health` and login. Confirm a dump under `gs://$GCS_BUCKET_NAME/exam-tools/db-backups/` and that `db-backup` is healthy.

6. Optionally drop only the `exam_tools_db` database on Cloud SQL. **Do not delete the Cloud SQL instance** if SEMS (or other apps) still use it.

After cutover, **daily GCS dumps** are the recovery source if the VM data dir is lost. The host bind mount only survives container rebuilds—not `rm -rf $POSTGRES_DATA_DIR` or a wiped disk.

## Disaster recovery

Recover the live Compose database from GCS when data is lost or corrupt.

### Postgres still starts (logical restore)

```bash
# Latest dump under exam-tools/db-backups/
./gcp/staging/scripts/restore-from-gcs-backup.sh

# Or a specific object / basename:
./gcp/staging/scripts/restore-from-gcs-backup.sh gs://$GCS_BUCKET_NAME/exam-tools/db-backups/exam_tools_db_YYYYMMDD_HHMMSS.dump
```

This downloads the dump (+ checksum when present) to `./backups/` and runs [`import-postgres-dump.sh`](scripts/import-postgres-dump.sh) against the live `tools_postgres` container.

### `POSTGRES_DATA_DIR` corrupt (Postgres will not start)

Host path defaults to `/var/lib/exam-tools/postgres`.

```bash
# 1. Stop DB-related services
docker compose --env-file .env.staging.gcp -f compose.staging.gcp.yaml \
  stop tools_postgres db-backup monitoring-tools-backend

# 2. Move aside the broken data dir and recreate empty
sudo mv /var/lib/exam-tools/postgres \
  /var/lib/exam-tools/postgres.broken.$(date -u +%Y%m%d_%H%M%S)
sudo mkdir -p /var/lib/exam-tools/postgres

# 3. Redeploy (fresh cluster in the empty dir)
./gcp/staging/scripts/deploy.sh

# 4. Restore from GCS into the new cluster
./gcp/staging/scripts/restore-from-gcs-backup.sh
```

Then smoke-test `/health` and login. Confirm `db-backup` becomes healthy again (new dump uploaded).

**Note:** Monthly [`verify-db-backup.sh`](scripts/verify-db-backup.sh) only validates a dump (optional throwaway restore). It does **not** write into the live database—use `restore-from-gcs-backup.sh` for that.

## Co-located SEMS

SEMS may share this VM’s Traefik and Docker network (`monitoring-tools-network-staging`), but SEMS uses its **own** Cloud SQL Auth Proxy and Cloud SQL database—exam-tools Postgres does not serve SEMS.

**Deploy order:**

1. Deploy (or redeploy) exam-tools so Traefik is up and [`traefik/dynamic.staging.yml`](../../traefik/dynamic.staging.yml) includes SEMS host routes (if co-located).
2. Ensure SEMS Cloud SQL DB/user and DNS for `sems*` / `sems-api*` hosts (see [sems GCP staging README](../../../sems/gcp/staging/README.md)).
3. Deploy SEMS from the `sems/` tree with its own compose project.

Exam-tools `deploy.sh` only stops containers in the exam-tools compose project; SEMS containers are unaffected (brief Traefik restart on exam-tools redeploy is expected when Traefik is shared).

## Frontend build note

- If frontend Docker builds log `[baseline-browser-mapping] The data in this module is over two months old`, prefer upgrading `next` and `eslint-config-next` to the latest stable minor first.
- Running `npm i baseline-browser-mapping@latest -D` alone may not clear the warning on some `16.0.x` Next.js builds.

## Related documentation

- [registration-portal GCP staging deployment](../../../registration-portal/docs/gcp-staging-deployment.md) — project setup, APIs, service accounts
- [registration-portal env reference](../../../registration-portal/docs/gcp-staging-env-vars.md) — similar staging env patterns
