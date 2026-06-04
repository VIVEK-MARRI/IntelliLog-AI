# Observability Integration Guide

This guide explains how to integrate the observability layer into your IntelliLog-AI FastAPI application.

## Components Overview

The observability stack consists of:

1. **Structured Logging** (`app/observability/logging.py`) - JSON logs with request correlation
2. **Prometheus Metrics** (`app/observability/metrics.py`) - 50+ metrics across 8 categories
3. **FastAPI Middleware** (`app/observability/middleware.py`) - Automatic request tracking
4. **Health Checks** (`app/observability/health.py`) - Kubernetes-ready endpoints

## Integration Steps

### Step 1: Configure Logging

In your FastAPI application startup:

```python
from app.observability import configure_logging, get_logger

# In your main.py or app initialization
@app.on_event("startup")
async def startup():
    configure_logging(
        service_name="intelliglog-api",
        environment="production",  # or "development"
        log_level="info"  # or "debug"
    )
    logger = get_logger(__name__)
    logger.info("IntelliLog-AI API starting", version="1.0.0")
```

### Step 2: Add Observability Middleware

Register the middleware in your FastAPI application:

```python
from fastapi import FastAPI
from app.observability import ObservabilityMiddleware

app = FastAPI()

# Add middleware early in the chain
app.add_middleware(ObservabilityMiddleware)
```

The middleware will automatically:
- Track all HTTP requests and responses
- Record metrics (request count, latency, errors)
- Normalize endpoint paths to prevent cardinality explosion
- Log request/response with correlation IDs

### Step 3: Expose Prometheus Metrics

Add the metrics endpoint to your FastAPI app:

```python
from prometheus_client import make_asgi_app
from fastapi.middleware.wsgi import WSGIMiddleware
from app.observability import REGISTRY

# Create metrics app with custom registry
metrics_app = make_asgi_app(registry=REGISTRY)

# Mount at /metrics path
app.mount("/metrics", metrics_app)
```

Now metrics are available at `http://localhost:8000/metrics` in Prometheus format.

### Step 4: Add Health Checks

Register the health check router:

```python
from app.observability import health_router, HealthChecker, set_health_checker

# Create health checker
health_checker = HealthChecker(
    db_session_factory=get_db_session,  # Your session factory
    redis_client=redis_client,           # Your Redis client
    model_loader=model_loader            # Your ML model loader
)

# Set it globally
set_health_checker(health_checker)

# Include the router
app.include_router(health_router)
```

Now you have three endpoints:
- `GET /health` - Full health check (returns 503 if unhealthy)
- `GET /health/live` - Liveness check (always returns 200)
- `GET /health/ready` - Readiness check (returns 503 if not ready)

## Using Logging in Your Code

### Basic Logging

```python
from app.observability import get_logger

logger = get_logger(__name__)

@app.get("/orders/{order_id}")
async def get_order(order_id: str):
    logger.info("fetching_order", order_id=order_id)
    # ... your code
    logger.info("order_fetched", order_id=order_id, status="success")
```

### Scoped Logging with Context

```python
from app.observability import get_logger, LogContext

logger = get_logger(__name__)

@app.post("/predictions")
async def generate_prediction(request_id: str, order_id: str):
    with LogContext(request_id=request_id, order_id=order_id):
        logger.info("prediction_requested")
        # All logs within this context will include request_id and order_id
        result = await model.predict(order_id)
        logger.info("prediction_generated", risk_score=result.risk)
    return result
```

### Specialized Logging Functions

```python
from app.observability import (
    log_api_request, log_api_response,
    log_prediction_generated, log_agent_decision,
    log_redis_event, log_websocket_event
)

# Log API calls
log_api_request("/orders", "GET", request_id="xyz", logger=logger)

# Log predictions
log_prediction_generated(
    order_id="ord123",
    risk_score=75.5,
    confidence=0.95,
    latency_ms=245,
    logger=logger
)

# Log agent decisions
log_agent_decision(
    order_id="ord123",
    decision_type="reroute",
    reasoning="Traffic congestion detected",
    risk_score=65.0,
    latency_ms=150,
    logger=logger
)
```

## Recording Metrics in Your Code

### API Metrics

```python
from app.observability import APIMetrics

@app.get("/orders")
async def list_orders():
    APIMetrics.requests_total.labels(
        method="GET",
        endpoint="/orders",
        status_code=200
    ).inc()
    # ... your code
```

### Prediction Metrics

```python
from app.observability import record_prediction

async def predict_order_risk(order_id: str):
    start = time.time()
    prediction = await model.predict(order_id)
    latency_ms = (time.time() - start) * 1000
    
    record_prediction(
        model_version="v1.2",
        status="success",
        latency_ms=latency_ms,
        risk_score=prediction.risk,
        confidence=prediction.confidence
    )
    return prediction
```

### Agent Decision Metrics

```python
from app.observability import record_agent_decision

async def make_agent_decision(order_id: str):
    start = time.time()
    decision = await agent.decide(order_id)
    latency_ms = (time.time() - start) * 1000
    
    record_agent_decision(
        decision_type=decision.type,  # "no_action", "alert", "reroute"
        latency_ms=latency_ms,
        impact_minutes=decision.estimated_savings
    )
    return decision
```

### Redis Metrics

```python
from app.observability import record_redis_publish

async def publish_update(channel: str, message: dict):
    record_redis_publish(
        channel=channel,
        message_count=1
    )
    await redis_client.publish(channel, json.dumps(message))
```

## Monitoring Stack Deployment

### Start the Monitoring Stack

```bash
# Navigate to monitoring directory
cd monitoring

# Start all services (Prometheus, Grafana, backends)
docker-compose -f docker-compose.monitoring.yml up -d

# View logs
docker-compose -f docker-compose.monitoring.yml logs -f

# Stop all services
docker-compose -f docker-compose.monitoring.yml down
```

### Access Dashboards

1. **Prometheus** - `http://localhost:9090`
   - Query metrics directly
   - View scrape targets and job status
   - Check alert status

2. **Grafana** - `http://localhost:3000`
   - Login: admin / admin
   - Pre-configured dashboards:
     - System Health Dashboard (API performance, errors, latency)
     - Agent Monitoring Dashboard (decisions, latency, reroutes)
     - Prediction Monitoring Dashboard (volume, latency, risk)
     - Logistics Operations Dashboard (shipments, fleet health)

3. **Backend Metrics** - `http://localhost:8000/metrics`
   - Raw Prometheus metrics format
   - Used by Prometheus scraper

4. **Health Endpoints**
   - Full health: `http://localhost:8000/health`
   - Liveness: `http://localhost:8000/health/live`
   - Readiness: `http://localhost:8000/health/ready`

## Key Metrics to Monitor

### API Performance
- `api_request_duration_seconds` - Request latency (p50, p95, p99)
- `api_errors_total` - Error rate by endpoint
- `api_requests_total` - Request volume

### Prediction Service
- `predictions_total` - Prediction volume
- `prediction_latency_seconds` - Model inference time
- `high_risk_predictions_total` - Volume of high-risk predictions

### Agent Decisions
- `agent_decisions_total` - Decision volume by type
- `agent_decision_latency_seconds` - Decision-making time
- `agent_failures_total` - Failed decisions

### Infrastructure
- `database_query_latency_seconds` - Database performance
- `redis_failures_total` - Redis issues
- `websocket_failures_total` - WebSocket connection issues

## Alerting

Alerts are pre-configured in `prometheus/alert_rules.yml`:

- **High Error Rate** - Triggers when error rate > 5% for 2 minutes
- **High Latency** - Triggers when p99 latency > 1s for 5 minutes
- **Service Down** - Triggers when any service is unreachable
- **Database Issues** - Triggers on connection pool exhaustion or high query latency
- **Business Alerts** - Triggers on high delay rate, low fleet health score

View alerts in Prometheus: `http://localhost:9090/alerts`

## Best Practices

1. **Always use request IDs** - Propagate via `x-request-id` header for correlation
2. **Log at appropriate levels** - Use info for important events, debug for troubleshooting
3. **Avoid cardinality explosion** - Middleware normalizes paths (/orders/123 → /orders/{id})
4. **Measure latency** - Record timing for all important operations
5. **Monitor your monitors** - Prometheus self-monitoring is included

## Troubleshooting

### Metrics not showing up?
1. Verify middleware is added to FastAPI app
2. Check `/metrics` endpoint returns Prometheus format
3. Verify Prometheus scrape job points to correct URL and port

### Grafana dashboards empty?
1. Ensure Prometheus datasource is configured
2. Check dashboard queries match your metric names
3. Verify backend is sending metrics to `/metrics` endpoint

### Alerts not firing?
1. Check alert rules in `prometheus/alert_rules.yml`
2. Verify evaluation threshold is being met
3. Check Prometheus logs for rule evaluation errors

## Next Steps

1. Deploy to production with real data
2. Fine-tune alert thresholds based on your SLOs
3. Create custom dashboards for your specific use cases
4. Set up alerting integrations (Slack, PagerDuty, etc.)
5. Monitor observability cost and optimize data retention
