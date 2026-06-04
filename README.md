<div align="center">

<img src="https://img.shields.io/badge/IntelliLog-AI-0A66C2?style=for-the-badge&logo=artificial-intelligence&logoColor=white" alt="IntelliLog AI"/>

# IntelliLog AI

### AI-Powered Logistics Intelligence Platform for Predictive Delivery Operations

Turning reactive exception handling into a proactive, real-time control loop for fleet operations.

<br/>

![Python](https://img.shields.io/badge/Python-3.13%2B-3776AB?style=for-the-badge&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115%2B-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15%2B-336791?style=for-the-badge&logo=postgresql&logoColor=white)
![TimescaleDB](https://img.shields.io/badge/TimescaleDB-Hypertable-FDB515?style=for-the-badge&logo=timescale&logoColor=black)
![Redis](https://img.shields.io/badge/Redis-7-DC382D?style=for-the-badge&logo=redis&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=for-the-badge&logo=docker&logoColor=white)

![XGBoost](https://img.shields.io/badge/XGBoost-ML%20Model-EE4C2C?style=for-the-badge)
![SHAP](https://img.shields.io/badge/SHAP-Explainability-FF6B6B?style=for-the-badge)
![LangGraph](https://img.shields.io/badge/LangGraph-Agent%20Workflow-1C3C3C?style=for-the-badge&logo=langchain&logoColor=white)
![OR-Tools](https://img.shields.io/badge/Google%20OR--Tools-Route%20Optimization-4285F4?style=for-the-badge&logo=google&logoColor=white)
![Prometheus](https://img.shields.io/badge/Prometheus-Metrics-E6522C?style=for-the-badge&logo=prometheus&logoColor=white)
![Grafana](https://img.shields.io/badge/Grafana-Dashboards-F46800?style=for-the-badge&logo=grafana&logoColor=white)

![License](https://img.shields.io/badge/License-MIT-22C55E?style=for-the-badge)
![Coverage](https://img.shields.io/badge/Coverage-77%25-22C55E?style=for-the-badge)
![Tests](https://img.shields.io/badge/Tests-117%2F135%20Passed-22C55E?style=for-the-badge)
![Status](https://img.shields.io/badge/Status-Production%20Ready-00B7C2?style=for-the-badge)

<br/>

[**Overview**](#-overview) · [**Architecture**](#-system-architecture) · [**Features**](#-key-features) · [**Tech Stack**](#-technology-stack) · [**Quick Start**](#-quick-start) · [**Deployment**](#-docker-deployment) · [**API**](#-api-surface) · [**Roadmap**](#-future-roadmap)

</div>

---

## Table of Contents

- [Overview](#-overview)
- [Problem Statement](#-problem-statement)
- [Solution](#-solution)
- [Key Features](#-key-features)
- [System Architecture](#-system-architecture)
  - [High-Level Architecture](#high-level-architecture)
  - [Real-Time Event Pipeline](#real-time-event-pipeline)
  - [Data & Storage Architecture](#data--storage-architecture)
  - [End-to-End Sequence](#end-to-end-sequence)
  - [ML Inference Pipeline](#ml-inference-pipeline)
  - [Deployment Topology](#deployment-topology)
- [Technology Stack](#-technology-stack)
- [Project Structure](#-project-structure)
- [Quick Start](#-quick-start)
- [Docker Deployment](#-docker-deployment)
- [API Surface](#-api-surface)
- [Observability](#-observability--monitoring)
- [Testing & Quality](#-testing--quality)
- [Performance Highlights](#-performance-highlights)
- [Security](#-security)
- [Future Roadmap](#-future-roadmap)
- [Contributing](#-contributing)
- [License](#-license)
- [Acknowledgements](#-acknowledgements)

---

## Overview

**IntelliLog AI** is an end-to-end, production-grade logistics intelligence platform that unifies **machine learning**, **explainable AI (XSHAP)**, **autonomous LangGraph agents**, **route optimization (OR-Tools)**, **real-time event streaming**, and **operational analytics** into a single, coherent system.

The platform ingests real-time GPS events, builds operational features, scores delivery risk with an XGBoost model, explains the score with SHAP, and routes the result into a delay-prevention agent that can recommend or trigger follow-up actions — all before an SLA breach occurs.

> **Mission:** Move logistics from reactive exception handling → proactive delivery prevention.

---

## Problem Statement

Traditional logistics operations are still largely reactive. Teams learn about a late delivery **after** the SLA is already at risk, then spend time manually diagnosing:

- What happened?
- Which route to change?
- Which driver to contact?
- Which customer to notify?

This creates recurring business problems:

| Pain Point | Business Impact |
|---|---|
| **Delivery delays** | Degraded customer trust and SLA performance |
| **Route inefficiency** | Higher fuel cost, idle time, missed handoffs |
| **Limited fleet visibility** | Slow, inconsistent exception handling |
| **Manual decision making** | Operational bottlenecks at scale |
| **No early-warning signals** | Support escalations & dispatch rework |

The cost is direct: **lower on-time delivery rates, higher OPEX, more escalations, less confidence in dispatch decisions.**

---

## Solution

IntelliLog AI turns logistics into a **predictive control loop**.

The platform continuously:

1. **Ingests** real-time GPS events from driver devices.
2. **Builds** operational features (ETA drift, stop progress, driver performance).
3. **Scores** delivery risk with a trained XGBoost model.
4. **Explains** the score with SHAP feature attributions.
5. **Routes** the result into a LangGraph delay-prevention agent.
6. **Optimizes** routes via Google OR-Tools when recovery is possible.
7. **Persists** state to PostgreSQL + TimescaleDB and **broadcasts** via Redis Pub/Sub + WebSockets.
8. **Observes** everything through Prometheus + Grafana.

> **Outcome:** Dispatch teams see risk earlier, understand *why* it's rising, and act on the same timeline as the delivery — not after the breach.

---

## Key Features

| Feature | Description |
|---|---|
| Real-Time Fleet Tracking | Live GPS ingestion, WebSocket broadcasts, continuous fleet state updates |
| Delay Prediction Engine | XGBoost inference pipeline scoring risk from operational signals |
| Explainable AI (XAI) | SHAP-based top contributing factors for every risk score |
| Delay Prevention Agent | LangGraph-powered decision layer with action orchestration |
| Route Optimization | Google OR-Tools for stop ordering & recovery planning |
| Operations Copilot | Decision-support UI for dispatchers & ops teams |
| Executive Dashboard | Fleet health, late-delivery exposure, service trend lines |
| Real-Time Event Processing | Redis Pub/Sub for low-latency event distribution |
| Multi-Tenant by Design | Row-Level Security (RLS) in PostgreSQL |
| Observability Stack | Prometheus metrics + Grafana dashboards + health checks |
| Production Deployment | Docker, Docker Compose, Nginx reverse proxy |
| Historical Simulator | Realistic 10,000-record dataset with 21% realistic late rate |

---

## System Architecture

### High-Level Architecture

```mermaid
flowchart LR
  subgraph Clients
    DR[Driver Devices]
    DS[Dispatchers / Ops]
    EX[Executives]
  end

  subgraph Edge
    NG[Nginx Reverse Proxy]
  end

  subgraph Frontend
    FD[React + TypeScript UI]
  end

  subgraph Backend
    API[FastAPI REST + WebSocket]
    FE[Feature Engineering]
    ML[Prediction Service]
    SHAP[SHAP Engine]
    AG[LangGraph Delay Agent]
    RO[OR-Tools Optimizer]
    SIM[Delivery Simulator]
  end

  subgraph Data
    PG[(PostgreSQL + TimescaleDB)]
    RD[(Redis Cache + Pub/Sub)]
  end

  subgraph Observability
    PROM[Prometheus]
    GRAF[Grafana]
  end

  DR -->|GPS Stream| NG
  NG --> API
  DS --> FD
  EX --> FD
  FD <-->|WS + REST| API
  API --> FE --> ML
  ML --> SHAP
  ML --> AG
  AG --> RO
  AG --> PG
  AG --> RD
  API --> PG
  API --> RD
  SIM --> PG
  SIM --> RD
  API --> PROM --> GRAF
  RD -.->|Pub/Sub| API
  API -.->|Broadcast| FD
```

### Real-Time Event Pipeline

```mermaid
flowchart LR
  A[GPS Ping] --> B[FastAPI Ingest]
  B --> C{Feature Builder}
  C -->|Cache Hit| D[Redis Feature Cache]
  C -->|Cache Miss| E[Compute Features]
  E --> D
  D --> F[XGBoost Predict]
  F --> G[SHAP Explain]
  G --> H{Risk Threshold}
  H -->|Low| I[Log + Continue]
  H -->|Medium| J[LangGraph Agent]
  H -->|High| J
  J --> K[Decision]
  K -->|Reroute| L[OR-Tools Optimizer]
  K -->|Alert| M[Customer Notification]
  K -->|Escalate| N[Ops Console]
  J --> O[(PostgreSQL)]
  J --> P[Redis Pub/Sub]
  P --> Q[WebSocket Fan-out]
  Q --> R[Live Dashboard]
```

### Data & Storage Architecture

```mermaid
flowchart TB
  subgraph PostgreSQL[PostgreSQL 15 + TimescaleDB]
    T1[(tenants)]
    T2[(drivers)]
    T3[(orders)]
    T4[(gps_pings - Hypertable)]
    T5[(agent_decisions)]
    T6[(route_plans)]
  end

  subgraph Redis[Redis 7]
    R1[order:state:{id} - 4h TTL]
    R2[fleet:{tenant}:positions - 30m TTL]
    R3[features:{order_id} - 5m TTL]
    R4[Pub/Sub Channels]
  end

  FE[Feature Engineering] --> R3
  R3 --> ML[ML Service]
  ML --> AG[Agent]
  AG --> T5
  AG --> T6
  AG --> R1
  AG --> R2
  AG --> R4
  GPS[GPS Stream] --> T4
  GPS --> FE
```

### End-to-End Sequence

```mermaid
sequenceDiagram
  autonumber
  participant D as Driver Device
  participant API as FastAPI
  participant FE as Feature Engineering
  participant ML as Prediction Service
  participant SH as SHAP Engine
  participant AG as Delay Prevention Agent
  participant RO as Route Optimizer
  participant RD as Redis
  participant PG as PostgreSQL
  participant WS as WebSocket Layer
  participant UI as Dashboard

  D->>API: Order created / GPS update
  API->>FE: Build operational features
  FE->>RD: Read/Write feature cache
  FE->>ML: Score delay risk
  ML->>SH: Explain top risk factors
  ML->>AG: Emit risk score + context
  AG->>RO: Request route optimization (if needed)
  RO-->>AG: Optimized sequence
  AG->>PG: Persist decision + plan
  AG->>RD: Publish live state
  RD->>WS: Broadcast event
  WS->>UI: Push live update
  UI->>API: Refresh order / fleet view
```

### ML Inference Pipeline

```mermaid
flowchart LR
  H[Historical Data<br/>10K records] --> T[Train XGBoost]
  T --> M[(model.pkl)]
  M --> P[Predict API]
  F[Live Features] --> P
  P --> S[SHAP Values]
  S --> E[Explanation]
  P --> R[Risk Score 0-1]
  R --> AG[Agent]
  E --> AG
```

### Deployment Topology

```mermaid
flowchart TB
  subgraph Docker[Docker Compose Stack]
    N[Nginx<br/>:80/:443]
    FE[Frontend<br/>Static SPA]
    BE[FastAPI Backend<br/>:8000]
    PG[(PostgreSQL<br/>+ TimescaleDB)]
    RD[(Redis 7)]
    PR[Prometheus<br/>:9090]
    GR[Grafana<br/>:3000]
  end

  U[User Browser] --> N
  N --> FE
  N --> BE
  BE --> PG
  BE --> RD
  BE --> PR
  PR --> GR
  GR --> U
```

---

## Technology Stack

### Backend

| Layer | Technology | Purpose |
|---|---|---|
| API Framework | **FastAPI** (0.115+) | REST + WebSocket async application layer |
| ASGI Server | **Uvicorn** | High-performance async server |
| ORM | **SQLAlchemy 2.x** | Type-safe database access |
| Migrations | **Alembic** | Versioned schema migrations |
| Validation | **Pydantic v2** | Request/response data validation |
| Task Queue | **Celery** (optional) | Background scheduling |

### Data & Storage

| Layer | Technology | Purpose |
|---|---|---|
| RDBMS | **PostgreSQL 15+** | Persistent relational store |
| Time-Series | **TimescaleDB** | Hypertable for GPS pings (auto-compression) |
| Cache / Events | **Redis 7** | Live state, pub/sub, feature cache |
| Driver | **psycopg2 / asyncpg** | PostgreSQL connectivity |

### AI / ML

| Layer | Technology | Purpose |
|---|---|---|
| Model | **XGBoost** | Gradient-boosted delay classifier |
| Explainability | **SHAP** | Per-prediction feature attribution |
| Agent Orchestration | **LangGraph** | Multi-step delay-prevention workflow |
| Optimization | **Google OR-Tools** | Vehicle routing & stop sequencing |
| Data | **Pandas / NumPy / Scikit-Learn** | Feature engineering & evaluation |

### Frontend

| Layer | Technology | Purpose |
|---|---|---|
| Framework | **React 18 + TypeScript 5** | Type-safe SPA |
| Build | **Vite** | Fast dev server & HMR |
| Styling | **TailwindCSS** | Utility-first design system |
| State | **Zustand** | Lightweight global state |
| Data Fetching | **React Query (TanStack)** | Server-state cache |
| Maps | **Leaflet** | Live fleet visualization |
| Charts | **Recharts** | Dashboards & trend lines |
| 3D Visuals | **Three.js / React Three Fiber** | Hero & conceptual scenes |
| Testing | **Playwright** | End-to-end browser tests |

### Infrastructure & Ops

| Layer | Technology | Purpose |
|---|---|---|
| Containerization | **Docker + Docker Compose** | Reproducible builds & deployment |
| Reverse Proxy | **Nginx** | TLS, routing, static serving |
| Metrics | **Prometheus** | Time-series metrics scraping |
| Dashboards | **Grafana** | Operational visualization |
| Testing (Py) | **Pytest + pytest-asyncio** | Backend test suite |
| Linting | **Ruff + Black + Mypy** | Code quality & type safety |

---

## Project Structure

```text
IntelliLog-AI/
├── backend/                          # Backend observability & app bootstrap
│   └── app/
│       └── observability/            # Prometheus / health endpoints
├── deploy/                           # Production deployment assets
│   ├── nginx/                        # Reverse proxy configs
│   └── prometheus/                   # Prometheus scrape configs
├── frontend/                         # React + TypeScript SPA
│   ├── src/
│   │   ├── api/                      # API client layer
│   │   ├── components/               # UI components
│   │   │   ├── agent/                # Agent workflow UI
│   │   │   ├── copilot/              # AI copilot
│   │   │   ├── fleet/                # Live fleet tracking
│   │   │   ├── insights/             # Analytics widgets
│   │   │   ├── intelligence/         # ML/AI components
│   │   │   ├── layout/               # App shell
│   │   │   ├── modals/               # Dialog flows
│   │   │   ├── notifications/        # Toast & alerts
│   │   │   ├── orders/               # Order management
│   │   │   ├── predictions/          # Risk visualizations
│   │   │   └── shared/               # Reusable primitives
│   │   ├── hooks/                    # Custom React hooks
│   │   ├── pages/                    # Route-level pages
│   │   ├── store/                    # Zustand stores
│   │   ├── types/                    # TS type definitions
│   │   └── utils/                    # Helpers
│   ├── tests/
│   │   ├── e2e/                      # Playwright flows
│   │   ├── unit/                     # Component tests
│   │   └── load/                     # Performance tests
│   └── Dockerfile
├── src/                              # Python application core
│   ├── agent/                        # LangGraph delay-prevention agent
│   ├── api/                          # FastAPI routes & WebSockets
│   │   ├── routers/                  # Versioned endpoints
│   │   └── services/                 # API-level services
│   ├── core/                         # Settings, config, security
│   ├── db/                           # Models, sessions, repositories
│   ├── ml/                           # XGBoost + SHAP pipeline
│   ├── optimization/                 # OR-Tools routing
│   ├── services/                     # Domain services
│   └── simulator/                    # Delivery event simulator
├── tests/                            # Backend test suite
│   ├── api/
│   ├── integration/
│   ├── unit/
│   ├── websocket/
│   ├── e2e/
│   └── performance/
├── alembic/                          # Database migrations
├── models/                           # Trained ML artifacts
├── data/                             # Historical datasets (Parquet)
├── monitoring/                       # Grafana dashboards
├── docs/                             # Documentation assets
├── scripts/                          # Operational scripts
├── Dockerfile                        # Backend image
├── docker-compose.dev.yml
├── docker-compose.prod.yml
├── pyproject.toml
├── requirements.txt
├── alembic.ini
├── .env.prod.example
└── README.md
```

---

## Quick Start

### Prerequisites

- **Python** ≥ 3.13
- **Node.js** ≥ 18 & **npm** ≥ 9
- **PostgreSQL** 15+ (with TimescaleDB extension)
- **Redis** 7+
- **Docker** + **Docker Compose** (recommended)

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/IntelliLog-AI.git
cd IntelliLog-AI
```

### 2. Create a Virtual Environment

```bash
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate
```

### 3. Install Backend Dependencies

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

### 4. Install Frontend Dependencies

```bash
cd frontend
npm install
cd ..
```

### 5. Configure Environment

```bash
cp .env.prod.example .env
```

Edit `.env` with your PostgreSQL DSN, Redis URL, and application secrets.

### 6. Run Database Migrations

```bash
alembic upgrade head
```

### 7. Generate Historical Data (Optional)

```bash
python generate_historical_data.py
# Produces data/historical_deliveries.parquet (10,000 records)
```

### 8. Start the Backend

```bash
uvicorn src.api.main:app --reload --host 0.0.0.0 --port 8000
```

API is available at: **http://localhost:8000**  
Interactive docs: **http://localhost:8000/docs**

### 9. Start the Frontend

```bash
cd frontend
npm run dev
```

UI is available at: **http://localhost:5173**

---

## Docker Deployment

Production-style single-command deployment:

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

### Services Brought Up

| Service | Port | Description |
|---|---|---|
| Nginx | 80 / 443 | Reverse proxy + TLS termination |
| Frontend | — | Static SPA served via Nginx |
| Backend | 8000 | FastAPI application |
| PostgreSQL | 5432 | Persistent relational store |
| Redis | 6379 | Cache + Pub/Sub |
| Prometheus | 9090 | Metrics scraping |
| Grafana | 3000 | Operational dashboards |

### Health & Status

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f backend
```

---

## API Surface

> Full OpenAPI spec is served at `/docs` (Swagger UI) and `/redoc` (ReDoc).

| Module | Endpoint Group | Description |
|---|---|---|
| **Orders** | `/api/v1/orders` | CRUD + lifecycle for delivery orders |
| **Fleet** | `/api/v1/fleet` | Live fleet positions, driver status |
| **Predictions** | `/api/v1/predictions` | Delay risk scores + SHAP explanations |
| **Agent** | `/api/v1/agent` | Trigger delay-prevention workflow, view decisions |
| **Optimization** | `/api/v1/optimize` | Route re-sequencing via OR-Tools |
| **Copilot** | `/api/v1/copilot` | Conversational decision-support |
| **Analytics** | `/api/v1/analytics` | Executive KPIs and trend lines |
| **WebSocket** | `/ws/*` | Live GPS, risk updates, agent events |
| **Health** | `/health`, `/ready`, `/metrics` | Liveness, readiness, Prometheus metrics |

### Example: Score a Delivery

```bash
curl -X POST http://localhost:8000/api/v1/predictions/score \
  -H "Content-Type: application/json" \
  -d '{
    "order_id": "ord_8f12c",
    "features": {
      "distance_remaining_km": 12.5,
      "time_remaining_minutes": 18.0,
      "current_speed_kmh": 45.2,
      "stops_remaining": 3,
      "weather_condition": "clear",
      "driver_on_time_rate": 0.87
    }
  }'
```

Response:

```json
{
  "order_id": "ord_8f12c",
  "risk_score": 0.68,
  "risk_level": "high",
  "top_factors": [
    {"feature": "eta_drift_minutes", "shap_value": 0.21},
    {"feature": "stops_remaining",    "shap_value": 0.14},
    {"feature": "driver_on_time_rate","shap_value": -0.07}
  ],
  "recommended_action": "reroute"
}
```

---

## Observability & Monitoring

IntelliLog AI ships with a **production observability stack**:

```mermaid
flowchart LR
  BE[FastAPI Backend] -->|/metrics| PROM[Prometheus]
  PROM --> GRAF[Grafana Dashboards]
  BE -->|/health| LB[Load Balancer]
  BE -->|/ready| K8S[Kubernetes Probes]
  LOGS[Structured Logs] --> LOG_AGG[(Log Aggregator)]
```

- **Prometheus** scrapes backend `/metrics` for HTTP latency, prediction latency, agent decisions, and queue depth.
- **Grafana** provides pre-built dashboards for fleet health, service latency, risk distribution, and deployment stability.
- **Health checks** are defined per service in the production compose file.
- **Structured logging** is JSON-formatted for ingestion by ELK / Loki / CloudWatch.

---

## Testing & Quality

```bash
pytest -q
pytest --cov=src --cov-report=term-missing
```

### Validation Snapshot

| Metric | Value |
|---|---|
| Tests executed | 135 |
| Passed | 117 |
| Skipped | 18 |
| Failed | 0 |
| Coverage | 77% |
| Type hints | 100% |
| Docstrings | 100% |

### Test Categories

- `tests/unit/` — isolated component tests
- `tests/api/` — HTTP route validation
- `tests/integration/` — service boundary tests
- `tests/websocket/` — real-time channel tests
- `tests/e2e/` — full workflow scenarios
- `tests/performance/` — latency & throughput checks
- `frontend/tests/e2e/` — Playwright browser flows

---

## Performance Highlights

| Surface | Target | Notes |
|---|---|---|
| Prediction latency | **< 50 ms** | Interactive scoring |
| WebSocket fan-out | **< 100 ms** | Live event propagation |
| Redis lookup | **< 1 ms** | Order state hot path |
| GPS insert | **< 10 ms** | TimescaleDB compression |
| Order lookup | **< 2 ms** | Indexed by tenant + status |
| Pub/Sub broadcast | **< 5 ms** | Redis → WebSocket |

---

## Security

- **Multi-tenant isolation** via PostgreSQL Row-Level Security (RLS)
- **No hardcoded credentials** — environment-driven configuration
- **Pydantic v2** validation on every API boundary
- **Type-safe** end-to-end (TypeScript + Python type hints)
- **TLS termination** at Nginx
- **CORS** allow-listing per environment
- **Secrets** managed via `.env` (not committed)

---

## Future Roadmap

```mermaid
timeline
  title IntelliLog AI Roadmap
  Q3 2026 : Driver Mobile App (iOS + Android)
          : Multi-Agent Coordination
  Q4 2026 : Reinforcement Learning Route Optimizer
          : LLM-Powered Supply Chain Analytics
  Q1 2027 : Kubernetes-native deployment
          : Multi-region active/active
  Q2 2027 : Carbon footprint analytics
          : Predictive maintenance signals
```

| Initiative | Status | Target |
|---|---|---|
| Driver Mobile App | Planned | Q3 2026 |
| Multi-Agent Coordination | Planned | Q3 2026 |
| Reinforcement Learning Optimization | Research | Q4 2026 |
| LLM Supply Chain Analytics | Research | Q4 2026 |
| Kubernetes Deployment | Planned | Q1 2027 |
| Carbon Footprint Module | Planned | Q2 2027 |

---

## Contributing

Contributions are welcome. Please follow these steps:

1. **Fork** the repository.
2. Create a **feature branch** (`git checkout -b feature/amazing-feature`).
3. **Commit** your changes (`git commit -m 'feat: add amazing feature'`).
4. **Push** to the branch (`git push origin feature/amazing-feature`).
5. Open a **Pull Request** with a clear description.

### Commit Convention

This project follows [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add new agent action
fix: resolve race condition in websocket fan-out
docs: update architecture diagrams
test: add e2e coverage for risk scoring
refactor: extract feature builder into service
```

### Code Quality

- Backend: `ruff check .`, `black .`, `mypy src/`
- Frontend: `npm run lint`, `npm run typecheck`

---

## License

Released under the **MIT License**. See [`LICENSE`](LICENSE) for details.

```
MIT License - Copyright (c) 2026 IntelliLog AI Contributors
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction...
```

---

## Acknowledgements

Built with the help of these outstanding open-source projects:

- [FastAPI](https://fastapi.tiangolo.com/) · [React](https://react.dev/) · [PostgreSQL](https://www.postgresql.org/)
- [TimescaleDB](https://www.timescale.com/) · [Redis](https://redis.io/) · [XGBoost](https://xgboost.ai/)
- [SHAP](https://shap.readthedocs.io/) · [LangGraph](https://langchain-ai.github.io/langgraph/)
- [Google OR-Tools](https://developers.google.com/optimization)
- [Prometheus](https://prometheus.io/) · [Grafana](https://grafana.com/) · [Nginx](https://nginx.org/)

---

<div align="center">

### Built for teams that ship logistics at scale.

⭐ **Star this repo** if IntelliLog AI helps your team move from reactive to predictive.

<br/>

**IntelliLog AI** · AI-Powered Logistics Intelligence Platform

</div>
