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

### Admin - Examinations
- `POST /api/v1/admin/examinations` - Create examination
- `GET /api/v1/admin/examinations` - List examinations
- `GET /api/v1/admin/examinations/{examination_id}` - Get examination
- `PUT /api/v1/admin/examinations/{examination_id}` - Update examination
- `GET /api/v1/admin/examinations/{examination_id}/subject-examiners` - List subject examiners for an examination

### Admin - Subject examiners
- `POST /api/v1/admin/examinations/{examination_id}/subject-examiners` - Create subject examiner
- `GET /api/v1/admin/subject-examiners/{subject_examiner_id}` - Get subject examiner
- `PUT /api/v1/admin/subject-examiners/{subject_examiner_id}` - Update subject examiner
- `POST /api/v1/admin/subject-examiners/{subject_examiner_id}/open` - Open subject examiner
- `POST /api/v1/admin/subject-examiners/{subject_examiner_id}/close` - Close subject examiner
- `POST /api/v1/admin/subject-examiners/{subject_examiner_id}/archive` - Archive subject examiner

### Admin - Quotas
- `GET /api/v1/admin/quotas/subject-examiners/{subject_examiner_id}` - Get quotas
- `PUT /api/v1/admin/quotas/subject-examiners/{subject_examiner_id}` - Set quotas (bulk)

### Admin - Invitations
- `POST /api/v1/admin/invitations/subject-examiners/{subject_examiner_id}/run` - Run invitation (or rerun; replaces existing)
- `POST /api/v1/admin/invitations/subject-examiners/{subject_examiner_id}/promote-waitlist` - Promote waitlist
- `GET /api/v1/admin/invitations/subject-examiners/{subject_examiner_id}` - List invitations
- `POST /api/v1/admin/invitations/subject-examiners/{subject_examiner_id}/notify` - Send invitations to approved examiners

### Examiner - Acceptance
- `POST /api/v1/examiner/acceptances/{id}/accept` - Accept invitation
- `POST /api/v1/examiner/acceptances/{id}/decline` - Decline invitation
- `GET /api/v1/examiner/allocations` - List my invitations (acceptances)

### Reports
- `GET /api/v1/admin/reports/invitations/{subject_examiner_id}` - Invitation report
- `GET /api/v1/admin/reports/quota-compliance/{subject_examiner_id}` - Quota compliance
- `GET /api/v1/examiner/reports/history` - Examiner history

## Development

See [backend/README.md](backend/README.md) for development setup instructions.

## License

Proprietary - Internal use only
