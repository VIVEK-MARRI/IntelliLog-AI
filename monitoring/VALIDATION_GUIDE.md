# Observability Validation & Testing Guide

This document provides comprehensive validation steps to ensure the observability stack is operational.

## Pre-Deployment Validation

### 1. Verify File Structure

Ensure all observability modules are in place:

```
backend/
  app/
    observability/
      __init__.py
      logging.py          ✓ Structured logging
      metrics.py          ✓ Prometheus metrics (50+ metrics)
      middleware.py       ✓ Request tracking middleware
      health.py           ✓ Health check endpoints

monitoring/
  prometheus/
    prometheus.yml        ✓ Scrape configs, 15s interval, 30d retention
    alert_rules.yml       ✓ 20+ alert rules (error rate, latency, down, etc)
    recording_rules.yml   ✓ Pre-computed metrics for faster queries
  
  grafana/
    provisioning/
      datasources/
        prometheus.yml    ✓ Auto-provision Prometheus datasource
      dashboards/
        dashboards.yml    ✓ Auto-provision 4 dashboards
    dashboards/
      system-health.json           ✓ API metrics, errors, latency
      agent-monitoring.json        ✓ Decisions, latency, reroutes
      prediction-monitoring.json   ✓ Volume, latency, risk scores
      logistics-operations.json    ✓ Shipments, fleet health, savings
  
  docker-compose.monitoring.yml    ✓ Full stack with 8 services
  INTEGRATION_GUIDE.md              ✓ How to enable in FastAPI app
```

### 2. Syntax Validation

#### Python Files
```bash
# Check Python syntax for all modules
python -m py_compile backend/app/observability/logging.py
python -m py_compile backend/app/observability/metrics.py
python -m py_compile backend/app/observability/middleware.py
python -m py_compile backend/app/observability/health.py
python -m py_compile backend/app/observability/__init__.py

# Expected: No errors
```

#### YAML Files
```bash
# Check Prometheus configuration
python -c "import yaml; yaml.safe_load(open('monitoring/prometheus/prometheus.yml'))"

# Check alert rules
python -c "import yaml; yaml.safe_load(open('monitoring/prometheus/alert_rules.yml'))"

# Check recording rules
python -c "import yaml; yaml.safe_load(open('monitoring/prometheus/recording_rules.yml'))"

# Expected: No errors
```

#### JSON Files
```bash
# Check Grafana dashboards
python -m json.tool monitoring/grafana/dashboards/system-health.json > /dev/null
python -m json.tool monitoring/grafana/dashboards/agent-monitoring.json > /dev/null
python -m json.tool monitoring/grafana/dashboards/prediction-monitoring.json > /dev/null
python -m json.tool monitoring/grafana/dashboards/logistics-operations.json > /dev/null

# Expected: No errors
```

## Integration Testing (Local)

### Step 1: Start Monitoring Stack

```bash
cd monitoring
docker-compose -f docker-compose.monitoring.yml up -d

# Verify services are running
docker-compose -f docker-compose.monitoring.yml ps

# Expected output:
# STATUS    | READY
# postgres  | healthy
# redis     | healthy
# prometheus | Up
# grafana   | Up
# backend   | Up
```

### Step 2: Verify Component Health

#### Check PostgreSQL
```bash
docker exec intelliglog-postgres pg_isready -U intelliglog
# Expected: "accepting connections"
```

#### Check Redis
```bash
docker exec intelliglog-redis redis-cli ping
# Expected: "PONG"
```

#### Check Prometheus
```bash
curl http://localhost:9090/-/healthy
# Expected: "Prometheus is healthy"

curl http://localhost:9090/api/v1/targets
# Expected: JSON with scrape targets showing "Up" status
```

#### Check Grafana
```bash
curl -s -u admin:admin http://localhost:3000/api/health
# Expected: JSON with status

curl -s -u admin:admin http://localhost:3000/api/datasources
# Expected: Prometheus datasource listed
```

#### Check Backend
```bash
curl http://localhost:8000/health
# Expected: HTTP 200 with component statuses

curl http://localhost:8000/health/live
# Expected: {"status": "alive"}

curl http://localhost:8000/health/ready
# Expected: {"status": "ready"} or HTTP 503 if degraded
```

### Step 3: Verify Metrics Collection

#### Check Prometheus Scrape Targets
```bash
curl -s http://localhost:9090/api/v1/targets | python -m json.tool | grep -A 5 '"labels"'

# Expected targets:
# - backend:8000 (intelliglog_backend)
# - prometheus:9090 (prometheus)
# - redis:9121 (redis)
# - postgres:9187 (postgres)
# - node-exporter:9100 (node)
# - grafana:3000 (grafana)
```

#### Check Metrics Endpoint
```bash
curl http://localhost:8000/metrics | head -20

# Expected: Prometheus format metrics
# HELP api_requests_total Total API requests
# TYPE api_requests_total counter
# api_requests_total{...} 0
```

#### Generate Test Metrics
```bash
# Generate some API requests to trigger metrics collection
for i in {1..10}; do
  curl http://localhost:8000/health
done

# Wait 30 seconds for scrape interval
sleep 30

# Query metrics in Prometheus
curl -s 'http://localhost:9090/api/v1/query?query=api_requests_total' | python -m json.tool

# Expected: Non-zero request counts
```

### Step 4: Verify Logging

#### Check Structured Logs
```bash
# Check Docker logs for JSON-formatted logs
docker logs intelliglog-backend | head -20

# Expected format:
# {"timestamp": "...", "level": "info", "service": "intelliglog-api", "message": "..."}
```

#### Verify Request ID Propagation
```bash
# Make a request with request ID header
curl -H "x-request-id: test-123" http://localhost:8000/health

# Check logs for request correlation
docker logs intelliglog-backend | grep "test-123"

# Expected: Request ID appears in all related logs
```

### Step 5: Verify Dashboards

#### Navigate to Grafana
Open browser: `http://localhost:3000`
- Login: admin / admin

#### Verify Datasource
1. Go to Configuration → Data Sources
2. Should see "Prometheus" listed and healthy
3. Click Test to verify connection

#### Verify Dashboards Auto-Provisioned
1. Go to Dashboards
2. Should see folder "IntelliLog-AI" with 4 dashboards:
   - ✓ System Health Dashboard
   - ✓ Agent Monitoring Dashboard
   - ✓ Prediction Monitoring Dashboard
   - ✓ Logistics Operations Dashboard

#### Generate Test Data for Dashboards
```bash
# Make various API calls to populate metrics
curl -s http://localhost:8000/health > /dev/null
curl -s http://localhost:8000/health/ready > /dev/null

# Wait for Prometheus scrape (15s interval)
sleep 30

# View dashboard - should show request metrics
```

### Step 6: Verify Alert Rules

#### Check Alert Rules Loaded
```bash
curl -s http://localhost:9090/api/v1/rules | python -m json.tool | grep '"name"'

# Expected: List of alert group names (intelliglog_alerts, intelliglog_infrastructure)
```

#### Check Alert Status
```bash
curl -s http://localhost:9090/api/v1/alerts | python -m json.tool

# Expected: Should show status of all alerts (firing, pending, inactive)
```

## Load Testing

### Simulate Production Load

```python
#!/usr/bin/env python3
"""Generate realistic load for observability testing"""

import asyncio
import httpx
import random
import json
from datetime import datetime, timedelta

async def generate_load():
    async with httpx.AsyncClient(base_url="http://localhost:8000") as client:
        # Simulate various endpoint patterns
        endpoints = [
            "/health",
            "/health/ready",
            "/health/live",
            "/orders",
            "/orders/123",
            "/orders/456/route",
            "/predictions/123",
        ]
        
        for _ in range(100):
            endpoint = random.choice(endpoints)
            try:
                response = await client.get(
                    endpoint,
                    headers={"x-request-id": f"test-{datetime.now().timestamp()}"}
                )
                print(f"{endpoint}: {response.status_code}")
            except Exception as e:
                print(f"{endpoint}: ERROR - {e}")
            
            await asyncio.sleep(random.uniform(0.1, 0.5))

# Run with: python load_test.py
if __name__ == "__main__":
    asyncio.run(generate_load())
```

## Verification Checklist

### Core Components
- [ ] `logging.py` - Structured logging with structlog
- [ ] `metrics.py` - 50+ Prometheus metrics
- [ ] `middleware.py` - Request/response tracking
- [ ] `health.py` - Health endpoints (/health, /health/live, /health/ready)
- [ ] `__init__.py` - Module exports

### Prometheus Stack
- [ ] `prometheus.yml` - Scrapes backend:8000 and prometheus:9090, 15s interval
- [ ] `alert_rules.yml` - 20+ alert rules configured
- [ ] `recording_rules.yml` - Pre-computed metrics for queries
- [ ] `/metrics` endpoint responds with valid Prometheus format
- [ ] Prometheus scrape targets show "Up" status

### Grafana Stack
- [ ] Prometheus datasource auto-provisioned
- [ ] 4 dashboards auto-provisioned and visible
- [ ] Dashboard queries execute without errors
- [ ] Metrics visible on dashboards (after data generation)

### Docker Stack
- [ ] All 8 services start successfully
- [ ] Services connected via `intelliglog-monitoring` network
- [ ] Volumes created for data persistence
- [ ] Health checks pass for all services
- [ ] Logs accessible via `docker logs`

### Health Endpoints
- [ ] `GET /health` returns 200 with component statuses
- [ ] `GET /health/live` always returns 200 {"status": "alive"}
- [ ] `GET /health/ready` returns 200 or 503 based on readiness
- [ ] All endpoints include proper JSON responses

### Logging
- [ ] Logs output valid JSON format
- [ ] Request IDs propagate through logs
- [ ] Structured fields included (timestamp, level, service, etc)
- [ ] Log levels (debug, info, warning, error) work correctly

### Metrics
- [ ] APIMetrics: requests_total, request_duration, errors_total
- [ ] PredictionMetrics: predictions_total, high_risk, latency
- [ ] AgentMetrics: decisions, latency, failures
- [ ] BusinessMetrics: shipments, delays, fleet_health
- [ ] All metrics have proper labels (method, endpoint, status_code, etc)

## Troubleshooting

### Service Fails to Start
```bash
# Check logs
docker-compose -f docker-compose.monitoring.yml logs backend

# Common issues:
# - Port already in use (8000, 9090, 3000)
# - Database not ready (check postgres logs)
# - Redis not ready (check redis logs)

# Solution: Restart services
docker-compose -f docker-compose.monitoring.yml restart
```

### Metrics Not Appearing
```bash
# Verify scrape job is working
curl -s http://localhost:9090/api/v1/targets

# Check Prometheus scrape logs
docker logs intelliglog-prometheus | grep "ERROR"

# Verify backend /metrics endpoint
curl http://localhost:8000/metrics
```

### Dashboards Empty
```bash
# Verify data exists in Prometheus
curl 'http://localhost:9090/api/v1/query?query=api_requests_total'

# Check dashboard queries in UI
# Go to dashboard → Edit → Check each panel query

# Common issue: Metrics not yet scraped (wait 15+ seconds after first request)
```

### Alert Not Firing
```bash
# Check alert rules loaded
curl http://localhost:9090/api/v1/rules | grep alert_name

# Check if evaluation threshold is met
# Use Prometheus query to verify metric value

# Test alert manually
# Trigger condition that should fire alert, wait for evaluation interval
```

## Production Validation

### Before Deploying to Production

1. **Verify Retention Policy**
   ```bash
   # Confirm 30-day retention
   curl http://localhost:9090/api/v1/query?query=count(ALERTS)
   ```

2. **Verify Backup Strategy**
   ```bash
   # Ensure Prometheus and Grafana volumes have backups
   docker volume ls | grep intelliglog
   ```

3. **Load Test**
   - Run load test to verify metrics collection under realistic load
   - Check CPU/memory usage of monitoring stack

4. **Chaos Testing**
   - Stop backend, verify alerts fire
   - Stop database, verify health checks fail
   - Verify auto-recovery when services restart

5. **Documentation Review**
   - Verify INTEGRATION_GUIDE is complete and accurate
   - Document any custom metrics added
   - Create runbooks for common issues

## Continuous Validation

### Weekly Checks
- Review alert firing patterns
- Check Prometheus disk usage
- Verify all dashboards loading
- Test health endpoints

### Monthly Checks
- Review and update alert thresholds
- Validate backup restoration
- Update documentation
- Capacity planning

## Success Criteria

✓ All Python modules have zero syntax errors
✓ All YAML/JSON configs parse successfully
✓ Prometheus scrapes all targets successfully
✓ Grafana displays all 4 dashboards
✓ Health endpoints respond correctly
✓ Metrics flow from backend to Prometheus to Grafana
✓ Logs output valid JSON with request correlation
✓ Alerts evaluate and fire correctly
✓ Docker stack starts in correct order
✓ Services auto-recover from failures
✓ 30-day data retention configured
✓ Integration guide is accurate and complete
