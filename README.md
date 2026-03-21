# IntelliLog-AI

IntelliLog-AI is an enterprise logistics intelligence platform that unifies dispatch operations, ETA prediction, route optimization, and fleet observability into one production-oriented system.

<p align="center">
    <a href="http://localhost:5173"><img src="https://img.shields.io/badge/Open-Frontend-0ea5a4?style=for-the-badge&logo=react&logoColor=white" alt="Open Frontend" /></a>
    <a href="http://localhost:8000/docs"><img src="https://img.shields.io/badge/Open-API%20Docs-0f766e?style=for-the-badge&logo=fastapi&logoColor=white" alt="Open API Docs" /></a>
    <a href="./docs/architecture.md"><img src="https://img.shields.io/badge/View-Architecture-115e59?style=for-the-badge&logo=readthedocs&logoColor=white" alt="View Architecture" /></a>
    <a href="./docs/PRODUCTION_OPERATIONS_GUIDE.md"><img src="https://img.shields.io/badge/Read-Operations%20Guide-134e4a?style=for-the-badge&logo=bookstack&logoColor=white" alt="Read Operations Guide" /></a>
</p>

<p align="center">
    <img src="https://img.shields.io/badge/Python-3.10%2B-1f2937?style=flat-square&logo=python" alt="Python" />
    <img src="https://img.shields.io/badge/FastAPI-Backend-1f2937?style=flat-square&logo=fastapi" alt="FastAPI" />
    <img src="https://img.shields.io/badge/React-Frontend-1f2937?style=flat-square&logo=react" alt="React" />
    <img src="https://img.shields.io/badge/PostgreSQL-Primary%20Store-1f2937?style=flat-square&logo=postgresql" alt="PostgreSQL" />
    <img src="https://img.shields.io/badge/Redis-Cache%20%26%20Broker-1f2937?style=flat-square&logo=redis" alt="Redis" />
    <img src="https://img.shields.io/badge/Celery-Async%20Workers-1f2937?style=flat-square&logo=celery" alt="Celery" />
</p>

<p align="center">
    <a href="#platform-overview"><img src="https://img.shields.io/badge/Platform%20Overview-0f172a?style=for-the-badge" alt="Platform Overview" /></a>
    <a href="#system-architecture"><img src="https://img.shields.io/badge/System%20Architecture-1e293b?style=for-the-badge" alt="System Architecture" /></a>
    <a href="#local-setup-and-runbook"><img src="https://img.shields.io/badge/Quick%20Start-334155?style=for-the-badge" alt="Quick Start" /></a>
    <a href="#api-surface"><img src="https://img.shields.io/badge/API%20Surface-475569?style=for-the-badge" alt="API Surface" /></a>
    <a href="#quality-gates-and-verification"><img src="https://img.shields.io/badge/Quality%20Gates-64748b?style=for-the-badge" alt="Quality Gates" /></a>
    <a href="#roadmap-and-remaining-work"><img src="https://img.shields.io/badge/Roadmap-0f766e?style=for-the-badge" alt="Roadmap" /></a>
</p>

## Table of Contents

1. Platform Overview
2. Business and Technical Objectives
3. Core Capabilities
4. System Architecture
5. Service Responsibilities
6. Data and Event Flows
7. Technology Stack
8. Repository Structure
9. Local Setup and Runbook
10. Configuration Model
11. API Surface
12. Quality Gates and Verification
13. Security, Multi-Tenancy, and Governance
14. Deployment and Operations
15. Role-Based Onboarding Tracks
16. Go-Live Readiness Checklist
17. Roadmap and Remaining Work
18. Documentation Index
19. License

## Platform Overview

The platform is designed for operations teams that need reliable ETA predictions, optimized route plans, and live fleet awareness while preserving software quality and model governance.

IntelliLog-AI provides:

- A modern operator-facing frontend for dispatch, analytics, and map workflows
- A FastAPI backend for domain APIs, orchestration, and health telemetry
- Optimization engines for route planning under practical constraints
- ML services for ETA estimation and explanation
- Async infrastructure for background processing and continuous learning workflows

## Business and Technical Objectives

### Business Objectives

- Improve on-time delivery performance
- Reduce route inefficiency and operational cost
- Increase dispatcher productivity with real-time visibility
- Build a multi-tenant SaaS foundation for scale

### Technical Objectives

- Keep request/response APIs fast and predictable
- Isolate heavy work via asynchronous processing
- Preserve tenant isolation and traceability
- Support model evolution with measurable governance

## Core Capabilities

- ETA prediction using XGBoost-based inference pipelines
- Route optimization via Google OR-Tools VRP solvers
- WebSocket-powered fleet state updates and operational events
- Explanation endpoints for ETA factor visibility
- Tenant-aware API and data model patterns
- Celery + Redis background processing architecture
- Learning system hooks for drift detection and retraining
- Health monitoring and request-level trace IDs

## System Architecture

### High-Level Architecture

```mermaid
graph TD
    Ops[Operations User] --> FE[Frontend\nReact + TypeScript + Vite]

    FE -->|REST| API[Backend API\nFastAPI /api/v1]
    FE -->|WebSocket| WS[Dispatch WS Channel]

    API --> DB[(PostgreSQL)]
    API --> Redis[(Redis)]
    API --> Opt[Optimization Service\nOR-Tools]
    API --> Pred[Prediction Service\nXGBoost]

    API --> Queue[Celery Broker Queue]
    Queue --> Worker[Celery Worker]
    Worker --> DB
    Worker --> Redis
    Worker --> Pred

    API --> Health[Health + Status + Metrics]
```

### Container and Service Topology

```mermaid
flowchart LR
    subgraph Browser[User Browser]
        UI[Operations Console]
    end

    subgraph DevStack[Docker Compose Dev Stack]
        FE[frontend:5173]
        API[backend:8000]
        CW[celery_worker]
        DB[(postgres:5432)]
        REDIS[(redis:6379)]
    end

    UI --> FE
    FE --> API
    FE -->|WebSocket| API
    API --> DB
    API --> REDIS
    API --> CW
    CW --> DB
    CW --> REDIS
```

### Critical Runtime Sequence

```mermaid
sequenceDiagram
    participant User as Dispatcher
    participant FE as Frontend
    participant API as FastAPI
    participant OPT as Optimization Service
    participant DB as PostgreSQL
    participant WS as WebSocket Channel

    User->>FE: Trigger route optimization
    FE->>API: POST /api/v1/routes/optimize
    API->>OPT: Solve VRP with constraints
    OPT-->>API: Optimized route plan
    API->>DB: Persist route assignments
    API-->>FE: Return route response
    API-->>WS: Publish route and status update
    WS-->>FE: Push live update
    FE-->>User: Render optimized routes on map
```

### Architecture Layers

```mermaid
graph BT
    L4[Data Layer\nPostgreSQL and Redis]
    L3[Domain Services Layer\nPrediction, Optimization, Learning]
    L2[Application Layer\nFastAPI Routers and Orchestration]
    L1[Experience Layer\nReact Operations Console]

    L1 --> L2
    L2 --> L3
    L3 --> L4
```

### Architecture Legend

| Diagram Symbol | Meaning | Notes |
|---|---|---|
| Rounded rectangle node | Service or logical component | Examples: frontend, backend API, worker |
| Cylinder node | Data store | PostgreSQL and Redis |
| Solid arrow | Primary runtime dependency | Synchronous or orchestration call path |
| Labeled arrow | Protocol or intent | REST, WebSocket, queue, publish |
| Sequence diagram lifeline | Runtime actor | User, UI, API, service, storage |
| Subgraph container | Deployment or domain boundary | Browser, Docker stack, architecture layer |

### Architecture Principles

- API plane and worker plane are separated for reliability
- Stateful data stays in PostgreSQL; transient/high-throughput state uses Redis
- User workflows remain responsive by delegating long-running tasks to workers
- Health and traceability are first-class concerns for runtime operations

### Architecture Decision Highlights

| Decision Area | Current Choice | Rationale | Trade-off |
|---|---|---|---|
| API Framework | FastAPI | High developer velocity, type-driven contracts, strong async support | Requires discipline to keep service boundaries clean |
| Async Workloads | Celery + Redis | Reliable offloading of long-running tasks and future scaling | Operational overhead for worker monitoring |
| Primary Store | PostgreSQL | Strong consistency and mature relational modeling | Requires indexing and query tuning at scale |
| Cache and Broker | Redis | Low-latency caching and queue broker reuse | Memory policy tuning needed for sustained load |
| Route Optimization | OR-Tools | Strong VRP constraint handling and proven solver quality | Solver complexity can raise compute cost |
| ETA Modeling | XGBoost | Strong tabular performance and interpretability compatibility | Requires robust feature governance and drift controls |
| Real-time Updates | WebSocket dispatch channel | Immediate fleet state visibility for operators | Requires reconnect handling and idempotent event processing |
| Observability Pattern | Health endpoints + request IDs | Fast diagnosis and traceability across API calls | Needs full metric/alert maturity for production SLAs |

## Service Responsibilities

### Frontend

- Dashboard and fleet control user experiences
- Route and order visualization over map interfaces
- Real-time rendering of operational status and websocket events

### Backend API

- Request validation and domain orchestration
- Tenant-aware order, driver, route, and analytics endpoints
- Prediction and explanation endpoint exposure
- Health and status contracts consumed by UI and tests

### Celery Worker

- Background processing for computationally expensive or asynchronous jobs
- Supports scalable execution for learning and optimization-adjacent workflows

### Data Stores

- PostgreSQL: source of truth for transactional logistics entities
- Redis: broker, caching, and feature-store style fast retrieval

## Data and Event Flows

### Order to ETA Flow

1. Orders are submitted or synchronized into backend services
2. Domain validation and persistence are applied
3. ETA prediction service computes outcomes
4. Explanation data is prepared for UI consumption
5. UI displays ETA, confidence, and rationale

### Optimization Flow

1. Candidate orders and active drivers are collected
2. OR-Tools VRP solver computes route plans
3. Routes are persisted and published through API responses
4. Fleet views reflect planned and active execution states

### Live Dispatch Flow

1. Position updates arrive through driver tracking interfaces
2. Backend processes and publishes updates via WebSocket
3. Fleet UI updates markers, metrics, and operational alerts

## Technology Stack

### Frontend

- React 19, TypeScript, Vite
- Leaflet and React-Leaflet for map rendering
- Recharts for KPI and trend visualization
- Framer Motion and GSAP for interaction polish

### Backend and ML

- Python 3.10+
- FastAPI, Pydantic, SQLAlchemy, Alembic
- Celery for asynchronous task execution
- XGBoost and scikit-learn for ETA modeling
- Google OR-Tools for constrained routing

### Infrastructure

- PostgreSQL 15
- Redis 7
- Docker and Docker Compose
- MLflow for model and experiment tracking

## Repository Structure

```text
.
|-- src/
|   |-- backend/
|   |   |-- app/
|   |   |   |-- api/
|   |   |   |-- core/
|   |   |   |-- db/
|   |   |   |-- services/
|   |-- frontend/
|   |   |-- src/
|   |       |-- pages/
|   |       |-- components/
|-- alembic/
|-- scripts/
|-- docs/
|-- models/
|-- tests/
|-- docker-compose.dev.yml
|-- docker-compose.yml
```

## Local Setup and Runbook

### Prerequisites

- Python 3.10 or newer
- Node.js 18 or newer
- Docker Desktop for containerized development

### Option A: Full Development Stack (Recommended)

> [!TIP]
> Best default for new contributors and demos: this mode starts frontend, backend, worker, database, and Redis together with aligned local ports.

```bash
docker compose -f docker-compose.dev.yml up --build
```

Default local endpoints:

- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs
- PostgreSQL: localhost:5433
- Redis: localhost:6379

### Option B: Hybrid Local Run

> [!NOTE]
> Use hybrid mode when iterating quickly on frontend/backend code without rebuilding containers on every change.

Bootstrap scripts:

```bash
./scripts/dev_bootstrap.ps1
./scripts/dev_bootstrap.sh
```

Run backend:

```bash
uvicorn src.backend.app.main:app --reload --host 0.0.0.0 --port 8000
```

Run frontend:

```bash
cd src/frontend
npm install
npm run dev
```

## Configuration Model

> [!IMPORTANT]
> Keep secrets out of source control. Use environment variables or a dedicated secret manager for production deployments.

Primary runtime configuration is environment-driven.

Key variables:

- DATABASE_URL
- REDIS_URL
- REDIS_FEATURE_STORE_URL
- CELERY_BROKER_URL
- MODEL_PATH
- OSRM_BASE_URL
- AUTO_RETRAIN_ENABLED
- DRIFT_DETECTION_ENABLED
- MLFLOW_TRACKING_URI

Example local database URL:

```text
postgresql://postgres:postgres@localhost:5433/intellog_ai_dev
```

## API Surface

Representative endpoints:

- /api/v1/health
- /api/v1/orders
- /api/v1/routes
- /api/v1/drivers
- /api/v1/driver/position
- /api/v1/predictions/explain
- /api/v1/ml/predict/eta
- /api/v1/status/system
- /api/v1/learning/*
- /api/v1/analytics/*

Interactive contracts:

- Swagger UI at /docs
- OpenAPI schema at /openapi.json

## Quality Gates and Verification

> [!TIP]
> Treat these commands as release gates. A production-ready branch should pass all three before deployment.

### Frontend build gate

```bash
cd src/frontend
npm run build
```

### Database migration gate

```bash
alembic upgrade head
```

### End-to-end wiring gate

```bash
npx playwright test tests/e2e/wiring.spec.ts --config playwright.config.ts
```

Wiring suite coverage includes:

- Health and readiness status rendering
- Tenant-aware orders API behavior
- Dashboard and fleet visual integrity
- Explanation flow and factor rendering
- WebSocket live state and reconnect behavior
- Error handling and non-crash UX guarantees

## Security, Multi-Tenancy, and Governance

- Tenant-aware data access patterns across API boundaries
- Auth and role routes present in v1 API structure
- Request-level traceability through X-Request-ID middleware
- Typed validation and serialization via Pydantic models
- Drift/retraining and model tracking hooks for lifecycle governance

## Deployment and Operations

> [!WARNING]
> The default compose settings are development-friendly, not production-hardened. Enforce security controls before internet exposure.

Two compose profiles are available:

- docker-compose.dev.yml for active development workflows
- docker-compose.yml for alternate containerized stack topology

Recommended production hardening baseline:

- strict CORS and trusted host policy
- secret and key rotation strategy
- TLS termination and secure ingress
- metrics dashboards with SLO alerts
- backup, restore, and disaster recovery validation

## Role-Based Onboarding Tracks

### Software Engineer Track

1. Start with docs/START_HERE.md and docs/DEVELOPER_GUIDE.md
2. Bring up the stack using docker-compose.dev.yml
3. Validate frontend build, migrations, and wiring tests
4. Review service boundaries in backend API and frontend pages
5. Deliver first change with tests and verification notes

### ML Engineer Track

1. Review docs/ML_SYSTEM.md and docs/LEARNING_SYSTEM.md
2. Inspect model artifacts and training scripts in scripts/
3. Validate prediction and explanation endpoints end-to-end
4. Confirm drift/retraining configuration and MLflow tracking
5. Document model-change impact and rollback plan

### DevOps and SRE Track

1. Review docs/PRODUCTION_OPERATIONS_GUIDE.md and docs/SECURITY_BEST_PRACTICES.md
2. Verify environment variables and secret handling strategy
3. Validate service health, logs, and failure recovery workflows
4. Define SLI/SLO thresholds and alert routes
5. Execute backup and restore rehearsal before production sign-off

## Go-Live Readiness Checklist

| Area | Required Check | Status Template |
|---|---|---|
| Application Health | /api/v1/health reports healthy for API, DB, Redis, worker, model | Pass or Fail |
| Build Integrity | Frontend production build completes without errors | Pass or Fail |
| Schema State | Alembic migrations applied and consistent across environments | Pass or Fail |
| E2E Behavior | Wiring suite passes for health, API, websocket, and error handling | Pass or Fail |
| Security | Secret management, CORS, and host policies reviewed | Pass or Fail |
| Observability | Metrics, logs, and alerting paths validated | Pass or Fail |
| Recovery | Backup and restore procedure tested with evidence | Pass or Fail |
| Release Control | Rollback strategy documented and rehearsal completed | Pass or Fail |

> [!IMPORTANT]
> Promote to production only after all checklist rows are marked Pass with reviewer sign-off.

## Roadmap and Remaining Work

Priority next steps:

1. Production authentication and RBAC hardening review
2. Full observability implementation: dashboards, alerts, and SLI/SLOs
3. CI/CD release gates for backend, frontend, and E2E workflows
4. Model promotion governance with rollback automation
5. Worker scaling and queue backpressure tuning
6. DR runbooks and periodic recovery drills

## Documentation Index

- docs/START_HERE.md
- docs/DEVELOPER_GUIDE.md
- docs/architecture.md
- docs/ML_SYSTEM.md
- docs/LEARNING_SYSTEM.md
- docs/MLOPS_DEPLOYMENT.md
- docs/PRODUCTION_OPERATIONS_GUIDE.md
- docs/SECURITY_BEST_PRACTICES.md

## License

MIT License. See LICENSE.
