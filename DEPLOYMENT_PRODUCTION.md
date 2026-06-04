# Production Deployment Guide

This document describes how to deploy IntelliLog-AI in a production-like environment using Docker Compose.

Prerequisites:
- Docker Engine
- Docker Compose v2 (or `docker compose`)
- Sane host resources (2+ CPU, 4+ GB RAM)

1) Create `.env.prod` from `.env.prod.example` and set secure secrets.

2) Build and start services:

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

3) Verify services:

- Backend health: `curl http://localhost/health`
- Frontend: `http://localhost/` (served by frontend container)
- Prometheus: `http://localhost:9090`
- Grafana: `http://localhost:3001` (default admin:admin)

4) Logs & troubleshooting:

- `docker compose -f docker-compose.prod.yml logs -f backend`
- `docker compose -f docker-compose.prod.yml ps`

5) Stop:

```bash
docker compose -f docker-compose.prod.yml down -v
```
