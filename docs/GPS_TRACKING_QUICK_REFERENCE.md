# Real-Time GPS Tracking - Quick Reference Card

## API Endpoints

### Position Updates
```bash
# Submit driver position (10s interval)
POST /api/v1/driver/position
Content-Type: application/json
Authorization: Bearer {token}

{
  "driver_id": "driver-123",
  "latitude": 40.7128,
  "longitude": -74.0060,
  "speed_kmh": 25.5,
  "heading_degrees": 180.0,
  "timestamp": "2026-03-19T14:30:00Z",
  "accuracy_meters": 8.5
}

Response:
{
  "received": true,
  "deviation_detected": false,
  "reoptimize_triggered": false
}
```

### Nearby Drivers
```bash
# Find drivers within radius
GET /api/v1/driver/nearby?lat=40.7128&lon=-74.0060&radius_km=5
Authorization: Bearer {token}

Response:
{
  "drivers": [
    {
      "driver_id": "driver-456",
      "latitude": 40.7150,
      "longitude": -74.0040,
      "distance_km": 2.34,
      "last_seen_seconds_ago": 5,
      "status": "active"
    }
  ],
  "total_count": 1
}
```

### Driver Status
```bash
# Get driver current status
GET /api/v1/driver/status/driver-123
Authorization: Bearer {token}

Response:
{
  "driver_id": "driver-123",
  "latitude": 40.7128,
  "longitude": -74.0060,
  "speed_kmh": 25.5,
  "heading_degrees": 180.0,
  "timestamp": "2026-03-19T14:30:00Z",
  "on_route": true,
  "current_route": "route-456",
  "deviation_flag": false
}
```

### Batch Position Update
```bash
# Submit multiple positions (fleet optimization)
POST /api/v1/driver/position/batch
Content-Type: application/json
Authorization: Bearer {token}

[
  { "driver_id": "d1", "latitude": 40.7128, ... },
  { "driver_id": "d2", "latitude": 40.7150, ... }
]

Response:
{
  "results": [
    { "driver_id": "d1", "received": true },
    { "driver_id": "d2", "received": true }
  ],
  "total": 2,
  "successful": 2
}
```

## WebSocket

### Connect
```javascript
const ws = new WebSocket('ws://localhost:8000/ws/dispatch/tenant-1');

// Receive state snapshot on connect
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.type === 'state_snapshot') {
    console.log('Active drivers:', msg.drivers);
  }
};
```

### Listen for Updates
```javascript
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  
  switch(msg.type) {
    case 'position_update':
      updateDriverMarker(msg.driver_id, msg.latitude, msg.longitude);
      break;
    case 'deviation_alert':
      showAlert(`Driver ${msg.driver_id} is off route by ${msg.perpendicular_distance_m}m`);
      break;
    case 'reoptimize_triggered':
      showToast(`Re-routing triggered for routes: ${msg.affected_routes}`);
      break;
    case 'driver_arrived':
      markOrderComplete(msg.driver_id, msg.route_id);
      break;
  }
};
```

## React Native

### Import & Initialize
```typescript
import DriverLocationService from './services/DriverLocationService';

const service = new DriverLocationService({
  api_base_url: 'https://api.example.com/api/v1',
  update_interval_seconds: 10,
  background_task_enabled: true,
  battery_optimization_enabled: true,
  jwt_token: userToken
});
```

### Start Tracking
```typescript
await service.startTracking(
  'driver-123',
  (status) => {
    // status: tracking, on_route, deviated, offline, error
    setDriverStatus(status);
  },
  (deviation) => {
    // Handle deviation alert
    Alert.alert('Deviation Detected', 
      `You are ${deviation.perpendicular_distance_m}m off route`);
  }
);
```

### Sync Offline Data
```typescript
const synced = await service.syncCachedPositions();
console.log(`Synced ${synced} positions`);
```

## Redis Keys

```bash
# Spatial index of active drivers
positions:tenant-1              # ZSET with GEO encoding

# Latest position (120s TTL)
driver:driver-123:position      # HASH {lat, lon, speed, ...}

# Deviation tracking (600s TTL)
driver:driver-123:deviation_count  # INT (consecutive off-route)
driver:driver-123:deviation     # STRING flag (300s TTL)

# Routing
driver:driver-123:current_route # STRING route-id (86400s TTL)
route:route-456:geometry        # JSON linestring (86400s TTL)

# Pub/Sub channel
position_updates:tenant-1       # Broadcast channel
```

## Error Codes

| Code | Meaning |
|------|---------|
| 400 | Invalid coordinates or timestamp |
| 401 | JWT token invalid/expired |
| 404 | Driver not found or offline |
| 429 | Rate limit exceeded |
| 500 | Server error (Redis unavailable) |

## Thresholds

| Setting | Value | Configurable |
|---------|-------|--------------|
| Deviation threshold | 400m | Yes (.env) |
| Recovery threshold | 200m | Yes (.env) |
| Consecutive trigger | 3 readings | Yes (.env) |
| Position TTL | 120s | Yes (code) |
| Counter timeout | 600s | Yes (code) |
| Timestamp window | ±30s | Yes (code) |
| Update interval | 10s | Yes (config) |

## Coordinates Format

- **Latitude**: -90 (South Pole) to +90 (North Pole)
- **Longitude**: -180 (West) to +180 (East)
- **Speed**: km/h (non-negative)
- **Heading**: 0-360 degrees (0=North, 90=East, 180=South, 270=West)

## Common Workflows

### 1. Initialize Driver Tracking (React Native)
```typescript
// At app startup
const initTracking = async () => {
  const token = await getJWTToken();
  const service = new DriverLocationService({
    api_base_url: API_BASE_URL,
    jwt_token: token,
    update_interval_seconds: 10,
    background_task_enabled: true
  });
  
  await service.startTracking(
    driverId,
    onStatusChange,
    onDeviation
  );
};
```

### 2. Display Live Drivers (Dispatcher Frontend)
```typescript
// React component
const [drivers, setDrivers] = useState([]);

useEffect(() => {
  const ws = new WebSocket(`${WS_URL}/ws/dispatch/${tenantId}`);
  
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'position_update') {
      setDrivers(prev => 
        prev.map(d => d.driver_id === msg.driver_id 
          ? {...d, latitude: msg.latitude, longitude: msg.longitude}
          : d
        )
      );
    }
  };
  
  return () => ws.close();
}, []);

return (
  <Map>
    {drivers.map(d => 
      <Marker 
        key={d.driver_id}
        position={[d.latitude, d.longitude]}
        color={d.on_route ? 'green' : 'red'}
      />
    )}
  </Map>
);
```

### 3. Query Nearby Fleet
```bash
# Find drivers within 5km of warehouse
curl "https://api.example.com/api/v1/driver/nearby?lat=40.7128&lon=-74.0060&radius_km=5" \
  -H "Authorization: Bearer ${TOKEN}"
```

### 4. Handle Deviation Alert
```typescript
// Mobile app
service.onDeviation = (deviation) => {
  // deviation = {
  //   perpendicular_distance_m: 425,
  //   consecutive_count: 3,
  //   timestamp: "2026-03-19T14:30:00Z"
  // }
  
  showAlert(
    'Route Deviation',
    `You are ${Math.round(deviation.perpendicular_distance_m)}m off your route.\n` +
    'Navigation will be recalculated.'
  );
  playSound('deviation.mp3'); // Alert sound
};
```

## Performance Tips

1. **Update Interval**: 10s is good balance. <5s = battery drain, >30s = jittery updates
2. **Radius Queries**: Stay <10km for performant GEORADIUS
3. **Batch Updates**: Use /position/batch for 20+ drivers vs individual posts
4. **Offline**: Enable background tracking, automatic cache + sync
5. **Memory**: 10,000 drivers = ~13MB Redis, manageable

## Debugging

### Check Redis Geo
```bash
redis-cli
> GEORADIUS positions:tenant-1 -74.006 40.713 5 km withcoord withdist
> HGETALL driver:driver-123:position
> GET driver:driver-123:deviation_count
```

### Monitor WebSocket
```javascript
ws.onopen = () => console.log('WebSocket connected');
ws.onerror = (e) => console.error('WebSocket error:', e);
ws.onclose = () => console.log('WebSocket closed');
ws.onmessage = (e) => console.log('Message:', JSON.parse(e.data));
```

### Trace Position Updates
```typescript
service.onStatusChange = (status) => {
  console.log(`[GPS] Status: ${status}`);
  // Track state transitions: idle → tracking → on_route → deviated → reoptimizing
};
```

---

**Last Updated**: March 19, 2026  
**For Full API Docs**: See GPS_TRACKING_SYSTEM.md  
**For Integration Guide**: See GPS_TRACKING_INTEGRATION_GUIDE.md
