"""Seed the PostgreSQL database for Docker after Alembic has created the schema.

IMPORTANT: This script assumes `alembic upgrade head` has already run.
It only INSERTs/UPSERTs data — it never creates tables.
The docker-compose.yml backend command runs:
    alembic upgrade head && python scripts/docker_seed.py && uvicorn ...

Tenant ID: "dev-tenant-id" (TEXT slug — matches SKIP_EXTERNAL_STARTUP_CHECKS
dev-bypass in src/api/auth.py).  The Alembic schema uses TEXT for all ID
columns, so this slug is valid.
"""
import asyncio
import hashlib
import os
import random
import uuid
from datetime import datetime, timedelta

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

DB_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://intelliglog:dev-password@localhost:5432/intelliglog",
)

# Dev tenant — TEXT slug, matches auth.py dev-mode bypass
DEV_TENANT_ID = "dev-tenant-id"


def _demo_order_ids() -> list[str]:
    """All order IDs matching frontend demoScenarios.ts createOrder calls."""
    ids: list[str] = []
    for i in range(1, 16):
        ids.append(f"DEMO-normal-{i:03d}")
    for i in range(1, 13):
        ids.append(f"DEMO-incident-{i:03d}")
    for i in range(1, 16):
        ids.append(f"DEMO-peak-{i:03d}")
    for i in range(1, 11):
        ids.append(f"DEMO-wthr-{i:03d}")
    for i in range(1, 13):
        ids.append(f"DEMO-trfc-{i:03d}")
    for i in range(1, 13):
        ids.append(f"DEMO-exec-{i:03d}")
    return ids


DEMO_ORDER_IDS = _demo_order_ids()

DEMO_DRIVER_IDS = [
    "DRIVER-A-001",
    "DRIVER-B-002",
    "DRIVER-C-003",
    "DRIVER-D-004",
    "DRIVER-E-005",
]


async def seed() -> None:
    engine = create_async_engine(DB_URL)

    async with engine.begin() as conn:
        # ------------------------------------------------------------------ #
        # Tenant — upsert so re-runs are idempotent                           #
        # ------------------------------------------------------------------ #
        ah = hashlib.sha256(b"dev-api-key-12345").hexdigest()
        await conn.execute(
            text(
                """
                INSERT INTO tenants (id, name, api_key_hash, is_active)
                VALUES (:id, :n, :h, TRUE)
                ON CONFLICT (id) DO NOTHING
                """
            ),
            {"id": DEV_TENANT_ID, "n": "Default Tenant", "h": ah},
        )

        # ------------------------------------------------------------------ #
        # Drivers — upsert                                                     #
        # ------------------------------------------------------------------ #
        for d in DEMO_DRIVER_IDS:
            await conn.execute(
                text(
                    """
                    INSERT INTO drivers (id, tenant_id, name, historical_on_time_rate, total_deliveries)
                    VALUES (:id, :tid, :n, :r, :del)
                    ON CONFLICT (id, tenant_id) DO NOTHING
                    """
                ),
                {
                    "id": d,
                    "tid": DEV_TENANT_ID,
                    "n": f"Driver {d}",
                    "r": round(random.uniform(0.7, 0.98), 2),
                    "del": random.randint(10, 200),
                },
            )

        # ------------------------------------------------------------------ #
        # Orders — only insert missing ones (idempotent)                       #
        # ------------------------------------------------------------------ #
        existing_rows = await conn.execute(
            text("SELECT id FROM orders WHERE tenant_id = :tid"),
            {"tid": DEV_TENANT_ID},
        )
        existing_orders: set[str] = {row[0] for row in existing_rows}

        seeded = 0
        for o in DEMO_ORDER_IDS:
            if o in existing_orders:
                continue

            d = random.choice(DEMO_DRIVER_IDS)
            s = random.choice(["pending", "in_progress", "assigned", "completed"])
            st = random.randint(3, 8)
            risk = round(random.uniform(0, 1), 4)
            eta = datetime.utcnow() + timedelta(hours=random.randint(1, 48))

            await conn.execute(
                text(
                    """
                    INSERT INTO orders
                        (id, tenant_id, driver_id, status, planned_stops,
                         completed_stops, planned_eta, current_risk_score)
                    VALUES
                        (:id, :tid, :did, :s, :st, :co, :eta, :r)
                    ON CONFLICT (id, tenant_id) DO NOTHING
                    """
                ),
                {
                    "id": o,
                    "tid": DEV_TENANT_ID,
                    "did": d,
                    "s": s,
                    "st": st,
                    "co": random.randint(0, st),
                    "eta": eta,
                    "r": risk,
                },
            )

            # route_plan for this order
            rpid = str(uuid.uuid4())
            await conn.execute(
                text(
                    """
                    INSERT INTO route_plans
                        (id, order_id, tenant_id, waypoints,
                         total_distance_km, total_duration_minutes, solver_status)
                    VALUES (:id, :oid, :tid, :w, :dist, :dur, :status)
                    ON CONFLICT (id, tenant_id) DO NOTHING
                    """
                ),
                {
                    "id": rpid,
                    "oid": o,
                    "tid": DEV_TENANT_ID,
                    "w": "[]",
                    "dist": round(random.uniform(5, 50), 1),
                    "dur": round(random.uniform(15, 120), 1),
                    "status": "solved",
                },
            )

            # prediction for this order
            prid = str(uuid.uuid4())
            factors = random.choice(
                [
                    '[{"feature":"traffic_congestion"},{"feature":"weather_delay"},{"feature":"driver_availability"}]',
                    '[{"feature":"mechanical_issue"},{"feature":"route_deviation"},{"feature":"fuel_stop"}]',
                    '[{"feature":"loading_delay"},{"feature":"traffic_congestion"},{"feature":"paperwork_issue"}]',
                    '[{"feature":"address_error"},{"feature":"customer_not_available"},{"feature":"traffic_congestion"}]',
                    '[{"feature":"weather_delay"},{"feature":"road_closure"},{"feature":"detour_required"}]',
                ]
            )
            await conn.execute(
                text(
                    """
                    INSERT INTO predictions
                        (id, order_id, tenant_id, risk_score, is_high_risk,
                         confidence, top_risk_factors, predicted_delay_minutes, model_version)
                    VALUES (:id, :oid, :tid, :r, :high, :conf, :factors, :delay, :mv)
                    ON CONFLICT (id) DO NOTHING
                    """
                ),
                {
                    "id": prid,
                    "oid": o,
                    "tid": DEV_TENANT_ID,
                    "r": risk,
                    "high": risk > 0.7,
                    "conf": round(random.uniform(0.7, 0.99), 2),
                    "factors": factors,
                    "delay": round(random.uniform(0, 30), 1),
                    "mv": "1.0.0",
                },
            )

            # agent_decision for this order
            adid = str(uuid.uuid4())
            await conn.execute(
                text(
                    """
                    INSERT INTO agent_decisions
                        (id, order_id, tenant_id, risk_score, decision,
                         reasoning, tools_called, outcome, model_version)
                    VALUES (:id, :oid, :tid, :r, :dec, :rea, :tools, :out, :mv)
                    ON CONFLICT (id) DO NOTHING
                    """
                ),
                {
                    "id": adid,
                    "oid": o,
                    "tid": DEV_TENANT_ID,
                    "r": risk,
                    "dec": random.choice(["no_action", "alert", "monitor", "notify"]),
                    "rea": "{}",
                    "tools": "[]",
                    "out": "success",
                    "mv": "1.0.0",
                },
            )

            seeded += 1

        print(
            f"Seed complete: tenant={DEV_TENANT_ID!r}, drivers={len(DEMO_DRIVER_IDS)}, "
            f"orders seeded={seeded} new "
            f"(total {len(existing_orders) + seeded}/{len(DEMO_ORDER_IDS)} configured)"
        )

    await engine.dispose()


asyncio.run(seed())
