# IntelliLog-AI: Developer Quick Reference

## System Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│  FRONTEND (React + TypeScript)                      │
│  ┌─────────────────────────────────────────────┐   │
│  │ RouteOptimizer      FleetControl  Dashboard │   │
│  │ • CSV upload        • Live tracking • Map   │   │
│  │ • Order sync        • Driver list   • Stats │   │
│  │ • VRP solver        • GPS stream    • Status│   │
│  └─────────────────────────────────────────────┘   │
│               ↓           ↓           ↓             │
│        REST API + WebSocket                        │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│  BACKEND (FastAPI + Python)                         │
│  ┌────────────────────────────────────────────────┐ │
│  │ OptimizationService           RerouteService   │ │
│  │ • OSRM integration (roads)  • 60s scheduler    │ │
│  │ • VRP solver (OR-Tools)     • Route lifecycle  │ │
│  │ • ML ETA prediction         • Superseding      │ │
│  │ • Haversine fallback        • WebSocket store  │ │
│  └────────────────────────────────────────────────┘ │
│               ↓                                      │
│  ┌────────────────────────────────────────────────┐ │
│  │ Database (PostgreSQL)                         │ │
│  │ • Orders  • Routes  • Drivers  • Tenants      │ │
│  │ • Features (Redis cache)                      │ │
│  └────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
        ↓                    ↓                    ↓
    OSRM          OR-Tools VRP Solver      XGBoost ML
   (Roads)         (Routing Algo)        (ETA Model)
```

---

## Quick Start Commands

### Start Everything (Docker Compose):
```bash
# Terminal 1: Full stack
docker-compose up -d

# Wait for services to be ready (~30s)
# OSRM may take 2-3 min to load road data
```

### Start Development (if not using Docker):
```bash
# Terminal 1: Backend
cd src/backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Terminal 2: Frontend  
cd src/frontend
npm run dev

# Terminal 3: Reroute scheduler (if running backend directly)
# This starts in app.main.py on app startup
```

---

## API Endpoints Cheat Sheet

### Core Routes:
```
POST   /api/v1/orders/                 Create order
GET    /api/v1/orders/                 List orders
POST   /api/v1/drivers/                Create driver
GET    /api/v1/drivers/                List drivers
POST   /api/v1/routes/optimize         Run optimization (KEY ENDPOINT)
GET    /api/v1/routes/                 List routes
```

### Optimization Parameters:
```bash
# Full URL example:
POST /api/v1/routes/optimize?method=ortools&use_ml=true&use_osrm=true&avg_speed_kmph=30&ortools_time_limit=10

# Curl example:
curl -X POST "http://localhost:8000/api/v1/routes/optimize" \
  -H "Content-Type: application/json" \
  -d '{}' \
  -G \
  -d "method=ortools" \
  -d "use_ml=true" \
  -d "use_osrm=true" \
  -d "avg_speed_kmph=30" \
  -d "ortools_time_limit=10"
```

### Live Rerouting:
```
WS     /api/v1/ws/locations            Connect for GPS updates
POST   /api/v1/reroute/now             Manual reroute trigger
GET    /api/v1/status/system           System health
GET    /api/v1/status/reroute          Rerouting metrics
```

---

## Frontend Component Guide

### RouteOptimizer
**File**: `src/frontend/src/pages/RouteOptimizer.tsx`

**Props**: None (self-contained)

**Key Functions**:
```typescript
// 1. Import CSV and parse
handleFileChange(file: File)
  → setOrders(parsed[])
  
// 2. Sync orders to database
syncOrders()
  → POST /api/v1/orders/ for each order
  → setSyncedCount(success_count)
  
// 3. Run optimization with params
handleOptimize()
  → POST /api/v1/routes/optimize?method=...&use_ml=...
  → setOptimizationResult(routes[])
```

**State Variables**:
```typescript
method: 'ortools' | 'greedy'           // Solver algorithm
useMl: boolean                          // Enable ML ETA
useOsrm: boolean                        // Enable real roads
avgSpeed: number                        // 10-60 km/h
timeLimit: number                       // 5-30 seconds
syncedCount: number                     // Orders synced to DB
orders: Order[]                         // Parsed from CSV
optimizationResult: Route[]             // Result routes
```

---

### FleetControl
**File**: `src/frontend/src/pages/FleetControl.tsx`

**Features**:
- Live driver listing with status badges
- Real-time map with GPS positions
- WebSocket connection to `/api/v1/ws/locations`
- Rerouting indicator with pulsing animation

**WebSocket Message Format**:
```json
{
  "tenant_id": "tenant_123",
  "driver_id": "drv_456", 
  "lat": 12.9716,
  "lng": 77.5946,
  "speed_kmph": 45
}
```

---

### DashboardHome
**File**: `src/frontend/src/pages/DashboardHome.tsx`

**Components**:
1. Stats Grid (4 cards) - Fleet/order metrics
2. Reroute Status Card - Active/idle status
3. Live Map - Vehicle tracking
4. AI Routing Info - Metrics & optimization button

---

### LogisticsMap
**File**: `src/frontend/src/components/LogisticsMap.tsx`

**Props**:
```typescript
interface Props {
  drivers: any[]                 // Driver objects with coordinates
  orders: any[]                  // Order objects with lat/lng
  routes: any[]                  // Route objects with geometry_json
  mode?: 'planning' | 'monitoring'  // Map mode
}
```

**Key Logic**:
```typescript
// Detect if we have live GPS data
const hasLivePositions = drivers.some(d => d.current_lat && d.current_lng)

// If live data → don't simulate (hasLivePositions = false disables sim)
// Use geometry_json.points for route paths
// Filter out routes with status='superseded'
```

---

## Backend Service Guide

### OptimizationService
**File**: `src/backend/app/services/optimization_service.py`

**Main Method**:
```python
@staticmethod
def calculate_routes(
    orders: List[Dict],           # Orders to deliver
    drivers: int,                 # Number of drivers (or driver data)
    method: str = 'ortools',      # 'ortools' or 'greedy'
    use_ml: bool = True,          # Use ML for ETA
    use_osrm: bool = True,        # Use real road distances
    drivers_data: List[Dict] = None,  # Driver locations
    avg_speed_kmph: float = 30,   # Speed for time calc
    ortools_time_limit: float = 10 # Solver seconds
) -> Dict:
    """
    Returns: {
      "routes": [{"driver_id", "orders", "total_distance_km", "total_duration_min", ...}],
      "unassigned": [{"order_id", "reason"}]
    }
    """
```

**Flow**:
```
1. Build distance + time matrices:
   - OSRM if enabled (via RoutingService.get_osrm_table)
   - Fallback to haversine + avg_speed
   
2. Get ML predictions if use_ml:
   - XGBoost ETA for each order
   
3. Call VRP solver:
   - ortools_vrp() for precise routes
   - or greedy_route() for fast routes
   
4. Return route objects with geometry_json
```

---

### RerouteService
**File**: `src/backend/app/services/reroute_service.py`

**Key Components**:

```python
# 1. Thread-safe live location store
live_location_store = LiveLocationStore()
  ├─ update_location(tenant_id, driver_id, lat, lng, speed)
  └─ get_all_locations(tenant_id) → Dict[driver_id → {lat,lng,ts}]

# 2. Main rerouting function
def reroute_tenant(db, tenant_id) → Dict:
  ├─ Select pending + assigned orders
  ├─ Get driver locations + vehicles
  ├─ Call OptimizationService.calculate_routes()
  ├─ Create new Route records
  └─ Mark old routes as 'superseded'

# 3. Background scheduler
async def reroute_scheduler():
  └─ Runs every 60s by default (config.REROUTE_INTERVAL_SEC)
     └─ For each tenant: call reroute_tenant()
```

---

### RoutingService
**File**: `src/backend/app/services/routing_service.py`

**Main Method**:
```python
@staticmethod
def get_osrm_table(points: List[Tuple[float,float]]) → Tuple[List[List[float]], List[List[float]]]:
    """
    Call OSRM Table API to get distance/duration matrix.
    
    OSRM API: POST http://osrm:5000/table/v1/driving/{lng},{lat};{lng},{lat}
    
    Returns: (distance_matrix_km, duration_matrix_sec)
    
    Raises: Exception on timeout/error (caught in OptimizationService)
    """
```

---

## Database Models Quick Ref

### Order
```python
id                    # UUID
tenant_id             # Multi-tenant key
order_number          # User-friendly ID
customer_name         # Delivery recipient
delivery_address      # Full address
lat, lng              # Coordinates
weight                # In kg
status                # 'pending' | 'assigned' | 'completed' | 'cancelled'
time_window_start     # Optional earliest delivery
time_window_end       # Optional latest delivery
created_at, updated_at
```

### Route
```python
id                    # UUID
tenant_id             # Multi-tenant key
driver_id             # FK to Driver
orders json           # List of Order IDs in sequence
status                # 'planned' | 'active' | 'completed' | 'superseded'
total_distance_km     # Sum of segments
total_duration_min    # Estimated delivery time
geometry_json         # {type: 'LineString', coordinates: [[lat,lng],...], points:[...]}
created_at, updated_at
```

### Driver
```python
id                    # UUID  
tenant_id             # Multi-tenant key
name                  # Driver name
phone                 # Contact number
vehicle_capacity      # Max weight/items
status                # 'available' | 'busy' | 'offline'
current_lat, current_lng  # Live position (updated by reroute + WebSocket)
```

---

## Configuration Reference

### Key Environment Variables:

```env
# OSRM Configuration
OSRM_BASE_URL=http://osrm:5000
OSRM_PROFILE=driving
OSRM_TIMEOUT_SEC=10
OSRM_MAX_POINTS=100
OSRM_FALLBACK_HAVERSINE=true

# Rerouting
REROUTE_ENABLED=true
REROUTE_INTERVAL_SEC=60
REROUTE_AVG_SPEED_KMPH=30
REROUTE_ORTOOLS_TIME_LIMIT=10

# Frontend
VITE_API_BASE_URL=http://localhost:8000/api/v1
VITE_WEBSOCKET_URL=ws://localhost:8000/api/v1/ws/locations
```

### See also:
`src/backend/app/core/config.py` for all settings

---

## Common Debugging

### Issue: OSRM connection refused
```
Error: Connection refused to http://osrm:5000

Solution:
1. Check: docker-compose ps | grep osrm
2. Verify: OSRM needs 2-3 min to load (check logs)
3. Fallback: Set OSRM_FALLBACK_HAVERSINE=true (auto-enabled)
```

### Issue: Orders not syncing
```
Error: POST /api/v1/orders/ returns 400 Bad Request

Debug:
1. Check CSV format: order_number,customer,address,lat,lng,weight
2. Verify coordinates are numbers (not strings)
3. Check tenant_id header in syncOrders()
```

### Issue: Rerouting not triggering
```
Error: Routes stay "planned", no superseding

Debug:
1. Check: GET /api/v1/status/system → rerouting_enabled=true
2. Check backend logs: tail -f logs/app.log
3. Verify: Drivers have locations (GET /api/v1/drivers/)
4. Manually trigger: POST /api/v1/reroute/now
```

### Issue: WebSocket won't connect
```
Error: FleetControl shows no reroute indicator

Debug:
1. Check URL: VITE_WEBSOCKET_URL env var set
2. Browser console: Look for WebSocket errors
3. Backend: Check live_reroute.py endpoint is registered
4. Firewall: Ensure port 8000 allows WebSocket
```

---

## Performance Tuning

### For Large Order Sets (500+):
1. Increase `ortools_time_limit` → 20-30s
2. Enable `use_osrm=true` for accurate times
3. Set `REROUTE_INTERVAL_SEC=120` (2 min instead of 1 min)
4. Ensure OSRM_MAX_POINTS >= number of orders

### For Real-Time Responsiveness:
1. Reduce `avg_speed_kmph` for conservative ETAs
2. Enable `use_ml=true` (adds 50-100ms)
3. Set `ortools_time_limit=5-10` for quick decisions
4. Use `method=greedy` for instant feedback (50% less optimal)

### Memory Management:
- LiveLocationStore keeps last position per driver
- Automatically cleans on driver offline
- Max memory: O(drivers_count × 1KB) ≈ negligible

---

## Testing Endpoints (Postman-Friendly)

### 1. Create Order:
```
POST http://localhost:8000/api/v1/orders/
Content-Type: application/json

{
  "order_number": "ORD-001",
  "customer_name": "John Doe",
  "delivery_address": "123 Main St",
  "lat": 12.9716,
  "lng": 77.5946,
  "weight": 5.0,
  "status": "pending"
}
```

### 2. Create Driver:
```
POST http://localhost:8000/api/v1/drivers/
  
{
  "name": "Driver 1",
  "phone": "9876543210",
  "vehicle_capacity": 100,
  "status": "available",
  "current_lat": 12.9700,
  "current_lng": 77.5900
}
```

### 3. Optimize Routes:
```
POST http://localhost:8000/api/v1/routes/optimize?method=ortools&use_ml=true&use_osrm=true&avg_speed_kmph=30&ortools_time_limit=10

# If body needed:
{}
```

### 4. Check Status:
```
GET http://localhost:8000/api/v1/status/reroute?tenant_id=default
```

---

## Next Steps / Not Yet Implemented

- [ ] Authentication (JWT tokens)
- [ ] Multi-tenancy enforcement
- [ ] Audit logging for routes
- [ ] A/B testing framework
- [ ] Driver app (mobile)
- [ ] Customer notifications
- [ ] Advanced analytics dashboard
- [ ] Cost optimization (fuel, labor)

---

**Last Updated**: January 15, 2025  
**Status**: Production-Ready (Core features stable, monitoring live)
