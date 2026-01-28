# EAMS - Examiner Allocation & Management System

A self-contained service for managing examiner registration, allocation, and annual engagement for script marking.

## Features

- **Examiner Registration**: One-time registration per subject with persistent profiles
- **Annual Allocation**: Automated allocation process with experience-based scoring
- **Quota Management**: Subject-specific quota enforcement (region, gender, etc.)
- **Waitlist Management**: Dynamic replacement when examiners decline
- **Acceptance Workflow**: Provisional approval with mandatory acceptance/decline
- **Reporting**: Allocation reports, quota compliance, and examiner history
- **Annual Reset**: Archive cycles while preserving examiner continuity


## Getting Started

### Prerequisites

- Docker and Docker Compose
- Python 3.13+ (for local development)
- PostgreSQL 18+ (or use Docker)

### Setup

1. Clone the repository and navigate to EAMS:
```bash
cd eams
```

2. Create `.env` file:
```env
DATABASE_URL=postgresql+asyncpg://eams_user:eams_password@eams-postgres:5432/eams_db
SECRET_KEY=your-secret-key-change-in-production
SYSTEM_ADMIN_EMAIL=admin@example.com
SYSTEM_ADMIN_PASSWORD=your-password
SYSTEM_ADMIN_FULL_NAME=System Administrator
```

3. Start services:
```bash
docker compose up -d
```

4. Run migrations:
```bash
docker compose exec eams-backend uv run alembic upgrade head
```

5. Access the service:
- API: http://localhost:8002
- API Docs: http://localhost:8002/docs
- Database: localhost:5434

## API Endpoints

### Authentication
- `POST /api/v1/auth/login` - Login
- `POST /api/v1/auth/register` - Register as examiner
- `GET /api/v1/auth/me` - Get current user

### Examiner Applications
- `POST /api/v1/examiner/applications` - Create application
- `GET /api/v1/examiner/applications` - List applications
- `PUT /api/v1/examiner/applications/{id}` - Update application
- `POST /api/v1/examiner/applications/{id}/submit` - Submit application

### Admin - Cycles
- `POST /api/v1/admin/cycles` - Create marking cycle
- `GET /api/v1/admin/cycles` - List cycles
- `PUT /api/v1/admin/cycles/{id}` - Update cycle
- `POST /api/v1/admin/cycles/{id}/open` - Open cycle
- `POST /api/v1/admin/cycles/{id}/close` - Close cycle
- `POST /api/v1/admin/cycles/{id}/archive` - Archive cycle

### Admin - Quotas
- `POST /api/v1/admin/quotas/cycles/{cycle_id}/subjects/{subject_id}` - Set quotas
- `GET /api/v1/admin/quotas/cycles/{cycle_id}/subjects/{subject_id}` - Get quotas

### Admin - Allocation
- `POST /api/v1/admin/allocations/cycles/{cycle_id}/subjects/{subject_id}/allocate` - Run allocation
- `POST /api/v1/admin/allocations/cycles/{cycle_id}/subjects/{subject_id}/promote-waitlist` - Promote waitlist
- `GET /api/v1/admin/allocations/cycles/{cycle_id}/subjects/{subject_id}` - View allocations

### Examiner - Acceptance
- `POST /api/v1/examiner/acceptances/{id}/accept` - Accept allocation
- `POST /api/v1/examiner/acceptances/{id}/decline` - Decline allocation
- `GET /api/v1/examiner/allocations` - List allocations

### Reports
- `GET /api/v1/admin/reports/allocations/{cycle_id}` - Allocation report
- `GET /api/v1/admin/reports/quota-compliance/{cycle_id}` - Quota compliance
- `GET /api/v1/examiner/reports/history` - Examiner history

## Development

See [backend/README.md](backend/README.md) for development setup instructions.

## License

Proprietary - Internal use only
