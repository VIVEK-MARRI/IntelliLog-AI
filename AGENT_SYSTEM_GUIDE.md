# IntelliLog-AI: Delay Prevention Agent (Phase 3)

## 🎯 Overview

The Delay Prevention Agent is a **production-grade LangGraph agent** that:
- Consumes GPS ping events in real-time from Redis Streams
- Maintains persistent state for active orders
- Runs ML predictions to assess delay risk
- Autonomously decides whether to reroute, alert customers, or take no action
- Writes immutable audit logs for every decision
- Emits Prometheus metrics for monitoring

This is a **real agent**, not a prompt wrapper:
- ✅ Stateful (maintains order context across events)
- ✅ Event-driven (reactive to GPS pings)
- ✅ Autonomous (makes decisions without human intervention)
- ✅ Recoverable (persists state in Redis)
- ✅ Observable (comprehensive logging and metrics)

---

## 🏗️ Architecture

### Agent Graph Flow

```
┌─────────────────────┐
│  consume_event      │ (GPS ping from Redis Stream)
│  (order_id, lat/lng)│
└──────────┬──────────┘
           ↓
┌─────────────────────────────────┐
│  update_order_state             │ (Load/create from Redis)
│  - Position                     │ (Update: lat, lng, speed)
│  - Route progress               │ (Update: stops completed)
│  - Route deviation              │ (Haversine: planned vs actual)
│  → Save to Redis                │
└──────────┬──────────────────────┘
           ↓
┌─────────────────────────────────┐
│  compute_features               │ (Build 14 ML features)
│  - Ratios (stops, time)         │
│  - Speeds (current, trend)      │
│  - Stop duration                │
│  - Driver reliability           │
│  - Time-of-day (cyclical)       │
│  → Validate (no NaN)            │
└──────────┬──────────────────────┘
           ↓
┌─────────────────────────────────┐
│  run_prediction                 │ (Call PredictionService)
│  - Rate limit: 30sec min        │
│  - Get SHAP explanations        │
│  - Update risk_history          │
└──────────┬──────────────────────┘
           ↓
┌─────────────────────────────────┐
│  evaluate_risk (CONDITIONAL)    │ Decision point
│  - risk < 0.30 → no_action      │
│  - 0.30-0.70  → alert_only      │
│  - risk > 0.70 → reroute_and_alert
│  - Rate limits on alerts        │
└──────────┬──────────────────────┘
           │
    ┌──────┴──────┬────────────────┬────────────────┐
    ↓             ↓                ↓                ↓
┌────────┐   ┌─────────┐    ┌──────────┐    ┌─────────────┐
│ no     │   │ alert   │    │ reroute  │    │ record      │
│action  │   │_only    │    │_and_alert│    │_no_action   │
│        │   │ ├─────→ │    │ ├─────→  │    │             │
└───┬────┘   │alert    │    │reroute   │    └─────┬───────┘
    │        │_cust    │    │ ├─────→  │          │
    │        │        │    │call_route│         │
    │        └────┬────┘    │optimizer │         │
    │             │         │ ├─────→  │         │
    │             │         │update_eta│        │
    │             │         │ ├─────→  │         │
    │             │         │alert_cust│        │
    │             │         │         │         │
    │             │         └────┬────┘         │
    │             │              │              │
    │             └──────┬───────┘              │
    │                    ↓                      │
    │        ┌───────────────────┐             │
    │        │  write_audit_log  │◄────────────┘
    │        │                   │
    │        │ (Always called)   │
    │        │ (Never fails)     │
    │        └─────────┬─────────┘
    │                  ↓
    └─────────────────[END]
```

### State Flow

The agent operates on two types of state:

1. **OrderAgentState** (Redis-persisted)
   - Order identity, position, progress
   - Speed history, stop times
   - Risk score, decision history
   - Alert/reroute counters
   - TTL: 4 hours

2. **AgentGraphState** (In-flight, for one execution)
   - GPS event input
   - Intermediate results (features, prediction)
   - Dependencies (services, clients)
   - Final decision
   - Cleans up after execution

---

## 📁 File Structure

```
src/agent/
├── __init__.py              # Module exports
├── state.py                 # OrderAgentState + StateManager (150 lines)
├── tools.py                 # 4 agent tools (300 lines)
├── graph.py                 # LangGraph + all nodes (550 lines)
└── runner.py                # Event loop + Redis consumer (400 lines)

tests/
└── test_agent.py            # 25+ tests (500+ lines)
```

---

## 🔑 Key Components

### 1. State Management (`src/agent/state.py`)

**OrderAgentState**: Pydantic model stored in Redis
```python
state = OrderAgentState(
    order_id="order-001",
    current_lat=40.7128,
    current_lng=-74.0060,
    current_speed_kmh=35.0,
    completed_stops=5,
    planned_stops=10,
    current_risk_score=0.65,
    alert_sent_count=1,
)
```

**StateManager**: Async CRUD operations
```python
manager = StateManager(redis_client)

# Load existing state (or None if not found)
state = await manager.load("order-001")

# Save to Redis with TTL
await manager.save(state, ttl_hours=4)

# Delete when order completes
await manager.delete("order-001")
```

### 2. Tools (`src/agent/tools.py`)

#### Tool 1: call_route_optimizer
- Async HTTP POST to route optimization service
- 200-500ms latency (expensive!)
- Only called when risk > 0.70
- 2-second timeout with graceful fallback
- Returns: time_saved_minutes, new waypoints, solver_status

#### Tool 2: send_customer_notification
- Webhook to tenant's notification endpoint
- Rate-limited: max 1 per order per 30 minutes
- Payload: delay_minutes, reason (from SHAP), new_eta
- Example reason: "Delivery at risk due to: slow traffic, long stop times"

#### Tool 3: update_order_eta
- Updates order ETA in PostgreSQL
- Publishes ETA_UPDATED event to Redis pub/sub
- Triggers real-time dashboard update

#### Tool 4: write_audit_log
- Called on EVERY decision (no_action, alert, reroute)
- Records: risk_score, SHAP factors, tools called, timestamp
- Never fails (best-effort logging)
- Enables full auditability of agent decisions

### 3. Graph Nodes (`src/agent/graph.py`)

All nodes are async functions:

#### node_update_order_state
- Load OrderAgentState from Redis (or create new)
- Update position from GPS event
- Compute route deviation (Haversine)
- Save back to Redis

#### node_compute_features
- Build 14 ML features from order state
- Validate features (fail if NaN or missing)
- Skip prediction if validation fails

#### node_run_prediction
- Call PredictionService.predict_with_shap()
- Rate-limit: 30sec between predictions
- Update risk_history
- Extract top 5 SHAP factors

#### node_evaluate_risk (CONDITIONAL)
Decision logic:
- risk < 0.30 → "no_action"
- 0.30-0.70 → "alert_only" (if rate limits allow)
- 0.70+ → "reroute_and_alert" (if not already rerouted)

Rate limiting:
- Max 3 alerts per order
- Min 30 minutes between alerts
- Only reroute once per order

#### node_alert_customer
- Generate reason from top SHAP factors
- Call send_customer_notification tool
- Increment alert counter

#### node_invoke_reroute
- Call call_route_optimizer tool
- If time_saved > 3 minutes: update ETA, mark reroute_triggered
- If timeout/no improvement: skip reroute, alert anyway

#### node_record_no_action
- Record that no action was taken
- Update last_decision timestamp

#### node_write_audit_log
- Write complete decision record
- Never fails (best-effort)

### 4. Event Loop (`src/agent/runner.py`)

**AgentRunner**:
```python
runner = AgentRunner(
    redis_url="redis://localhost",
    db_url="postgresql+asyncpg://user:pass@localhost/db",
    models_dir="models/",
    batch_size=10,
    max_retries=3,
)

await runner.setup()
await runner.run_forever()  # Infinite loop
```

Features:
- Reads from Redis Stream: `gps_pings`
- Consumer group: `delay_agent`
- Batch processing (default 10 events)
- Auto-retry stale events (30sec threshold)
- Dead-letter queue (DLQ) for failed events
- Prometheus metrics (events, decisions, latency)

---

## 🧠 Decision Logic

### Risk-Based Routing

```
if risk_score < 0.30:
    → no_action
    
elif 0.30 ≤ risk_score < 0.70:
    if alert_sent_count >= 3:
        → no_action (alert limit reached)
    elif last_alert < 30_min_ago:
        → no_action (rate limited)
    else:
        → alert_only

elif risk_score ≥ 0.70:
    if reroute_triggered:
        → alert_only (don't reroute again)
    else:
        → reroute_and_alert
```

### Rate Limiting

**Alerts**:
- Max 3 per order
- Min 30 minutes apart
- Prevents notification spam

**Rerouting**:
- Max 1 per order
- Only if risk stays high

**Predictions**:
- Min 30 seconds between calls
- Uses cached score otherwise
- Prevents model overload

---

## 📊 Monitoring

### Prometheus Metrics

- `agent_events_processed_total` — Counter with status
- `agent_decisions_total` — Counter by decision type
- `agent_graph_latency_seconds` — Histogram
- `prediction_risk_score` — Distribution
- `active_high_risk_orders` — Gauge by tenant

### Structlog Output

Every event produces structured logs:
```json
{
  "event": "event_processed",
  "order_id": "order-001",
  "tenant_id": "tenant-001",
  "risk_score": 0.72,
  "decision": "reroute_and_alert",
  "tools_called": ["call_route_optimizer", "send_customer_notification"],
  "latency_ms": 850,
  "timestamp": "2026-05-29T12:55:00Z"
}
```

---

## 🧪 Testing

### Test Coverage

**Unit Tests** (15 tests):
- OrderAgentState creation and validation
- StateManager save/load/delete
- Tool success/timeout/error paths
- Individual node functions
- Haversine distance calculation

**Integration Tests** (10+ tests):
- Full graph with low-risk event
- Full graph with high-risk event
- Rate limiting (duplicate alerts)
- Reroute once per order
- Audit logging on all paths

### Running Tests

```bash
# All agent tests
pytest tests/test_agent.py -v

# Specific test
pytest tests/test_agent.py::test_node_evaluate_risk_reroute -v

# With coverage
pytest tests/test_agent.py --cov=src/agent
```

---

## 🚀 Deployment

### Environment Setup

```bash
# Install dependencies
pip install langgraph langchain-core redis sqlalchemy[asyncio] \
            httpx prometheus-client structlog

# Create agent module
mkdir -p src/agent
touch src/agent/__init__.py
```

### Redis Streams Setup

```bash
# Create stream (auto-created on first message)
# GPS pings published as:
XADD gps_pings * order_id order-001 lat 40.7128 lng -74.0060 ...

# Consumer group created by runner on first start
```

### Running the Agent

```bash
# Option 1: Direct Python
python -m src.agent.runner

# Option 2: With environment variables
export REDIS_URL="redis://localhost"
export DATABASE_URL="postgresql+asyncpg://user:pass@localhost/db"
export MODELS_DIR="models/"
python -m src.agent.runner

# Option 3: Docker
docker run -e REDIS_URL=redis://redis -e DATABASE_URL=postgresql://... agent:latest
```

### Health Check

```python
# Agent health endpoint (HTTP)
GET /metrics

# Returns Prometheus metrics including:
- agent_events_processed_total
- agent_decisions_total
- agent_graph_latency_seconds
```

---

## 🔧 Configuration

### Decision Thresholds

Edit in `node_evaluate_risk()`:
```python
LOW_RISK_THRESHOLD = 0.30      # Below: no action
MED_RISK_THRESHOLD = 0.70      # Above: reroute
ALERT_LIMIT = 3                # Max alerts per order
ALERT_MIN_INTERVAL_MIN = 30    # Minutes between alerts
PREDICTION_MIN_INTERVAL_SEC = 30
REROUTE_BENEFIT_MIN_MIN = 3    # Min minutes saved to reroute
```

### Redis Keys

- `agent:order_state:{order_id}` — OrderAgentState (JSON)
- `notification_rate:{order_id}` — Rate limit flag (30min TTL)
- `order_tenant:{order_id}` — Tenant ID cache
- `tenant:{tenant_id}:webhook_url` — Webhook config

---

## 📈 Performance

### Latency

- **Average graph execution**: 500-1000ms
  - update_order_state: 5ms (Redis)
  - compute_features: 2ms (local)
  - run_prediction: 2-5ms (model)
  - evaluate_risk: <1ms (logic)
  - alert_customer: 100-200ms (HTTP)
  - invoke_reroute: 300-500ms (optimizer service)
  - write_audit_log: 20-50ms (DB)

- **Throughput**: 100-200 events/second per runner instance
- **Horizontal scaling**: Multiple runners with same consumer group

### Resource Usage

- Memory: ~50MB per runner
- CPU: Low (mostly I/O bound)
- Redis: 1-5KB per active order

---

## ⚠️ Error Handling

### Graceful Degradation

1. **GPS Event Malformed** → Skip event, log warning
2. **Feature Validation Fails** → Skip prediction, no action
3. **Prediction Timeout** → Use cached risk score
4. **Route Optimizer Timeout** → Skip reroute, alert anyway
5. **Notification HTTP Error** → Log, retry on next ping
6. **Audit Log Write Fails** → Log error, don't fail graph

### Retry Logic

- Failed events retry up to 3 times
- Stale pending events retried after 30 seconds
- Failed events moved to DLQ after max retries
- DLQ monitored separately

---

## 🎯 Use Cases

### Scenario 1: Low-Risk Delivery (risk = 0.15)
```
Decision: no_action
Action: Record decision, update state
Audit: "No intervention needed"
```

### Scenario 2: Delayed Pickup (risk = 0.45)
```
Decision: alert_only (if under rate limit)
Actions:
  1. Generate reason: "Driver running behind due to traffic"
  2. Send webhook: {event: "delivery.delay_warning", ...}
  3. Write audit log
Audit: "Customer alerted - 1/3"
```

### Scenario 3: Critical Delay (risk = 0.82)
```
Decision: reroute_and_alert
Actions:
  1. Call route optimizer (200-500ms)
  2. If time_saved > 3min: update ETA, save new route
  3. Send customer notification
  4. Write audit log
Audit: "Rerouted (10min saved), customer notified"
```

---

## 🔐 Security

### API Keys & Secrets

```python
# Use environment variables
WEBHOOK_SECRETS = os.getenv("WEBHOOK_SECRETS")  # For verification
DB_PASSWORD = os.getenv("DATABASE_PASSWORD")
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD")
```

### Rate Limiting

- Prevent notification spam (30min between alerts)
- Prevent model overload (30sec between predictions)
- HTTP request timeouts (2sec optimizer, 5sec webhook)

### Audit Trail

- Every decision logged
- Includes decision rationale (SHAP factors)
- Immutable (append-only)
- Queryable for compliance

---

## 📚 API Reference

### OrderAgentState

```python
class OrderAgentState(BaseModel):
    order_id: str
    driver_id: str
    tenant_id: str
    
    # Position (updated every ping)
    current_lat: float
    current_lng: float
    current_speed_kmh: float
    
    # Progress
    planned_stops: int
    completed_stops: int
    current_eta: datetime
    
    # Risk
    current_risk_score: float  # 0.0-1.0
    risk_history: list[float]  # Last 20 scores
    
    # Decisions
    last_decision: Optional[str]  # 'no_action', 'alert_only', 'reroute_and_alert'
    alert_sent_count: int
    reroute_triggered: bool
```

### StateManager

```python
async def load(order_id: str) -> Optional[OrderAgentState]
async def save(state: OrderAgentState, ttl_hours: int = 4) -> None
async def delete(order_id: str) -> None
async def get_active_orders_for_tenant(tenant_id: str) -> list[str]
```

### Agent Tools

```python
async def call_route_optimizer(
    order_id: str,
    current_lat: float,
    current_lng: float,
    remaining_stops: list[dict],
    tenant_id: str,
    http_client: httpx.AsyncClient,
) -> RouteOptimizerResult

async def send_customer_notification(
    order_id: str,
    tenant_id: str,
    delay_minutes: float,
    reason: str,
    new_eta: datetime,
    http_client: httpx.AsyncClient,
    redis_client: Redis,
) -> NotificationResult
```

---

## 🎓 Learning Resources

1. **Start with**: `src/agent/state.py` (state persistence)
2. **Then**: `src/agent/tools.py` (tool implementations)
3. **Then**: `src/agent/graph.py` (decision logic)
4. **Finally**: `src/agent/runner.py` (event loop)
5. **Tests**: `tests/test_agent.py` (usage examples)

---

## 🐛 Troubleshooting

### Issue: "Order state not found"
**Solution**: First ping creates new state, subsequent pings load existing

### Issue: "No notifications being sent"
**Solution**: Check webhook URL configured in Redis, check tenant config

### Issue: "Agent not processing events"
**Solution**: Check consumer group created, Redis Stream has events, runner is running

### Issue: "High latency (>2sec)"
**Solution**: Route optimizer timeout likely (2sec limit), check service health

---

**Status**: ✅ Production-Ready
**Test Coverage**: 25+ tests
**Dependencies**: langgraph, redis, sqlalchemy, httpx
**Last Updated**: May 29, 2026
