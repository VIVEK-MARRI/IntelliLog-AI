"""Run ONCE to seed the PostgreSQL database for Docker."""
import asyncio, os, random
from datetime import datetime, timedelta

DB_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://intelliglog:dev-password@localhost:5432/intelliglog")

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, api_key_hash TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, is_active BOOLEAN DEFAULT TRUE
);
CREATE TABLE IF NOT EXISTS drivers (
    id TEXT NOT NULL, tenant_id TEXT NOT NULL,
    name TEXT, historical_on_time_rate DOUBLE PRECISION DEFAULT 0.85, total_deliveries INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (id, tenant_id)
);
CREATE TABLE IF NOT EXISTS orders (
    id TEXT NOT NULL, tenant_id TEXT NOT NULL,
    driver_id TEXT, status TEXT DEFAULT 'pending',
    planned_stops INTEGER NOT NULL, completed_stops INTEGER DEFAULT 0,
    planned_eta TIMESTAMP NOT NULL, actual_eta TIMESTAMP, current_risk_score DOUBLE PRECISION DEFAULT 0.0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id, tenant_id)
);
CREATE TABLE IF NOT EXISTS gps_events (
    id SERIAL PRIMARY KEY, tenant_id TEXT NOT NULL, order_id TEXT NOT NULL,
    driver_id TEXT NOT NULL, latitude DOUBLE PRECISION NOT NULL, longitude DOUBLE PRECISION NOT NULL,
    speed_kmh DOUBLE PRECISION DEFAULT 0, heading_degrees DOUBLE PRECISION, event_type TEXT DEFAULT 'ping',
    recorded_at TIMESTAMP NOT NULL, sequence_number INTEGER
);
CREATE TABLE IF NOT EXISTS agent_decisions (
    id TEXT PRIMARY KEY, order_id TEXT NOT NULL, tenant_id TEXT NOT NULL,
    decided_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, risk_score DOUBLE PRECISION NOT NULL,
    decision TEXT NOT NULL, reasoning TEXT DEFAULT '{}', tools_called TEXT DEFAULT '[]',
    outcome TEXT, model_version TEXT
);
CREATE TABLE IF NOT EXISTS route_plans (
    id TEXT NOT NULL, order_id TEXT NOT NULL, tenant_id TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, waypoints TEXT NOT NULL DEFAULT '[]',
    total_distance_km DOUBLE PRECISION, total_duration_minutes DOUBLE PRECISION,
    solver_status TEXT, solver_duration_ms INTEGER,
    PRIMARY KEY (id, tenant_id)
);
CREATE TABLE IF NOT EXISTS predictions (
    id TEXT PRIMARY KEY, order_id TEXT NOT NULL, tenant_id TEXT NOT NULL,
    risk_score DOUBLE PRECISION NOT NULL, is_high_risk BOOLEAN NOT NULL, confidence DOUBLE PRECISION NOT NULL,
    top_risk_factors TEXT DEFAULT '[]', predicted_delay_minutes DOUBLE PRECISION NOT NULL,
    model_version TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
"""

def _demo_order_ids():
    """All order IDs matching frontend demoScenarios.ts createOrder calls."""
    ids = []
    for i in range(1, 16):   ids.append(f"DEMO-normal-{i:03d}")
    for i in range(1, 13):   ids.append(f"DEMO-incident-{i:03d}")
    for i in range(1, 16):   ids.append(f"DEMO-peak-{i:03d}")
    for i in range(1, 11):   ids.append(f"DEMO-wthr-{i:03d}")
    for i in range(1, 13):   ids.append(f"DEMO-trfc-{i:03d}")
    for i in range(1, 13):   ids.append(f"DEMO-exec-{i:03d}")
    return ids

DEMO_ORDER_IDS = _demo_order_ids()

DEMO_DRIVER_IDS = [
    "DRIVER-A-001", "DRIVER-B-002", "DRIVER-C-003",
    "DRIVER-D-004", "DRIVER-E-005",
]

async def seed():
    import hashlib, uuid
    from sqlalchemy.ext.asyncio import create_async_engine
    from sqlalchemy import text
    engine = create_async_engine(DB_URL)
    for stmt in SCHEMA_SQL.split(";"):
        s = stmt.strip()
        if s:
            try:
                async with engine.begin() as conn:
                    await conn.execute(text(s))
            except Exception as e:
                pass
    async with engine.begin() as conn:
        r = await conn.execute(text("SELECT COUNT(*) FROM tenants"))
        if r.scalar() == 0:
            tid = "dev-tenant-id"
            ah = hashlib.sha256(b"dev-api-key-12345").hexdigest()
            await conn.execute(
                text("INSERT INTO tenants (id, name, api_key_hash, is_active) VALUES (:id, :n, :h, TRUE)"),
                {"id": tid, "n": "Default Tenant", "h": ah}
            )
            for d in DEMO_DRIVER_IDS:
                await conn.execute(
                    text("INSERT INTO drivers (id, tenant_id, name, historical_on_time_rate, total_deliveries) VALUES (:id, :tid, :n, :r, :del)"),
                    {"id": d, "tid": tid, "n": f"Driver {d}", "r": round(random.uniform(0.7, 0.98), 2), "del": random.randint(10, 200)}
                )
            print(f"Initial seed: 1 tenant, {len(DEMO_DRIVER_IDS)} drivers")
        else:
            print("Tenant already exists — upserting missing demo orders")

        tid = "dev-tenant-id"

        # Upsert drivers (idempotent)
        for d in DEMO_DRIVER_IDS:
            await conn.execute(
                text("INSERT INTO drivers (id, tenant_id, name, historical_on_time_rate, total_deliveries) VALUES (:id, :tid, :n, :r, :del) ON CONFLICT (id, tenant_id) DO NOTHING"),
                {"id": d, "tid": tid, "n": f"Driver {d}", "r": round(random.uniform(0.7, 0.98), 2), "del": random.randint(10, 200)}
            )

        # Upsert orders (idempotent per id + tenant_id)
        existing_orders = set()
        for row in await conn.execute(text("SELECT id FROM orders WHERE tenant_id = :tid"), {"tid": tid}):
            existing_orders.add(row[0])

        seeded = 0
        for o in DEMO_ORDER_IDS:
            if o in existing_orders:
                continue
            d = random.choice(DEMO_DRIVER_IDS)
            s = random.choice(["pending", "in_progress", "assigned", "completed"])
            st = random.randint(3, 8)
            risk = round(random.uniform(0, 1), 4)
            await conn.execute(
                text("INSERT INTO orders (id, tenant_id, driver_id, status, planned_stops, completed_stops, planned_eta, current_risk_score) VALUES (:id, :tid, :did, :s, :st, :co, :eta, :r)"),
                {"id": o, "tid": tid, "did": d, "s": s, "st": st, "co": random.randint(0, st), "eta": datetime.utcnow() + timedelta(hours=random.randint(1, 48)), "r": risk}
            )
            rpid = str(uuid.uuid4())
            await conn.execute(
                text("INSERT INTO route_plans (id, order_id, tenant_id, waypoints, total_distance_km, total_duration_minutes, solver_status) VALUES (:id, :oid, :tid, :w, :dist, :dur, :status)"),
                {"id": rpid, "oid": o, "tid": tid, "w": "[]", "dist": round(random.uniform(5, 50), 1), "dur": round(random.uniform(15, 120), 1), "status": "solved"}
            )
            prid = str(uuid.uuid4())
            factors = random.choice([
                '[{"feature":"traffic_congestion"},{"feature":"weather_delay"},{"feature":"driver_availability"}]',
                '[{"feature":"mechanical_issue"},{"feature":"route_deviation"},{"feature":"fuel_stop"}]',
                '[{"feature":"loading_delay"},{"feature":"traffic_congestion"},{"feature":"paperwork_issue"}]',
                '[{"feature":"address_error"},{"feature":"customer_not_available"},{"feature":"traffic_congestion"}]',
                '[{"feature":"weather_delay"},{"feature":"road_closure"},{"feature":"detour_required"}]',
            ])
            await conn.execute(
                text("INSERT INTO predictions (id, order_id, tenant_id, risk_score, is_high_risk, confidence, top_risk_factors, predicted_delay_minutes, model_version) VALUES (:id, :oid, :tid, :r, :high, :conf, :factors, :delay, :mv)"),
                {"id": prid, "oid": o, "tid": tid, "r": risk, "high": risk > 0.7, "conf": round(random.uniform(0.7, 0.99), 2), "factors": factors, "delay": round(random.uniform(0, 30), 1), "mv": "1.0.0"}
            )
            adid = str(uuid.uuid4())
            await conn.execute(
                text("INSERT INTO agent_decisions (id, order_id, tenant_id, risk_score, decision, reasoning, tools_called, outcome, model_version) VALUES (:id, :oid, :tid, :r, :dec, :rea, :tools, :out, :mv)"),
                {"id": adid, "oid": o, "tid": tid, "r": risk, "dec": random.choice(["no_action", "alert", "monitor", "notify"]), "rea": "{}", "tools": "[]", "out": "success", "mv": "1.0.0"}
            )
            seeded += 1

        print(f"Seeded orders: {seeded} new (total {len(existing_orders) + seeded} of {len(DEMO_ORDER_IDS)} configured)")
    await engine.dispose()

asyncio.run(seed())
