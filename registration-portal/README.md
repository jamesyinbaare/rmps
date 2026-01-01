# Examination Registration Portal

A separate public-facing examination registration portal with its own backend, frontend, and database.

## Features

1. **Bulk Registration (School Portal)**: Authenticated school users register multiple candidates via forms or CSV/Excel upload
2. **Private Examination Registration**: Individual users create accounts and register for examinations
3. **Registration Period Management**: Track registration start/end dates per exam
4. **Data Export**: System administrators export registration data for import into the main system
5. **Examination Scheduling**: Set examination date and time for each subject, enable timetable download
6. **User Management**: System admins create school admin users; school admins create/manage school users

## Architecture

- **Backend**: FastAPI (Python) - separate from main system
- **Frontend**: Next.js (TypeScript) - separate from main system
- **Database**: PostgreSQL - separate database from main system

## Quick Start with Docker Compose

1. Create a `.env` file in the `registration-portal` directory (copy from `.env.example`):
```bash
cp .env.example .env
```

2. Update the `.env` file with your configuration (especially database credentials and system admin details).

3. Start all services:
```bash
docker compose up -d
```

This will start:
- PostgreSQL database on port 5433
- Backend API on port 8001
- Frontend on port 3001

4. Access the services:
- Backend API: http://localhost:8001
- API Documentation: http://localhost:8001/docs
- Frontend: http://localhost:3001

## Development

### Backend

See `backend/README.md` for backend setup instructions.

### Frontend

See `frontend/README.md` for frontend setup instructions.

## Project Structure

```
registration-portal/
├── backend/          # FastAPI backend
├── frontend/         # Next.js frontend
├── compose.yaml      # Docker Compose configuration
├── .env.example      # Environment variables template
└── README.md
```

## Environment Variables

Key environment variables (see `.env.example` for full list):

- `DATABASE_URL`: PostgreSQL connection string
- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `REGISTRATION_POSTGRES_DB`: Database credentials
- `SECRET_KEY`: JWT secret key (change in production!)
- `SYSTEM_ADMIN_EMAIL`, `SYSTEM_ADMIN_PASSWORD`, `SYSTEM_ADMIN_FULL_NAME`: Initial system admin user
