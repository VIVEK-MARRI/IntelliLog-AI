# IntelliLog-AI Observability Quick Start Guide

## 🚀 Get Observability Running in 5 Minutes

### Prerequisites
- Docker and Docker Compose installed
- Workspace at: `c:\vivek\Intelligent logistics_ai`

### Step 1: Start Everything (One Command)

```bash
cd c:\vivek\Intelligent logistics_ai
docker-compose -f docker-compose.dev.yml up -d
```

This starts:
- PostgreSQL (database)
- Redis (cache & pub/sub)
- Prometheus (metrics collection)
- Grafana (visualization)
- FastAPI (application)
- Celery workers (async tasks)
- Agent worker (LangGraph)

**Wait 30 seconds for services to start...**

### Step 2: Verify Everything is Running

```bash
# Check all services are healthy
docker-compose -f docker-compose.dev.yml ps

# Expected: All services showing "Up" status
```

### Step 3: Open Dashboards

**Option A: Grafana (Recommended - Best UI)**
```
http://localhost:3001
Username: admin
Password: admin
```
- Click "Dashboards" → "IntelliLog Dashboards"
- Select "IntelliLog-AI Observability Dashboard"
- **See live metrics!**

**Option B: Prometheus (Raw Metrics)**
```
http://localhost:9090
```
- Go to "Graph"
- Type query: `active_high_risk_orders`
- Click "Execute"
- **See raw metric data!**

**Option C: API Health**
```bash
curl http://localhost:8000/health
```

### Step 4: View Metrics Endpoint

```bash
curl http://localhost:8000/metrics
```

Shows all Prometheus metrics in text format.

---

## 📊 Understanding the Grafana Dashboard

### Row 1: System Health (Top Left)
- **Active High-Risk Orders Gauge**: Green/red needle showing current risky orders
- **API Request Rate**: How many requests/sec your API is handling
- **API Latency**: How fast (p50/p95/p99) your API responds

**Reading**: If API rate is 100/sec with p99 latency of 500ms = good performance

### Row 2: Agent Intelligence (Middle Left)
- **Stacked Decisions**: Which decisions the agent makes (no_action, alert, reroute)
- **Risk Score Distribution**: Shape of risk scores across orders
- **Agent Latency**: How long agent takes to decide

**Reading**: If agent avg is 1.2s and max is 2s = excellent decision speed

### Row 3: ML Model (Bottom Left)
- **Prediction Rate**: How many predictions/minute the model makes
- **Inference Latency**: How fast the model runs (<2ms target)
- **Risk Score Drift**: Average risk trending up/down = model accuracy check

**Reading**: If predictions stable at 60/min with latency <2ms = healthy ML

### Row 4: Infrastructure (Right Side)
- **Redis Memory**: Current memory usage (should be <500MB)
- **DB Connection Pool**: Active connections (should be <5 for dev)
- **Celery Queue Depth**: Jobs waiting for workers (should be <10 normally)
- **Active Workers**: Number of Celery workers running (should be ≥1)

**Reading**: If all green = infrastructure is healthy

---

## 🔍 Common Queries & Troubleshooting

### I don't see any data in Grafana

**Solution 1**: Generate traffic
```bash
# Create an order to generate events
curl -X POST http://localhost:8000/api/v1/orders \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"driver_id": "d1", "planned_eta": "2025-01-15T15:00:00"}'
```

**Solution 2**: Check Prometheus is scraping
```
http://localhost:9090/targets
```
- Should show all targets as "UP"
- If "DOWN" check docker logs: `docker-compose logs prometheus`

### Metrics are delayed

**Expected**: Prometheus scrapes every 15 seconds
- Wait up to 30 seconds for new metrics to appear
- Refresh Grafana: F5 key

### I see "No data" in a panel

**Solution 1**: Check if service is running
```bash
docker-compose -f docker-compose.dev.yml logs api
```

**Solution 2**: Query might be wrong
- In Grafana, click panel → "Edit"
- Check query at bottom
- Click "Inspect" to see last result

### Queue depth is high (>100 jobs)

**Problem**: Celery workers are slow or overwhelmed
```bash
# Check Celery logs
docker-compose -f docker-compose.dev.yml logs celery-worker

# Increase workers (edit docker-compose.dev.yml)
command: celery -A src.tasks worker --loglevel=info --concurrency=8
```

---

## 📈 Production Readiness Checklist

Before deploying to production:

- [ ] **Logging Format**: Set `LOG_FORMAT=json` (not console)
- [ ] **Log Level**: Set `LOG_LEVEL=INFO` (not DEBUG)
- [ ] **Environment**: Set `ENVIRONMENT=production`
- [ ] **Metrics Retention**: Update Prometheus to 90+ days
- [ ] **Grafana Auth**: Enable authentication (not admin/admin)
- [ ] **Data Persistence**: Use managed volume storage, not docker volumes
- [ ] **Alerting**: Set up email/Slack integration in Prometheus
- [ ] **Scaling**: Use Kubernetes instead of docker-compose
- [ ] **Backups**: Set up Prometheus/Grafana backups
- [ ] **Monitoring**: Monitor Prometheus/Grafana themselves

---

## 🛠️ Common Commands

### View Logs
```bash
# All services
docker-compose -f docker-compose.dev.yml logs -f

# Specific service
docker-compose -f docker-compose.dev.yml logs -f api

# Last 100 lines
docker-compose -f docker-compose.dev.yml logs --tail=100 api
```

### Restart Service
```bash
# Restart API
docker-compose -f docker-compose.dev.yml restart api

# Restart all
docker-compose -f docker-compose.dev.yml restart
```

### Stop Everything
```bash
docker-compose -f docker-compose.dev.yml down
```

### Clean Up (Remove Data)
```bash
# ⚠️ WARNING: Deletes all data
docker-compose -f docker-compose.dev.yml down -v
```

### Rebuild After Code Changes
```bash
docker-compose -f docker-compose.dev.yml up -d --build
```

---

## 📋 Alert Examples

### When to Act on Alerts

**Red/Critical Alerts**:
- ❌ ModelPredictionsDropped → ML model crashed
- ❌ HighAPIErrorRate → API degraded
- ❌ CeleryWorkersDown → Background jobs stopped

→ **ACTION**: Check logs immediately, restart service

**Yellow/Warning Alerts**:
- ⚠️ HighRiskOrdersSpiking → Many problem orders detected
- ⚠️ HighDatabaseLatency → Queries are slow
- ⚠️ OptimizationQueueDeepHigh → Too many optimization jobs

→ **ACTION**: Monitor situation, may need scaling

### View Active Alerts
```
http://localhost:9090/alerts
```

### Check Prometheus Alert Rules
```
http://localhost:9090/rules
```

---

## 🔗 Quick Links

| Service | URL | Purpose |
|---------|-----|---------|
| Grafana | http://localhost:3001 | **Main Dashboard** |
| Prometheus | http://localhost:9090 | Metric queries & alerts |
| API Health | http://localhost:8000/health | Application status |
| API Metrics | http://localhost:8000/metrics | Raw Prometheus metrics |
| PostgreSQL | localhost:5432 | Database |
| Redis | localhost:6379 | Cache/messaging |

---

## 🚨 Emergency Troubleshooting

### Container won't start
```bash
# Check logs
docker-compose -f docker-compose.dev.yml logs <service-name>

# Rebuild
docker-compose -f docker-compose.dev.yml up -d --build
```

### Prometheus/Grafana show "No Data"
```bash
# Restart Prometheus
docker-compose -f docker-compose.dev.yml restart prometheus

# Wait 30 seconds, refresh Grafana
# http://localhost:3001
```

### Out of disk space
```bash
# Clean docker system
docker system prune -a

# Then rebuild
docker-compose -f docker-compose.dev.yml up -d --build
```

### Still broken?
```bash
# Nuclear option - start fresh
docker-compose -f docker-compose.dev.yml down -v
docker-compose -f docker-compose.dev.yml up -d
# Wait 2 minutes
```

---

## 📚 Full Documentation

For detailed integration info, see: `OBSERVABILITY_INTEGRATION_GUIDE.md`

For checklist, see: `OBSERVABILITY_CHECKLIST.md`

---

## 🎯 What You're Seeing

Once running, the IntelliLog-AI Observability Stack provides:

1. **Request Metrics**: See every API call with latency
2. **Agent Intelligence**: Watch decision-making in real-time
3. **ML Model Health**: Monitor prediction accuracy and speed
4. **Infrastructure**: Know if database/Redis are healthy
5. **Alerts**: Get notified when things go wrong
6. **Structured Logs**: Query detailed event logs (when integrated)

**Total System Visibility**: ✅ You have it!

---

**Ready to go?** → Run `docker-compose -f docker-compose.dev.yml up -d` and visit http://localhost:3001
