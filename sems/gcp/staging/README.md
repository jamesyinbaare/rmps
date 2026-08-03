# GCP staging deployment (SEMS, shared VM with exam-tools)

SEMS staging runs on the **same GCE VM** as exam-tools. Traefik (TLS) and Cloud SQL Auth Proxy stay in the exam-tools compose project. SEMS attaches to Docker network `monitoring-tools-network-staging` and is reached via host-based Traefik routes.

**No local data migrations.** Staging starts with an empty Cloud SQL database and empty GCS prefixes (schema via Alembic + `initial_data.py` only).

## Layout

```
gcp/staging/
├── README.md
└── scripts/
    └── deploy.sh
```

Root files:

- [`compose.staging.gcp.yaml`](../../compose.staging.gcp.yaml) — SEMS backend + frontend only
- [`.env.staging.gcp.example`](../../.env.staging.gcp.example) — environment template

Shared edge (exam-tools):

- [`exam-tools/compose.staging.gcp.yaml`](../../../exam-tools/compose.staging.gcp.yaml) — Traefik + Cloud SQL proxy
- [`exam-tools/traefik/dynamic.staging.yml`](../../../exam-tools/traefik/dynamic.staging.yml) — includes SEMS host routes

## Prerequisites (ops checklist)

Complete these before the first SEMS deploy:

1. **VM size** — Bump the shared staging VM to **`e2-standard-2`** (or equivalent). `e2-medium` is tight with two Next.js + two FastAPI stacks plus Traefik.
2. **Exam-tools edge** — Exam-tools staging must already be deployed so that:
   - Network `monitoring-tools-network-staging` exists
   - Container `monitoring-tools-cloud-sql-proxy-staging` is reachable
   - Traefik dynamic config includes SEMS routers (`sems*` / `sems-api*`)
3. **DNS** — Point `A`/`AAAA` for all four hosts at the VM external IP:
   - `sems.jamesyin.com`, `sems.ctvet.gov.gh`
   - `sems-api.jamesyin.com`, `sems-api.ctvet.gov.gh`
4. **Cloud SQL** — On the **existing** exam-tools Cloud SQL instance, create:
   - Database: `sems_db`
   - User: `sems_user` (with password used in `DATABASE_URL`)
5. **GCS** — Reuse the exam-tools staging bucket. Prefixes (created on first write; no migrate):
   - `sems/documents`
   - `sems/photos`
   - `sems/score-sheets`
6. **IAM** — VM service account retains `roles/cloudsql.client` and `roles/storage.objectAdmin` (or equivalent) on that bucket.
7. **Secrets** — Place values in `sems/.env.staging.gcp` (never commit). Required: `DATABASE_URL`, `SECRET_KEY`, `CORS_ORIGINS`, `SUPER_ADMIN_*`, `GCS_*`, `REDUCTO_API_KEY`.

## Deploy order

1. Redeploy exam-tools if Traefik routes were updated:

   ```bash
   cd exam-tools
   ./gcp/staging/scripts/deploy.sh
   ```

2. Configure SEMS on the VM:

   ```bash
   cd sems
   cp .env.staging.gcp.example .env.staging.gcp
   # Edit DATABASE_URL (host = monitoring-tools-cloud-sql-proxy-staging),
   # SECRET_KEY, GCS_*, CORS_ORIGINS, SUPER_ADMIN_*, REDUCTO_API_KEY
   ```

3. Deploy SEMS:

   ```bash
   chmod +x gcp/staging/scripts/deploy.sh
   ./gcp/staging/scripts/deploy.sh
   ```

`prestart.sh` runs **Alembic migrations** and **initial super admin** when the backend container starts.

## Smoke tests

After deploy:

- [ ] `https://monitoring.jamesyin.com` and `https://monitoring-api.jamesyin.com/health` still work (exam-tools unaffected)
- [ ] `https://sems-api.jamesyin.com/health` → `{"status":"ok"}`
- [ ] `https://sems.jamesyin.com` loads the UI (valid TLS)
- [ ] Login with the configured super admin (CORS + JWT)
- [ ] Upload a document and confirm the object appears under `gs://<bucket>/sems/documents/`
- [ ] Upload a candidate photo and confirm under `gs://<bucket>/sems/photos/`

## Frontend build note

- Compose omits `NEXT_PUBLIC_API_BASE_URL` so the browser derives `sems-api.<parent-domain>` ([`frontend/lib/api.ts`](../../frontend/lib/api.ts)).
- SSR uses `INTERNAL_API_BASE_URL=http://sems-backend:80`.

## Related documentation

- [exam-tools GCP staging](../../../exam-tools/gcp/staging/README.md) — shared VM, Traefik, Cloud SQL proxy
- [registration-portal GCP staging](../../../registration-portal/docs/gcp-staging-deployment.md) — project APIs and service accounts
