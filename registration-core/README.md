# Registration Core

Forked from `registration-portal` and trimmed to the five core domains. The original `registration-portal` app is left intact.

## Domains

1. **School registration** — school users register candidates (forms / bulk upload)
2. **Private candidate registration** — public accounts, multi-step registration, Paystack payment
3. **Results publishing** — admin upload, publish/unpublish, result blocks, access PINs
4. **Results checking** — public PIN/serial results check
5. **Registration admin dashboard** — exams, schools, programmes, subjects, fees, users, permissions, schedules, import/export

## Explicitly out of scope

Certificates, API marketplace / keys / verification, credits, and CTVET demo UI were removed from this copy.

Unused certificate/API/credit **database tables** remain in the ORM/migrations for v1 (no Alembic squash). They are not exposed by routers.

## Architecture

- **Backend**: FastAPI (Python)
- **Frontend**: Next.js (TypeScript)
- **Database**: PostgreSQL (`registration_core_db`)

## Ports (do not collide with registration-portal)

| Service  | Port |
|----------|------|
| Frontend | 3002 |
| Backend  | 8002 |
| Postgres | 5434 |
| PgAdmin  | 5051 |
| Mailpit UI | 8025 |
| Mailpit SMTP | 1025 |

## Quick start

```bash
cp .env.example .env
# edit SYSTEM_ADMIN_* and POSTGRES_* as needed
docker compose up -d
```

- Frontend: http://localhost:3002
- Backend API: http://localhost:8002
- OpenAPI docs: http://localhost:8002/docs
- Mailpit (dev inbox): http://localhost:8025

## Development without Docker

### Backend

```bash
cd backend
uv sync
uv run fastapi dev app/main.py --host 0.0.0.0 --port 8002
```

### Frontend

```bash
cd frontend
npm install
NEXT_PUBLIC_API_BASE_URL=http://localhost:8002 npm run dev
```

## Router map

| Module | Path |
|--------|------|
| Auth | `backend/app/routers/auth.py` |
| School registration | `backend/app/routers/school.py` |
| Private registration | `backend/app/routers/private.py` |
| Registration admin | `backend/app/routers/admin_registration.py` |
| Results publishing | `backend/app/routers/admin_results.py` |
| Public results check | `backend/app/routers/public.py` |
| Permissions | `backend/app/routers/permissions.py` |
