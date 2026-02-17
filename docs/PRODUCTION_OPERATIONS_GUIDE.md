# IntelliLog-AI Production Operations Guide

## System Architecture

IntelliLog-AI is a logistics optimization SaaS platform with the following components:

### Backend Services
- **API Server** (`FastAPI`): Main REST API on port 8000
- **Worker** (`Celery`): Background task processing
- **Database** (PostgreSQL + PostGIS): Data persistence on port 5432
- **Cache** (Redis): Session and task queue on port 6379
- **Routing Engine** (OSRM): Road network calculations on port 5000

### Frontend
- **React + Vite**: Web dashboard on port 3000

---

## DEPLOYMENT CHECKLIST

### Pre-Deployment
- [ ] Environment variables configured
- [ ] Database migrations applied
- [ ] SSL certificates installed
- [ ] OSRM data files downloaded and preprocessed
- [ ] Model files placed in `/models` directory
- [ ] Redis and PostgreSQL running and accessible
- [ ] All dependencies installed: `pip install -r requirements.txt`

### Environment Configuration (.env)
```bash
# Database
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<strong_password>
POSTGRES_SERVER=db
POSTGRES_PORT=5432
POSTGRES_DB=intellog
DATABASE_URL=postgresql://postgres:<strong_password>@db:5432/intellog

# Redis & Celery
REDIS_URL=redis://redis:6379/0
CELERY_BROKER_URL=redis://redis:6379/0
CELERY_RESULT_BACKEND=redis://redis:6379/0

# Security
SECRET_KEY=<strong_random_key>
ACCESS_TOKEN_EXPIRE_MINUTES=43200

# OSRM
OSRM_BASE_URL=http://osrm:5000
OSRM_PROFILE=driving
OSRM_TIMEOUT_SEC=10
OSRM_MAX_POINTS=100
OSRM_FALLBACK_HAVERSINE=true

# Models
MODEL_PATH=/app/models/xgb_delivery_time_model.pkl

# Feature Flags
REROUTE_ENABLED=true
REROUTE_INTERVAL_SEC=60
REROUTE_AVG_SPEED_KMPH=30

AUTO_RETRAIN_ENABLED=true
DRIFT_DETECTION_ENABLED=true
DRIFT_SCORE_THRESHOLD=0.3
```

---

## DEPLOYMENT STEPS

### 1. Docker Compose Deployment
```bash
docker-compose up -d
```

This starts all services:
- API (port 8001 → 8000)
- Worker (background)
- Frontend (port 3000)
- PostgreSQL (port 5433 → 5432)
- Redis (port 6379)

### 2. Database Initialization
```bash
# Run migrations
docker exec intellog_api alembic upgrade head

# Seed initial data if needed
docker exec intellog_api python scripts/seed_db.py
```

### 3. Health Check
```bash
# API health
curl http://localhost:8001/api/v1/status/health

# Frontend 
curl http://localhost:3000
```

---

## PRODUCTION HARDENING

### Security
1. **Change all default passwords**
   - PostgreSQL: `POSTGRES_PASSWORD`
   - JWT Secret: `SECRET_KEY`

2. **Enable CORS properly**
   - Update `CORS_ORIGINS` to specific domains
   - Remove `allow_origins=["*"]`

3. **SSL/TLS**
   - Use reverse proxy (Nginx, HAProxy)
   - Obtain valid certificates
   - Redirect HTTP → HTTPS

4. **Rate Limiting**
   - Add rate limit middleware to API
   - Protect `/optimize` endpoint (expensive operation)

### Reliability
1. **Health Monitoring**
   - Implement health check endpoints
   - Monitor Celery workers
   - Check database connectivity

2. **Logging & Alerting**
   - Centralize logs (ELK Stack, Datadog, etc.)
   - Alert on:
     - API errors (5xx)
     - Worker failures
     - Database connection drops
     - Slow queries

3. **Backups**
   - Daily PostgreSQL backups
   - Store in S3 or backup service
   - Test restore procedure

4. **Resource Limits**
   - CPU: Limit API to 4 cores, Workers to 8 cores
   - Memory: 4GB API, 8GB Workers minimum
   - Disk: Monitor `/data/osrm` (can be 10GB+)

---

## RUNNING TESTS

### Unit Tests
```bash
pytest tests/ -v
```

### API Integration Tests
```bash
# Test API endpoints
python test_api_latency.py

# Test route optimization
python scripts/validate_model.py

# Test map rendering
python test_map.py
```

### Load Testing
```bash
# Simulate concurrent users
ab -n 1000 -c 10 http://localhost:8001/api/v1/status/health

# Test optimization with large order batches
# See docs/QA_CHECKLIST.md
```

---

## MONITORING & OPERATIONS

### Key Metrics to Track
1. **Performance**
   - API response time (target: <200ms for list endpoints, <5s for optimize)
   - Celery task completion time
   - OSRM table API latency

2. **Reliability**
   - Error rate (target: <0.1%)
   - Worker availability
   - Database uptime
   - Cache hit rate

3. **Business**
   - Orders processed per day
   - Routes optimized per hour
   - ETA prediction accuracy (RMSE)
   - Cost savings from optimization

### Useful Commands
```bash
# View logs
docker logs -f intellog_api
docker logs -f intellog_worker

# Check Celery workers
docker exec intellog_worker celery -A src.backend.worker.celery_app inspect stats

# Database connections
docker exec intellog_db psql -U postgres -d intellog -c "SELECT count(*) FROM pg_stat_activity;"

# Restart services
docker restart intellog_api intellog_worker
```

---

## SCALING CONSIDERATIONS

### Horizontal Scaling
1. **API Workers**: Use Gunicorn/Uvicorn with multiple workers
   ```bash
   uvicorn src.backend.app.main:app --workers=4 --host=0.0.0.0
   ```

2. **Celery Workers**: Scale workers based on load
   ```bash
   celery -A src.backend.worker.celery_app worker --concurrency=8
   ```

3. **Database**: Consider read replicas for reporting queries

### Caching Strategy
- Cache route optimizations for 1 hour
- Cache warehouse-to-warehouse distances
- Cache ETA predictions for identical routes
- Use Redis for session management

### OSRM Optimization
- Pre-cache common routes
- Consider OSRM server clustering
- Monitor response times
- Fall back to haversine for slow requests

---

## TROUBLESHOOTING

### API Won't Start
```bash
# Check logs
docker logs intellog_api

# Verify env vars
docker exec intellog_api env | grep DATABASE_URL

# Test DB connection
docker exec intellog_db psql -U postgres -d intellog -c "SELECT 1"
```

### Workers Not Processing Tasks
```bash
# Check Celery
docker logs intellog_worker

# Inspect Redis
docker exec intellog_redis redis-cli ping
docker exec intellog_redis redis-cli dbsize

# Restart workers
docker restart intellog_worker
```

### Routes Not Optimizing
- Check OSRM availability: `curl http://localhost:5001/route/v1/driving/`
- Verify order data (valid lat/lng coordinates)
- Check solverimits (OR-Tools timeout)
- Monitor OSRM memory usage

### Performance Issues
- Profile slow queries: Enable query logging
- Check index usage: Review PostgreSQL EXPLAIN plans
- Monitor Celery queue size: Should not exceed 10,000 tasks
- Monitor Redis memory: Clear old sessions as needed

---

## COMPLIANCE & SECURITY

### Data Protection
- GDPR: Implement data export/deletion endpoints
- PII: Encrypt customer addresses at rest
- Audit logs: Track who accessed what data

### High Availability
- Multi-region deployments
- Database replication
- Load balancing
- Failover automation

---

## MAINTENANCE SCHEDULE

### Daily
- Monitor error logs
- Check system health metrics
- Verify backups completed

### Weekly
- Review performance metrics
- Analyze route optimization quality
- Check storage usage

### Monthly
- Model retraining if drift detected
- Security patching
- Database optimization (VACUUM, REINDEX)

### Quarterly
- Full system load testing
- Disaster recovery drill
- Security audit

---

## SUPPORT & ESCALATION

For issues, check:
1. Logs in `/app/logs` directory
2. DB query performance
3. External service availability (OSRM)
4. See `docs/BUGS_AND_IMPROVEMENTS.md` for known issues

