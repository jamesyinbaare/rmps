# Traefik Deployment Setup Guide

This guide explains how to deploy the registration portal locally using Traefik as a reverse proxy. This setup simulates a production environment and is useful for testing before deploying to Google Cloud Platform.

## Prerequisites

- Docker and Docker Compose installed
- Ports 80, 443, and 8080 available on your machine
- Access to configure `/etc/hosts` file (for local domain names)

## Architecture

```
Internet/User
    ↓
Traefik (Port 80/443)
    ├── Frontend (Next.js) - https://frontend.localhost or https://localhost
    └── Backend (FastAPI) - https://api.backend.localhost
```

## Setup Steps

### 1. Configure Hosts File

Add the following entries to your `/etc/hosts` file (Linux/Mac) or `C:\Windows\System32\drivers\etc\hosts` (Windows):

```
127.0.0.1 frontend.localhost
127.0.0.1 api.backend.localhost
127.0.0.1 traefik.localhost
```

### 2. Create Environment File

Copy the example environment file and update with your values:

```bash
cd registration-portal
cp .env.deploy.example .env.deploy
```

Edit `.env.deploy` and update:
- Database credentials
- Secret keys (use strong, random values)
- System admin credentials
- Any other configuration as needed

### 3. Initialize Let's Encrypt Certificate Storage

Create the acme.json file for Let's Encrypt certificates (staging for testing):

```bash
mkdir -p traefik
touch traefik/acme.json
chmod 600 traefik/acme.json
```

**Note:** The acme.json file will be automatically created by Traefik if it doesn't exist, but you can create it manually with proper permissions.

### 4. Update Traefik Configuration

Edit `traefik/traefik.yml` and update the Let's Encrypt email:

```yaml
certificatesResolvers:
  letsencrypt:
    acme:
      email: your-email@example.com  # Update with your email
```

For production, change the CA server to the production endpoint:
```yaml
caServer: "https://acme-v02.api.letsencrypt.org/directory"
```

### 5. Build and Start Services

Build and start the deployment stack:

```bash
docker compose -f compose.deploy.yaml build
docker compose -f compose.deploy.yaml up -d
```

### 6. Verify Deployment

Check that all services are running:

```bash
docker compose -f compose.deploy.yaml ps
```

Access the services:

- **Frontend**: https://frontend.localhost or https://localhost
- **Backend API**: https://api.backend.localhost
- **Traefik Dashboard**: http://traefik.localhost:8080

### 7. Check Certificate Status

Let's Encrypt certificates (staging) will be generated automatically. Check the Traefik logs:

```bash
docker compose -f compose.deploy.yaml logs traefik
```

## Configuration Details

### Routing Strategy

The deployment uses domain-based routing:

- `frontend.localhost` → Frontend service (Next.js)
- `api.backend.localhost` → Backend service (FastAPI)
- `traefik.localhost:8080` → Traefik dashboard

### SSL/TLS

- **Staging**: Uses Let's Encrypt staging certificates for testing
- **Production**: Update `traefik.yml` to use the production Let's Encrypt endpoint

### Service Discovery

Traefik automatically discovers services via Docker labels configured in `compose.deploy.yaml`.

### Health Checks

All services include health checks to ensure proper startup order:
- Backend: `/health` endpoint
- Frontend: HTTP check on port 3001
- PostgreSQL: `pg_isready` check

## Troubleshooting

### Certificate Issues

If certificates aren't being generated:

1. Check Traefik logs: `docker compose -f compose.deploy.yaml logs traefik`
2. Verify hosts file entries are correct
3. Ensure ports 80 and 443 are accessible
4. Check firewall rules

### Connection Issues

If services aren't accessible:

1. Verify services are running: `docker compose -f compose.deploy.yaml ps`
2. Check service logs: `docker compose -f compose.deploy.yaml logs <service-name>`
3. Verify Traefik routing: Access the Traefik dashboard at http://traefik.localhost:8080
4. Check network configuration: `docker network inspect registration-network`

### Frontend Can't Connect to Backend

If the frontend can't reach the backend:

1. Verify `NEXT_PUBLIC_API_BASE_URL` in `.env.deploy` matches the Traefik backend route
2. Check CORS configuration in `backend/app/main.py`
3. Verify both services are on the same Docker network

### Database Connection Issues

If the backend can't connect to PostgreSQL:

1. Check database credentials in `.env.deploy`
2. Verify PostgreSQL service is healthy: `docker compose -f compose.deploy.yaml ps registration_postgres`
3. Check database logs: `docker compose -f compose.deploy.yaml logs registration_postgres`

## Development vs Deployment

### Development (`compose.yaml`)

- Direct port mapping (3001 for frontend, 8001 for backend)
- Development mode with hot reload
- No SSL/TLS
- Direct access: `http://localhost:3001` and `http://localhost:8001`

### Deployment (`compose.deploy.yaml`)

- Traefik reverse proxy
- Production builds
- SSL/TLS with Let's Encrypt
- Domain-based routing
- Automatic HTTPS redirect

## Production Considerations

Before deploying to production:

1. **Update Let's Encrypt configuration**: Change to production endpoint in `traefik/traefik.yml`
2. **Update environment variables**: Use production values for all secrets and configurations
3. **Enable Traefik dashboard authentication**: Set `api.insecure=false` and configure authentication
4. **Review security headers**: Ensure security middleware is properly configured
5. **Configure proper domains**: Update hosts/routing for actual production domains
6. **Set up monitoring**: Configure logging and monitoring for production use
7. **Backup strategy**: Ensure database and storage volumes are backed up

## Useful Commands

```bash
# Start deployment stack
docker compose -f compose.deploy.yaml up -d

# Stop deployment stack
docker compose -f compose.deploy.yaml down

# View logs
docker compose -f compose.deploy.yaml logs -f

# Rebuild services
docker compose -f compose.deploy.yaml build --no-cache

# Restart a specific service
docker compose -f compose.deploy.yaml restart <service-name>

# Access Traefik dashboard
open http://traefik.localhost:8080
```

## Next Steps

After successfully testing locally with Traefik:

1. Update the plan for GCP deployment
2. Configure Cloud SQL for PostgreSQL
3. Set up Google Cloud Storage for file storage
4. Configure production domains and DNS
5. Set up CI/CD pipeline for deployment
