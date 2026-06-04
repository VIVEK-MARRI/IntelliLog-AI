## Production Architecture (High-level)

```mermaid
flowchart LR
  Browser -->|HTTP| Nginx[NGINX Reverse Proxy]
  Nginx --> Frontend[Frontend (NGINX)]
  Nginx --> Backend[Backend (FastAPI)]
  Backend --> Postgres[(PostgreSQL)]
  Backend --> Redis[(Redis)]
  Backend --> Prometheus[Prometheus]
  Grafana --> Prometheus
  Browser --> Grafana

  style Nginx fill:#f9f,stroke:#333,stroke-width:1px
```

Components:
- Nginx: reverse proxy that routes `/` to frontend and `/api` and `/ws` to backend.
- Frontend: static single-page app served by nginx in `frontend` container.
- Backend: FastAPI app exposing API and `/metrics` for Prometheus.
- Postgres: persistent DB volume.
- Redis: persistent data for caching and queuing.
- Prometheus + Grafana: monitoring and dashboards.
