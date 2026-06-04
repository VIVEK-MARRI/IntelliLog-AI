"""
Unified seed — writes matching UUIDs to both PostgreSQL and Redis.
Ensures order IDs are identical across both stores.
"""
import asyncio, hashlib, json, uuid
from datetime import datetime, timedelta, timezone

import asyncpg
import redis.asyncio as redis

DATABASE_URL = "postgresql://postgres:admin@localhost:5432/intelliglog"
REDIS_URL = "redis://localhost:6379/0"
TENANT_ID = "11111111-1111-1111-1111-111111111111"

WAREHOUSES = [
    {"id": "22222222-2222-2222-2222-222222222222", "name": "NYC Manhattan Hub", "lat": 40.7580, "lng": -73.9855},
    {"id": "33333333-3333-3333-3333-333333333333", "name": "Brooklyn Distribution Center", "lat": 40.6782, "lng": -73.9442},
    {"id": "44444444-4444-4444-4444-444444444444", "name": "Newark Logistics Terminal", "lat": 40.7357, "lng": -74.1724},
]

DRIVERS = [
    ("a0000001-0000-0000-0000-000000000001", "Alice Chen", 0.95),
    ("a0000001-0000-0000-0000-000000000002", "Bob Martinez", 0.88),
    ("a0000001-0000-0000-0000-000000000003", "Carol Smith", 0.92),
    ("a0000001-0000-0000-0000-000000000004", "David Kim", 0.78),
    ("a0000001-0000-0000-0000-000000000005", "Elena Garcia", 0.96),
    ("a0000001-0000-0000-0000-000000000006", "Frank Wilson", 0.84),
    ("a0000001-0000-0000-0000-000000000007", "Grace Lee", 0.91),
    ("a0000001-0000-0000-0000-000000000008", "Henry Brown", 0.75),
    ("a0000001-0000-0000-0000-000000000009", "Iris Davis", 0.89),
    ("a0000001-0000-0000-0000-000000000010", "Jack Taylor", 0.82),
    ("a0000001-0000-0000-0000-000000000011", "Karen Johnson", 0.93),
    ("a0000001-0000-0000-0000-000000000012", "Leo Anderson", 0.79),
    ("a0000001-0000-0000-0000-000000000013", "Mia Thomas", 0.87),
    ("a0000001-0000-0000-0000-000000000014", "Noah Jackson", 0.72),
    ("a0000001-0000-0000-0000-000000000015", "Olivia White", 0.94),
]

STOPS_TEMPLATES = [
    [
        {"address": "350 5th Ave, NY", "lat": 40.7484, "lng": -73.9857},
        {"address": "30 Rockefeller Plaza, NY", "lat": 40.7587, "lng": -73.9787},
    ],
    [
        {"address": "1 Liberty Plaza, NY", "lat": 40.7094, "lng": -74.0126},
        {"address": "200 Broadway, NY", "lat": 40.7104, "lng": -74.0074},
        {"address": "55 Water St, NY", "lat": 40.7033, "lng": -74.0093},
    ],
    [
        {"address": "123 Atlantic Ave, Brooklyn", "lat": 40.6851, "lng": -73.9760},
        {"address": "456 Fulton St, Brooklyn", "lat": 40.6911, "lng": -73.9791},
    ],
    [
        {"address": "1 World Trade Center, NY", "lat": 40.7127, "lng": -74.0134},
        {"address": "75-20 Astoria Blvd, Queens", "lat": 40.7715, "lng": -73.8892},
        {"address": "161st St, Bronx", "lat": 40.8307, "lng": -73.9263},
        {"address": "200 Eastern Pkwy, Brooklyn", "lat": 40.6722, "lng": -73.9646},
    ],
    [
        {"address": "742 Broadway, NY", "lat": 40.7300, "lng": -73.9927},
        {"address": "11 Times Sq, NY", "lat": 40.7558, "lng": -73.9869},
    ],
]

# Deterministic UUIDs for orders based on index
def order_uuid(i):
    return str(uuid.UUID(hashlib.md5(f"order-{i}".encode()).hexdigest()))

# Deterministic stop_id based on order index and stop index
def stop_uuid(order_idx, stop_idx):
    return str(uuid.UUID(hashlib.md5(f"stop-{order_idx}-{stop_idx}".encode()).hexdigest()))

risk_scores = [0.15, 0.22, 0.35, 0.45, 0.55, 0.65, 0.78, 0.88, 0.95]
statuses = ["in_progress", "in_progress", "in_progress", "in_progress", "in_progress",
            "pending", "pending", "pending", "pending", "pending"]

async def seed():
    pg = await asyncpg.connect(DATABASE_URL)
    r = await redis.from_url(REDIS_URL, decode_responses=True)

    # Flush Redis
    await r.flushdb()
    print('[FLUSH] Redis cleared')

    # Clear PostgreSQL
    for table in ['predictions', 'route_plans', 'agent_decisions', 'gps_events', 'orders', 'drivers', 'tenants']:
        await pg.execute(f'DELETE FROM "{table}"')
    print('[CLEAR] PostgreSQL tables cleared')

    # Tenant
    api_key_hash = hashlib.sha256(TENANT_ID.encode()).hexdigest()
    await pg.execute("""
        INSERT INTO tenants (id, name, api_key_hash, is_active)
        VALUES ($1, 'Default Tenant', $2, TRUE)
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
    """, TENANT_ID, api_key_hash)
    print(f'[TENANT] {TENANT_ID}')

    # Warehouses → Redis only
    for wh in WAREHOUSES:
        await r.hset(f"warehouse:{wh['id']}", mapping={
            "id": wh["id"], "name": wh["name"], "lat": str(wh["lat"]), "lng": str(wh["lng"]),
        })

    # Drivers → both
    for i, (did, dname, otr) in enumerate(DRIVERS):
        wh = WAREHOUSES[i % len(WAREHOUSES)]
        await pg.execute("""
            INSERT INTO drivers (id, tenant_id, name, historical_on_time_rate, total_deliveries)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (tenant_id, id) DO UPDATE
            SET name = EXCLUDED.name, historical_on_time_rate = EXCLUDED.historical_on_time_rate
        """, did, TENANT_ID, dname, otr, 50 + i * 10)
        await r.hset(f"driver:{did}", mapping={
            "id": did, "name": dname, "tenant_id": TENANT_ID,
            "on_time_rate": str(otr), "status": "available",
            "vehicle_id": f"v{i+1:07d}-0000-0000-0000-000000000000",
            "lat": str(wh["lat"]), "lng": str(wh["lng"]),
        })

    print(f'[DRIVERS] {len(DRIVERS)} seeded')

    # Orders → both, MATCHING UUIDs
    for i in range(50):
        oid = order_uuid(i)
        did = DRIVERS[i % len(DRIVERS)][0]
        rscore = risk_scores[i % len(risk_scores)]
        status = statuses[i % len(statuses)]
        template = STOPS_TEMPLATES[i % len(STOPS_TEMPLATES)]
        stops = [
            {"stop_id": stop_uuid(i, si), "address": s["address"], "lat": s["lat"], "lng": s["lng"], "sequence": si}
            for si, s in enumerate(template)
        ]
        planned_stops = len(stops)
        planned_eta = datetime.now(timezone.utc) + timedelta(hours=2 + i)

        # PostgreSQL
        await pg.execute("""
            INSERT INTO orders (id, tenant_id, driver_id, status, planned_stops, completed_stops,
                                planned_eta, current_risk_score)
            VALUES ($1, $2, $3, $4, $5, 0, $6, $7)
            ON CONFLICT (tenant_id, id) DO UPDATE
            SET status = EXCLUDED.status, current_risk_score = EXCLUDED.current_risk_score
        """, oid, TENANT_ID, did, status, planned_stops, planned_eta, rscore)

        # Redis (SAME order_id, with stops for route optimization)
        await r.hset(f"order:{oid}", mapping={
            "order_id": oid,
            "driver_id": did,
            "tenant_id": TENANT_ID,
            "status": status,
            "risk_score": str(rscore),
            "latitude": str(template[0]["lat"]),
            "longitude": str(template[0]["lng"]),
            "speed": str(15.0 + (i % 5) * 8.0),
            "planned_stops": str(planned_stops),
            "completed_stops": "0",
            "stops": json.dumps(stops),
            "planned_eta": planned_eta.isoformat(),
            "eta_minutes_remaining": str(20 + planned_stops * 8),
            "stops_remaining": str(planned_stops),
            "driver_on_time_rate": str(DRIVERS[i % len(DRIVERS)][2]),
        })

        if i % 10 == 9:
            print(f'[ORDERS] {i+1}/50')

    # Publish initial state
    await r.publish(f"tenant:{TENANT_ID}:events", json.dumps({
        "type": "initial_state", "tenant_id": TENANT_ID,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }))

    await pg.close()
    await r.aclose()
    print(f'\n[DONE] 1 tenant, {len(WAREHOUSES)} warehouses, {len(DRIVERS)} drivers, 50 orders with matching UUIDs')

asyncio.run(seed())
