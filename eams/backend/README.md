# EAMS Backend

Examiner Allocation & Management System - Backend Service

## Setup

1. Install dependencies:
```bash
uv sync
```

2. Set up environment variables in `.env`:
```
DATABASE_URL=postgresql+asyncpg://user:password@localhost:5434/eams_db
SECRET_KEY=your-secret-key-here
SYSTEM_ADMIN_EMAIL=admin@example.com
SYSTEM_ADMIN_PASSWORD=your-password
SYSTEM_ADMIN_FULL_NAME=System Administrator
```

3. Run migrations:
```bash
uv run alembic upgrade head
```

4. Run the server:
```bash
uv run fastapi dev app/main.py
```

## Development

The service runs on port 8002 (or 80 inside Docker).

API documentation available at: http://localhost:8002/docs
