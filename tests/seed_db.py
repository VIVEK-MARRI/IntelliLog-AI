"""Create SQLite schema and seed demo data for dev mode."""
import asyncio
import uuid
from datetime import datetime, timedelta, timezone
from src.api.auth import hash_password

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy import text


DEMO_TENANT_ID = "dev-tenant-id"

async def run():
    e = create_async_engine("sqlite+aiosqlite:///C:\\vivek\\IntelliLog-AI\\dev.db")
    s = AsyncSession(e)

    # Create all tables (SQLite-compatible)
    tables = """
    CREATE TABLE IF NOT EXISTS tenants (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        api_key_hash TEXT NOT NULL DEFAULT '',
        email TEXT UNIQUE,
        password_hash TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        is_active INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS drivers (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name TEXT,
        historical_on_time_rate REAL DEFAULT 0.85,
        total_deliveries INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        driver_id TEXT REFERENCES drivers(id) ON DELETE SET NULL,
        status TEXT DEFAULT 'pending',
        planned_stops INTEGER NOT NULL,
        completed_stops INTEGER DEFAULT 0,
        planned_eta TEXT NOT NULL,
        actual_eta TEXT,
        current_risk_score REAL DEFAULT 0.0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS gps_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT NOT NULL,
        order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        driver_id TEXT NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        speed_kmh REAL DEFAULT 0,
        heading_degrees REAL,
        event_type TEXT DEFAULT 'ping',
        recorded_at TEXT NOT NULL,
        sequence_number INTEGER
    );
    CREATE TABLE IF NOT EXISTS agent_decisions (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        decided_at TEXT DEFAULT CURRENT_TIMESTAMP,
        risk_score REAL NOT NULL,
        decision TEXT NOT NULL,
        reasoning TEXT NOT NULL DEFAULT '{}',
        tools_called TEXT DEFAULT '[]',
        outcome TEXT,
        model_version TEXT
    );
    CREATE TABLE IF NOT EXISTS route_plans (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        waypoints TEXT NOT NULL DEFAULT '[]',
        total_distance_km REAL,
        total_duration_minutes REAL,
        solver_status TEXT,
        solver_duration_ms INTEGER
    );
    CREATE TABLE IF NOT EXISTS predictions (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        risk_score REAL NOT NULL,
        is_high_risk INTEGER NOT NULL,
        confidence REAL NOT NULL,
        top_risk_factors TEXT NOT NULL DEFAULT '{}',
        predicted_delay_minutes REAL NOT NULL,
        model_version TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_drivers_tenant ON drivers(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_orders_tenant_status ON orders(tenant_id, status);
    CREATE INDEX IF NOT EXISTS idx_orders_driver ON orders(driver_id);
    CREATE INDEX IF NOT EXISTS idx_gps_order_time ON gps_events(order_id, recorded_at);
    CREATE INDEX IF NOT EXISTS idx_gps_tenant_time ON gps_events(tenant_id, recorded_at);
    CREATE INDEX IF NOT EXISTS idx_agent_order_time ON agent_decisions(order_id, decided_at);
    CREATE INDEX IF NOT EXISTS idx_agent_tenant_time ON agent_decisions(tenant_id, decided_at);
    CREATE INDEX IF NOT EXISTS idx_predictions_order_time ON predictions(order_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_predictions_tenant_time ON predictions(tenant_id, created_at);
    """
    for stmt in tables.strip().split(";"):
        stmt = stmt.strip()
        if stmt:
            await s.execute(text(stmt + ";"))
    await s.commit()

    # Seed tenant
    r = await s.execute(text("SELECT id FROM tenants WHERE id = :tid"), {"tid": DEMO_TENANT_ID})
    if not r.scalar():
        pw_hash = hash_password("admin")
        await s.execute(
            text("INSERT INTO tenants (id, name, email, password_hash, is_active) VALUES (:id, :name, :email, :pw, 1)"),
            {"id": DEMO_TENANT_ID, "name": "Demo Logistics Inc", "email": "admin@intelliglog.ai", "pw": pw_hash},
        )
        await s.commit()
        print("Tenant seeded")
    else:
        print("Tenant exists")

    # Seed drivers
    r = await s.execute(text("SELECT COUNT(*) FROM drivers WHERE tenant_id = :tid"), {"tid": DEMO_TENANT_ID})
    count = r.scalar()
    if count == 0:
        drivers_data = [
            (str(uuid.uuid4()), "Alice Chen", 0.92, 340),
            (str(uuid.uuid4()), "Bob Martinez", 0.88, 215),
            (str(uuid.uuid4()), "Carol Smith", 0.95, 502),
            (str(uuid.uuid4()), "Dave Wilson", 0.78, 128),
            (str(uuid.uuid4()), "Eve Johnson", 0.91, 275),
        ]
        for did, name, ontime, deliveries in drivers_data:
            await s.execute(
                text("INSERT INTO drivers (id, tenant_id, name, historical_on_time_rate, total_deliveries) VALUES (:id, :tid, :name, :otr, :del)"),
                {"id": did, "tid": DEMO_TENANT_ID, "name": name, "otr": ontime, "del": deliveries},
            )
        await s.commit()
        print(f"Seeded {len(drivers_data)} drivers")
    else:
        print(f"{count} drivers exist")

    # Seed orders
    r = await s.execute(text("SELECT COUNT(*) FROM orders WHERE tenant_id = :tid"), {"tid": DEMO_TENANT_ID})
    count = r.scalar()
    if count == 0:
        r = await s.execute(text("SELECT id FROM drivers WHERE tenant_id = :tid"), {"tid": DEMO_TENANT_ID})
        driver_ids = [row[0] for row in r.fetchall()]

        now = datetime.now(timezone.utc)
        order_defs = [
            ("pending", 4, 0, 0.1, now + timedelta(hours=2)),
            ("assigned", 5, 1, 0.25, now + timedelta(hours=3)),
            ("in_progress", 6, 3, 0.45, now + timedelta(hours=1)),
            ("in_progress", 3, 1, 0.72, now + timedelta(minutes=45)),
            ("completed", 4, 4, 0.05, now - timedelta(hours=1)),
            ("assigned", 7, 0, 0.15, now + timedelta(hours=5)),
            ("pending", 3, 0, 0.08, now + timedelta(hours=4)),
            ("in_progress", 5, 2, 0.55, now + timedelta(minutes=30)),
            ("completed", 4, 4, 0.02, now - timedelta(hours=3)),
            ("failed", 3, 1, 0.88, now - timedelta(hours=2)),
        ]
        for status, planned_stops, completed_stops, risk, eta in order_defs:
            driver_id = driver_ids[len(order_defs) % len(driver_ids)] if status != "pending" else None
            await s.execute(
                text("""INSERT INTO orders (id, tenant_id, driver_id, status, planned_stops, completed_stops, planned_eta, current_risk_score)
                    VALUES (:id, :tid, :did, :status, :ps, :cs, :eta, :risk)"""),
                {"id": str(uuid.uuid4()), "tid": DEMO_TENANT_ID, "did": driver_id,
                 "status": status, "ps": planned_stops, "cs": completed_stops,
                 "eta": eta.isoformat(), "risk": risk},
            )
        await s.commit()
        print(f"Seeded {len(order_defs)} orders")
    else:
        print(f"{count} orders exist")

    # Seed predictions for existing orders
    r = await s.execute(text("SELECT COUNT(*) FROM predictions WHERE tenant_id = :tid"), {"tid": DEMO_TENANT_ID})
    count = r.scalar()
    if count == 0:
        r = await s.execute(text("SELECT id, current_risk_score FROM orders WHERE tenant_id = :tid"), {"tid": DEMO_TENANT_ID})
        orders = r.fetchall()
        for oid, risk in orders:
            await s.execute(
                text("""INSERT INTO predictions (id, order_id, tenant_id, risk_score, is_high_risk, confidence, top_risk_factors, predicted_delay_minutes)
                    VALUES (:id, :oid, :tid, :risk, :high, :conf, :factors, :delay)"""),
                {"id": str(uuid.uuid4()), "oid": oid, "tid": DEMO_TENANT_ID,
                 "risk": risk, "high": 1 if risk > 0.7 else 0, "conf": 0.85 + (risk * 0.1),
                 "factors": '{"traffic": 0.4, "weather": 0.3, "driver_history": 0.2, "time_of_day": 0.1}',
                 "delay": risk * 45},
            )
        await s.commit()
        print(f"Seeded {len(orders)} predictions")
    else:
        print(f"{count} predictions exist")

    await s.close()
    await e.dispose()
    print("DB seed complete")


asyncio.run(run())
