# Deployment Guide

## Prerequisites

- Docker Engine 24+ and Docker Compose v2
- Git

## Quick Start (5 minutes)

```bash
# 1. Clone the repository
git clone https://github.com/your-org/intellilog-ai.git
cd intellilog-ai

# 2. Start all services
docker compose up -d

# 3. Verify everything is running
docker compose ps

# 4. Open the platform
open http://localhost:3000
```

## What You Get

| Service       | URL                     | Credentials         |
|---------------|-------------------------|---------------------|
| Frontend      | http://localhost:3000   | —                   |
| API           | http://localhost:8000   | —                   |
| API Docs      | http://localhost:8000/docs | —                |
| PostgreSQL    | localhost:5432          | intellilog / intellilog |
| Redis         | localhost:6379          | —                   |
| Prometheus    | http://localhost:9090   | —                   |
| Grafana       | http://localhost:3001   | admin / admin       |

## Startup Order

1. **PostgreSQL** — health check via `pg_isready`
2. **Redis** — health check via `redis-cli ping`
3. **Backend API** — waits for Postgres + Redis, starts uvicorn with 4 workers, exposes `/health`
4. **Frontend** — waits for Backend healthy, serves SPA via nginx with API/WS proxy
5. **Prometheus** — waits for Backend healthy, scrapes `/metrics`
6. **Grafana** — waits for Prometheus healthy, auto-provisions datasource + dashboards

## Configuration

Copy `.env.docker` to `.env` and adjust values:

```bash
cp .env.docker .env
```

Key variables:

| Variable            | Default     | Description                          |
|---------------------|-------------|--------------------------------------|
| `POSTGRES_USER`     | intellilog  | PostgreSQL user                      |
| `POSTGRES_PASSWORD` | intellilog  | PostgreSQL password (CHANGE ME)      |
| `POSTGRES_DB`       | intellilog  | PostgreSQL database name             |
| `SECRET_KEY`        | (dev only)  | JWT signing key (CHANGE IN PROD)     |
| `ENVIRONMENT`       | production  | Runtime environment                  |
| `LOG_LEVEL`         | info        | Logging verbosity                    |
| `GRAFANA_USER`      | admin       | Grafana admin username               |
| `GRAFANA_PASSWORD`  | admin       | Grafana admin password (CHANGE ME)   |

## Production Hardening

### Secrets

```bash
# Generate a secure SECRET_KEY
openssl rand -hex 32
```

### TLS Termination

The nginx reverse proxy is part of the deployment. To enable HTTPS:

1. Place your certificate at `deploy/ssl/certs/intellilog.crt`
2. Place your key at `deploy/ssl/private/intellilog.key`
3. Uncomment the `ssl_*` lines in `deploy/nginx/prod.conf`
4. Uncomment the TLS volume mounts in `docker-compose.yml`

For Let's Encrypt:

```bash
docker run -it --rm -p 80:80 -v "$(pwd)/deploy/ssl:/etc/letsencrypt" certbot/certbot certonly --standalone -d your-domain.com
```

### Resource Limits

Add these to `docker-compose.yml` under each service:

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
    reservations:
      cpus: '0.5'
      memory: 512M
```

### Scaling

```bash
# Scale API workers
docker compose up -d --scale backend=3
```

## Monitoring

### Grafana Dashboards

Access at http://localhost:3001 (admin / admin).

Pre-provisioned dashboards:
- **IntelliLog-AI Overview** — API request rate, latency, error rate, active orders, agent decisions
- **Logistics Operations** — Order throughput, driver activity, route optimization metrics
- **System Health** — Database connections, Redis ops, Celery queue depth
- **Agent Monitoring** — Agent graph latency, tool invocation success rate
- **Prediction Monitoring** — Model accuracy, prediction latency, feature drift

### Prometheus Alerts

Alert rules are defined in `monitoring/alert_rules.yml`. Notable alerts:
- High-risk orders spiking (>10)
- Agent decision latency >2s
- Model predictions stopped
- API error rate >5%
- Database connection pool >90%
- Redis operations failing
- Model accuracy degraded <0.35

## Volumes

| Volume             | Service    | Path                            |
|--------------------|------------|---------------------------------|
| `postgres_data`    | Postgres   | `/var/lib/postgresql/data`      |
| `redis_data`       | Redis      | `/data`                         |
| `prometheus_data`  | Prometheus | `/prometheus`                   |
| `grafana_data`     | Grafana    | `/var/lib/grafana`              |

To reset all data:

```bash
docker compose down -v
```

## Troubleshooting

```bash
# View all logs
docker compose logs -f

# View specific service logs
docker compose logs -f backend
docker compose logs -f frontend

# Check health status
docker compose ps

# Restart a service
docker compose restart backend

# Rebuild images after code changes
docker compose build --no-cache backend
docker compose up -d

# Shell into a running container
docker compose exec backend bash

# Check backend health directly
curl http://localhost:8000/health
```

## CI/CD Integration

Example GitHub Actions workflow:

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: docker compose build
      - run: docker compose up -d
      - run: curl --retry 10 --retry-delay 5 http://localhost:8000/health
```

## Database

Migrations are managed with Alembic. To run manually:

```bash
docker compose exec backend alembic upgrade head
```

## Architecture

```
┌──────────────┐  :3000    ┌──────────────┐
│   Browser    │ ────────▶ │  Frontend    │
│  (React SPA) │ ◀──────── │  (nginx)     │
└──────────────┘           └──────┬───────┘
                                  │ /api/* /ws/*
                                  ▼
┌──────────────┐  :8000    ┌──────────────┐  :9090    ┌──────────────┐
│  Prometheus  │ ◀──────── │   Backend    │ ────────▶ │   Grafana    │
│  (metrics)   │           │  (uvicorn)   │           │ (dashboards) │
└──────────────┘           └──────┬───────┘           └──────────────┘
                                  │
                         ┌────────┴────────┐
                         ▼                 ▼
                  ┌──────────┐      ┌──────────┐
                  │ Postgres │      │  Redis   │
                  │   (db)   │      │ (cache)  │
                  └──────────┘      └──────────┘
```
