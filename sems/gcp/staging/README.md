# GCP staging deployment (SEMS on sems-vm)

SEMS staging runs on a **dedicated GCE VM** (`sems-vm`) with its own Traefik (TLS) and Cloud SQL Auth Proxy. It **reuses the existing Cloud SQL** database (`sems_db` / `sems_user`) — no new instance.

Exam-tools Traefik routes for `sems.jamesyin.com` / `sems.ctvet.gov.gh` are **left unchanged**. This stack only serves:

- `https://sems.ctvetlabs.com`
- `https://sems-api.ctvetlabs.com`

## Layout

```
gcp/staging/
├── README.md
├── scripts/
│   └── deploy.sh
└── infrastructure/
    ├── firewall-rules.sh
    └── scripts/
        └── setup-gce-vm.sh
```

Root files:

- [`compose.staging.gcp.yaml`](../../compose.staging.gcp.yaml) — Traefik + backend + frontend + Cloud SQL proxy
- [`.env.staging.gcp.example`](../../.env.staging.gcp.example) — environment template
- [`traefik/traefik.staging.yml`](../../traefik/traefik.staging.yml) — static Traefik config
- [`traefik/dynamic.staging.yml`](../../traefik/dynamic.staging.yml) — host routers / CORS

## Prerequisites (ops checklist)

1. **VM** — Provision `sems-vm` (Ubuntu 22.04). Suggested size: `e2-medium` or larger. Network tag: `sems-staging`.
2. **VM bootstrap** — SSH in and run `gcp/staging/infrastructure/scripts/setup-gce-vm.sh` (Docker, compose plugin, gcloud).
3. **Firewall** — From a machine with gcloud access:

   ```bash
   export GCP_PROJECT_ID=your-project-id
   export VM_NETWORK_TAGS=sems-staging
   ./gcp/staging/infrastructure/firewall-rules.sh
   ```

4. **IAM** — Attach a service account with at least:
   - `roles/cloudsql.client` (existing instance)
   - `roles/storage.objectAdmin` (or equivalent) on the GCS bucket if using GCS
5. **DNS** — Point `A` records at the VM external IP:
   - `sems.ctvetlabs.com`
   - `sems-api.ctvetlabs.com`
6. **Cloud SQL** — Reuse the existing instance. Ensure `sems_db` and `sems_user` exist (create only if missing). Set `CLOUD_SQL_CONNECTION_NAME` to `project:region:instance`.
7. **GCS** — Reuse the existing staging bucket and prefixes (`sems/documents`, `sems/photos`, `sems/score-sheets`) unless you intentionally change them.
   - **Browser direct uploads** (signed PUT URLs) require bucket CORS. Apply once per bucket:

     ```bash
     gsutil cors set gcp/gcs-cors-documents.json gs://YOUR_BUCKET_NAME
     gsutil cors get gs://YOUR_BUCKET_NAME
     ```

     Edit [`gcp/gcs-cors-documents.json`](../gcs-cors-documents.json) to include every SPA origin that will upload (staging/prod). Methods must include `PUT` and `OPTIONS`.
   - **Signed URL IAM:** the backend runtime SA must be able to sign blobs:
     - Prefer a SA JSON key via `GCS_CREDENTIALS_PATH`, **or**
     - On GCE/Cloud Run ADC: grant the VM/runtime SA `roles/iam.serviceAccountTokenCreator` on itself (or `iam.serviceAccounts.signBlob`) so V4 signed URLs work without a private key file.
   - Object create/delete still needs `roles/storage.objectAdmin` (or equivalent) on the bucket.
8. **Secrets** — Place values in `sems/.env.staging.gcp` (never commit). Required: `CLOUD_SQL_CONNECTION_NAME`, `DATABASE_URL`, `SECRET_KEY`, `CORS_ORIGINS`, `SUPER_ADMIN_*`, `GCS_*`, `REDUCTO_API_KEY`.
9. **Reducto concurrency** — Set `REDUCTO_RATE_LIMIT_PER_SECOND` to your plan RPS (Growth ≈ 10) and `REDUCTO_QUEUE_WORKERS` for parallel documents (start at 4; 6–8 if extracts are slow). The in-process token bucket prevents exceeding RPS; workers only control docs in flight. Operators can also resize workers at runtime via `PATCH /api/v1/documents/reducto-queue/workers` (Registrar+) or the Reducto Extraction UI control.

## Deploy

On `sems-vm`:

```bash
cd sems
cp .env.staging.gcp.example .env.staging.gcp
# Edit CLOUD_SQL_CONNECTION_NAME, DATABASE_URL (host = sems-cloud-sql-proxy-staging),
# SECRET_KEY, GCS_*, CORS_ORIGINS, SUPER_ADMIN_*, REDUCTO_API_KEY,
# REDUCTO_RATE_LIMIT_PER_SECOND, REDUCTO_QUEUE_WORKERS

chmod +x gcp/staging/scripts/deploy.sh
./gcp/staging/scripts/deploy.sh
```

`prestart.sh` runs **Alembic migrations** and **initial super admin** when the backend container starts.

## Smoke tests

- [ ] `https://sems-api.ctvetlabs.com/health` → `{"status":"ok"}`
- [ ] `https://sems.ctvetlabs.com` loads the UI (valid TLS)
- [ ] Login with the configured super admin (CORS + JWT)
- [ ] Upload a document / photo and confirm objects under the configured GCS prefixes
- [ ] Bulk document upload from the UI uses initiate → browser PUT → confirm (not multipart through the API for large batches)
- [ ] Exam-tools SEMS hosts (if still in DNS) are unaffected by this deploy

## Frontend build note

- Compose omits `NEXT_PUBLIC_API_BASE_URL` so the browser derives `sems-api.<parent-domain>` ([`frontend/lib/api.ts`](../../frontend/lib/api.ts)).
- SSR uses `INTERNAL_API_BASE_URL=http://sems-backend:80`.

## Related documentation

- [registration-portal GCP staging](../../../registration-portal/docs/gcp-staging-deployment.md) — project APIs and service accounts pattern
- Exam-tools Traefik still documents legacy SEMS host routes; this README is the source of truth for `*.ctvetlabs.com` on `sems-vm`
