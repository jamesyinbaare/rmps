# Lazaar Monorepo

This monorepo contains the examination management system and related applications.

## Structure

```
lazaar/
├── registration-portal/    # Examination Registration Portal
│   ├── backend/            # FastAPI backend
│   ├── frontend/           # Next.js frontend
│   └── compose.yaml        # Docker Compose configuration
│
├── sems/                   # Smart Examination Management System (SEMS)
│   ├── backend/            # FastAPI backend
│   ├── frontend/           # Next.js frontend
│   └── compose.yaml        # Docker Compose configuration
│
└── README.md              # This file
```

## Packages

### Registration Portal

A separate public-facing examination registration portal with its own backend, frontend, and database.

**Features:**
- Bulk Registration (School Portal)
- Private Examination Registration
- Registration Period Management
- Data Export
- Examination Scheduling
- User Management

See [registration-portal/README.md](registration-portal/README.md) for details.

### SEMS (Smart Examination Management System)

The core examination management system that handles the complete examination lifecycle from registration through results release.

**Features:**
- Document Processing (ICM Studio)
- Score Data Entry (Digital, Automated, Manual)
- Results Processing & Validation
- Grade Management
- Workflow Management
- Analytics & Reporting

See [sems/README.md](sems/README.md) for details.

## Getting Started

Each package can be run independently using Docker Compose:

### Registration Portal

```bash
cd registration-portal
docker compose up -d
```

Access at:
- Frontend: http://localhost:3001
- Backend API: http://localhost:8001

### SEMS

```bash
cd sems
docker compose up -d
```

Access at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000

## Development

Each package maintains its own development setup. Refer to the individual package README files for setup instructions.

## Architecture

- **Registration Portal**: Separate public-facing system with own database
- **SEMS**: Main internal examination management system
- Both systems can operate independently or integrate as needed
