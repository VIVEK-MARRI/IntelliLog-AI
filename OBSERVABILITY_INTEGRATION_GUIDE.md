# IntelliLog-AI Observability Integration Guide

## Overview

This guide explains how to integrate structured logging and Prometheus metrics throughout the IntelliLog-AI application for complete observability.

## Part 1: Structured Logging Integration

### 1.1 Application Startup (src/api/main.py)

Add logging configuration to your FastAPI app startup:

```python
from src.core.logging import configure_logging, get_logger

# In the lifespan context manager or app startup
@app.on_event("startup")
async def startup_event():
    # Configure logging
    environment = os.getenv("ENVIRONMENT", "development")
    log_level = os.getenv("LOG_LEVEL", "INFO")
    configure_logging(environment, log_level)
    
    logger = get_logger("app.startup")
    logger.info("starting_application", version="1.0.0")
```

### 1.2 Request Logging (Middleware)

The API already includes `TimingMiddleware` but should be enhanced:

```python
# In src/api/main.py - enhance TimingMiddleware to use structlog
from src.core.logging import get_logger
import structlog

class TimingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        logger = get_logger("http")
        
        start_time = time.time()
        response = await call_next(request)
        duration = time.time() - start_time
        
        # Log with structlog context
        logger.info(
            "request_completed",
            method=request.method,
            path=request.url.path,
            status_code=response.status_code,
            duration_seconds=duration,
            duration_ms=int(duration * 1000),
        )
        return response
```

### 1.3 Agent Logging (src/core/agent.py)

```python
from src.core.logging import logger_agent

# In agent execution
async def execute_agent(state: OrderAgentState) -> OrderAgentState:
    logger_agent.info(
        "agent_execution_start",
        order_id=state.order_id,
        tenant_id=state.tenant_id,
        current_risk_score=state.current_risk_score,
    )
    
    start = time.time()
    result = await graph.ainvoke(state)
    elapsed = time.time() - start
    
    logger_agent.info(
        "agent_execution_complete",
        order_id=state.order_id,
        decision=result.get("decision_type"),
        duration_seconds=elapsed,
    )
    
    return result
```

### 1.4 ML Model Logging (src/core/ml.py)

```python
from src.core.logging import logger_ml

# In prediction function
def predict_risk(features: np.ndarray) -> dict:
    logger_ml.debug(
        "prediction_start",
        feature_count=len(features),
        feature_shape=features.shape,
    )
    
    start = time.time()
    prediction = model.predict(features)
    elapsed = time.time() - start
    
    logger_ml.info(
        "prediction_complete",
        risk_score=float(prediction[0]),
        latency_ms=int(elapsed * 1000),
        model_version="1.0.0",
    )
    
    return {"risk_score": prediction[0], "latency_ms": int(elapsed * 1000)}
```

### 1.5 Database Logging (src/core/database.py)

```python
from src.core.logging import logger_database
import time

# Wrap database queries
async def execute_query(query, params=None):
    logger_database.debug(
        "query_start",
        query_type=query.__class__.__name__,
    )
    
    start = time.time()
    result = await session.execute(query)
    elapsed = time.time() - start
    
    logger_database.info(
        "query_complete",
        query_type=query.__class__.__name__,
        duration_ms=int(elapsed * 1000),
        rows_affected=result.rowcount if hasattr(result, 'rowcount') else 0,
    )
    
    return result
```

## Part 2: Prometheus Metrics Integration

### 2.1 API Metrics (src/api/main.py)

Integrate metrics collection into middleware:

```python
from src.core.metrics import (
    http_requests_total,
    http_request_duration_seconds,
    http_requests_in_progress,
)
import time

class MetricsMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        method = request.method
        path = request.url.path
        
        # Track in-progress requests
        http_requests_in_progress.labels(method=method).inc()
        
        start_time = time.time()
        try:
            response = await call_next(request)
            status_code = response.status_code
        except Exception as e:
            status_code = 500
            raise
        finally:
            # Record metrics
            duration = time.time() - start_time
            http_request_duration_seconds.labels(method=method, path=path).observe(duration)
            http_requests_total.labels(
                method=method,
                path=path,
                status_code=status_code,
            ).inc()
            http_requests_in_progress.labels(method=method).dec()
        
        return response
```

### 2.2 Agent Metrics (src/core/agent.py)

```python
from src.core.metrics import (
    agent_decisions_total,
    agent_graph_duration_seconds,
    agent_tool_invocations_total,
    active_high_risk_orders,
)

async def execute_agent(state: OrderAgentState) -> OrderAgentState:
    start = time.time()
    result = await graph.ainvoke(state)
    elapsed = time.time() - start
    
    # Record metrics
    agent_decisions_total.labels(
        decision_type=result["decision_type"],
        tenant_id=state.tenant_id,
    ).inc()
    
    agent_graph_duration_seconds.labels(
        tenant_id=state.tenant_id,
    ).observe(elapsed)
    
    # Update high-risk order gauge
    if result["decision_type"] == "alert":
        active_high_risk_orders.labels(tenant_id=state.tenant_id).inc()
    
    return result
```

### 2.3 ML Metrics (src/core/ml.py)

```python
from src.core.metrics import (
    prediction_risk_score,
    prediction_latency_seconds,
    model_predictions_total,
    model_cache_hits_total,
    model_cache_misses_total,
)

async def predict_risk(order_id: str, features: np.ndarray, tenant_id: str):
    # Check cache
    cached = await redis.get(f"prediction:{order_id}")
    if cached:
        model_cache_hits_total.inc()
        return json.loads(cached)
    
    # Run prediction
    model_cache_misses_total.inc()
    
    start = time.time()
    risk_score = model.predict(features)[0]
    elapsed = time.time() - start
    
    # Record metrics
    model_predictions_total.inc()
    prediction_latency_seconds.observe(elapsed)
    prediction_risk_score.labels(tenant_id=tenant_id).observe(risk_score)
    
    return {"risk_score": risk_score}
```

### 2.4 Route Optimization Metrics (src/core/optimization.py)

```python
from src.core.metrics import (
    route_optimization_duration_seconds,
    route_optimization_status_total,
    optimization_queue_depth,
)

async def optimize_route(order_ids: List[str]):
    # Update queue depth
    queue_depth = await get_queue_depth()
    optimization_queue_depth.set(queue_depth)
    
    # Run solver
    start = time.time()
    result = await solver.solve(order_ids)
    elapsed = time.time() - start
    
    # Record metrics
    route_optimization_duration_seconds.observe(elapsed)
    route_optimization_status_total.labels(
        status=result["status"],  # optimal, feasible, timeout, infeasible
    ).inc()
    
    return result
```

### 2.5 Expose Metrics Endpoint (src/api/main.py)

Add Prometheus metrics endpoint:

```python
from prometheus_client import generate_latest, REGISTRY
from fastapi.responses import Response

@app.get("/metrics")
async def metrics():
    """Prometheus metrics endpoint"""
    return Response(
        content=generate_latest(REGISTRY),
        media_type="text/plain; version=0.0.4",
    )
```

## Part 3: Structured Logging Usage Patterns

### Error Logging

```python
from src.core.logging import get_logger

logger = get_logger("component.name")

try:
    result = await risky_operation()
except Exception as e:
    logger.error(
        "operation_failed",
        error_type=type(e).__name__,
        error_message=str(e),
        exc_info=True,  # Includes stack trace
    )
```

### Performance Logging

```python
import time

start = time.time()
result = await operation()
elapsed = time.time() - start

logger.info(
    "operation_complete",
    duration_seconds=elapsed,
    duration_ms=int(elapsed * 1000),
    items_processed=len(result),
)
```

### Context Propagation

```python
# Set context that will be included in all logs
structlog.contextvars.clear_contextvars()
structlog.contextvars.bind_contextvars(
    request_id=request.headers.get("X-Request-ID"),
    tenant_id=request.state.tenant_id,
    user_id=request.state.user_id,
)

# All logs from this thread/async context will include these fields
logger.info("user_action", action="order_created")
# Output: {..., request_id: "...", tenant_id: "...", user_id: "..."}
```

## Part 4: Viewing Observability Data

### Prometheus

- **URL**: http://localhost:9090
- **Query Examples**:
  - `rate(http_requests_total[5m])` - Request rate
  - `histogram_quantile(0.95, http_request_duration_seconds)` - p95 latency
  - `active_high_risk_orders` - Current high-risk orders
  - `agent_graph_duration_seconds_bucket` - Agent execution distribution

### Grafana

- **URL**: http://localhost:3001
- **Default Credentials**: admin / admin
- **Dashboards**:
  - IntelliLog-AI Observability Dashboard (main)
  - Available under "Dashboards" > "IntelliLog Dashboards"

### Key Metrics Dashboard Breakdown

**Row 1: System Health**
- Active high-risk orders gauge
- API request rate over time
- API latency (p50/p95/p99)

**Row 2: Agent Intelligence**
- Agent decisions stacked bar chart
- Risk score distribution histogram
- Agent execution latency
- Reroute effectiveness %

**Row 3: ML Model**
- Prediction rate
- ML inference latency
- Average risk score (drift indicator)

**Row 4: Infrastructure**
- Redis memory usage
- PostgreSQL connection pool
- Celery queue depth
- Active Celery workers

## Part 5: Starting the Observability Stack

### Using Docker Compose

```bash
# Start all services
docker-compose -f docker-compose.dev.yml up -d

# View logs
docker-compose -f docker-compose.dev.yml logs -f api

# Stop all services
docker-compose -f docker-compose.dev.yml down

# Clean up volumes (careful!)
docker-compose -f docker-compose.dev.yml down -v
```

### Environment Variables

```bash
# API Configuration
ENVIRONMENT=development  # or "production"
LOG_FORMAT=console       # or "json" for production
LOG_LEVEL=DEBUG          # DEBUG, INFO, WARNING, ERROR, CRITICAL

# Database
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/intelliglog

# Redis
REDIS_URL=redis://localhost:6379

# Celery
CELERY_BROKER_URL=redis://localhost:6380/0
CELERY_RESULT_BACKEND=redis://localhost:6380/0
```

## Part 6: Alerting Setup

Prometheus is configured with alert rules in `monitoring/alert_rules.yml`:

- **HighRiskOrdersSpiking**: > 10 high-risk orders for 2 minutes
- **AgentDecisionLatencyHigh**: p95 latency > 2s for 5 minutes
- **ModelPredictionsDropped**: 0 predictions in 5 minutes for 3 minutes
- **HighAPIErrorRate**: Error rate > 5% for 5 minutes
- **DatabaseConnectionPoolExhausted**: > 90% pool utilization for 2 minutes
- **OptimizationQueueDeepHigh**: > 100 jobs in queue for 5 minutes

To view alerts in Grafana:
1. Go to http://localhost:3001
2. Click "Alerting" in sidebar
3. View "Alert Rules" or "Alert Instances"

## Part 7: Log Format Examples

### Development (Console)

```
agent_execution_start order_id=ord_123 tenant_id=tenant_456 current_risk_score=0.75 request_id=req_789
agent_execution_complete order_id=ord_123 decision=reroute duration_seconds=1.2 request_id=req_789
```

### Production (JSON)

```json
{
  "timestamp": "2024-01-15T10:30:45.123Z",
  "event": "agent_execution_start",
  "order_id": "ord_123",
  "tenant_id": "tenant_456",
  "current_risk_score": 0.75,
  "request_id": "req_789",
  "service": "intelliglog",
  "environment": "production"
}
```

## Part 8: Performance Recommendations

### Logging

- Use `logger.debug()` for verbose development info (disabled in production)
- Use `logger.info()` for business events (user actions, orders, decisions)
- Use `logger.warning()` for degraded service states
- Use `logger.error()` for failures (with exception details)

### Metrics

- Keep cardinality low (avoid high-cardinality labels like user_id)
- Use histograms with appropriate buckets for latencies
- Use gauges for measurements (connection counts, queue depths)
- Use counters for events (requests, decisions, predictions)

### Storage

- Prometheus retention: 30 days (see docker-compose.dev.yml)
- Adjust for production: `--storage.tsdb.retention.time=90d`
- Grafana: stores dashboards only (stateless)

## Part 9: Troubleshooting

### No metrics appearing in Prometheus

1. Verify FastAPI `/metrics` endpoint: `curl http://localhost:8000/metrics`
2. Check Prometheus scrape config: http://localhost:9090/config
3. View targets: http://localhost:9090/targets

### No data in Grafana dashboard

1. Verify Prometheus datasource: Settings > Data Sources > Prometheus
2. Test connection: Click "Test" button
3. Check dashboard queries: Click panel > Edit > Inspect

### High cardinality alert

If you see "Cardinality exceeded":
1. Review metric labels
2. Avoid using high-cardinality fields (user_id, order_id)
3. Use aggregation (sum, count) in queries

## Part 10: Next Steps

1. **Integrate logging** into src/core/agent.py, src/core/ml.py
2. **Add metrics collection** to all async operations
3. **Create custom dashboards** for specific use cases
4. **Set up alerting** with email/Slack integration
5. **Configure log aggregation** (ELK, Loki) for long-term storage
