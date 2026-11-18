# Registration Portal Backend

Backend API for the Examination Registration Portal.

## Setup

1. Install dependencies:
```bash
uv sync
```

2. Configure environment variables (create `.env` file):
```
DATABASE_URL=postgresql+asyncpg://user:password@localhost/registration_portal_db
SECRET_KEY=your-secret-key-here
SYSTEM_ADMIN_EMAIL=admin@example.com
SYSTEM_ADMIN_PASSWORD=your-secure-password
SYSTEM_ADMIN_FULL_NAME=System Administrator
```

3. Run migrations:
```bash
alembic upgrade head
```

4. Start the server:
```bash
uvicorn app.main:app --reload --port 8001
```

The API will be available at `http://localhost:8001`

## API Documentation

Once running, API documentation is available at:
- Swagger UI: `http://localhost:8001/docs`
- ReDoc: `http://localhost:8001/redoc`
