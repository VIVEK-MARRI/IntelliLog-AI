"""
Production seed data for IntelliLog-AI demo.

Creates:
- 1 tenant (default)
- 3 warehouses with real geographic coordinates (NYC area)
- 15 drivers
- 10 vehicles
- 50 orders with varied risk profiles
- Publishes initial state to Redis
"""

import asyncio
import hashlib
import json
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import redis.asyncio as redis

# Configuration
REDIS_URL = "redis://localhost:6379/0"
TENANT_ID = "11111111-1111-1111-1111-111111111111"

WAREHOUSES = [
    {"id": "22222222-2222-2222-2222-222222222222", "name": "NYC Manhattan Hub", "lat": 40.7580, "lng": -73.9855},
    {"id": "33333333-3333-3333-3333-333333333333", "name": "Brooklyn Distribution Center", "lat": 40.6782, "lng": -73.9442},
    {"id": "44444444-4444-4444-4444-444444444444", "name": "Newark Logistics Terminal", "lat": 40.7357, "lng": -74.1724},
]

DRIVERS = [
    {"id": "a0000001-0000-0000-0000-000000000001", "name": "Alice Chen", "on_time_rate": 0.95, "vehicle_id": "v0000001-0000-0000-0000-000000000001"},
    {"id": "a0000001-0000-0000-0000-000000000002", "name": "Bob Martinez", "on_time_rate": 0.88, "vehicle_id": "v0000001-0000-0000-0000-000000000002"},
    {"id": "a0000001-0000-0000-0000-000000000003", "name": "Carol Smith", "on_time_rate": 0.92, "vehicle_id": "v0000001-0000-0000-0000-000000000003"},
    {"id": "a0000001-0000-0000-0000-000000000004", "name": "David Kim", "on_time_rate": 0.78, "vehicle_id": "v0000001-0000-0000-0000-000000000004"},
    {"id": "a0000001-0000-0000-0000-000000000005", "name": "Elena Garcia", "on_time_rate": 0.96, "vehicle_id": "v0000001-0000-0000-0000-000000000005"},
    {"id": "a0000001-0000-0000-0000-000000000006", "name": "Frank Wilson", "on_time_rate": 0.84, "vehicle_id": "v0000001-0000-0000-0000-000000000006"},
    {"id": "a0000001-0000-0000-0000-000000000007", "name": "Grace Lee", "on_time_rate": 0.91, "vehicle_id": "v0000001-0000-0000-0000-000000000007"},
    {"id": "a0000001-0000-0000-0000-000000000008", "name": "Henry Brown", "on_time_rate": 0.75, "vehicle_id": "v0000001-0000-0000-0000-000000000008"},
    {"id": "a0000001-0000-0000-0000-000000000009", "name": "Iris Davis", "on_time_rate": 0.89, "vehicle_id": "v0000001-0000-0000-0000-000000000009"},
    {"id": "a0000001-0000-0000-0000-000000000010", "name": "Jack Taylor", "on_time_rate": 0.82, "vehicle_id": "v0000001-0000-0000-0000-000000000010"},
    {"id": "a0000001-0000-0000-0000-000000000011", "name": "Karen Johnson", "on_time_rate": 0.93, "vehicle_id": "v0000001-0000-0000-0000-000000000011"},
    {"id": "a0000001-0000-0000-0000-000000000012", "name": "Leo Anderson", "on_time_rate": 0.79, "vehicle_id": "v0000001-0000-0000-0000-000000000012"},
    {"id": "a0000001-0000-0000-0000-000000000013", "name": "Mia Thomas", "on_time_rate": 0.87, "vehicle_id": "v0000001-0000-0000-0000-000000000013"},
    {"id": "a0000001-0000-0000-0000-000000000014", "name": "Noah Jackson", "on_time_rate": 0.72, "vehicle_id": "v0000001-0000-0000-0000-000000000014"},
    {"id": "a0000001-0000-0000-0000-000000000015", "name": "Olivia White", "on_time_rate": 0.94, "vehicle_id": "v0000001-0000-0000-0000-000000000015"},
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


def _make_stops(seed: int) -> list[dict[str, Any]]:
    template = STOPS_TEMPLATES[seed % len(STOPS_TEMPLATES)]
    return [
        {"stop_id": str(uuid.uuid4()), "address": s["address"], "lat": s["lat"], "lng": s["lng"], "sequence": i}
        for i, s in enumerate(template)
    ]


def _calc_eta(stops_count: int) -> str:
    mins = 15 + stops_count * 12
    return (datetime.now(timezone.utc) + timedelta(minutes=mins)).isoformat()


async def seed() -> None:
    client = redis.from_url(REDIS_URL, decode_responses=True)
    now = datetime.now(timezone.utc)

    # Seed warehouses
    for wh in WAREHOUSES:
        await client.hset(f"warehouse:{wh['id']}", mapping={
            "id": wh["id"], "name": wh["name"], "lat": str(wh["lat"]), "lng": str(wh["lng"]),
        })
        print(f"Warehouse: {wh['name']} ({wh['id']})")

    # Seed drivers
    for driver in DRIVERS:
        wh = WAREHOUSES[hash(driver["id"]) % len(WAREHOUSES)]
        await client.hset(f"driver:{driver['id']}", mapping={
            "id": driver["id"],
            "name": driver["name"],
            "tenant_id": TENANT_ID,
            "on_time_rate": str(driver["on_time_rate"]),
            "status": "available",
            "vehicle_id": driver["vehicle_id"],
            "lat": str(wh["lat"]),
            "lng": str(wh["lng"]),
        })
        print(f"Driver: {driver['name']} ({driver['id']})")

    # Seed 50 orders across drivers
    risk_scores = [0.15, 0.22, 0.35, 0.45, 0.55, 0.65, 0.78, 0.88, 0.95]
    for i in range(50):
        driver = DRIVERS[i % len(DRIVERS)]
        order_id = str(uuid.uuid4())
        stops = _make_stops(i)
        planned_eta = _calc_eta(len(stops))
        risk_score = risk_scores[i % len(risk_scores)]
        status = "active" if i < 40 else "pending"

        await client.hset(f"order:{order_id}", mapping={
            "order_id": order_id,
            "driver_id": driver["id"],
            "tenant_id": TENANT_ID,
            "status": status,
            "risk_score": str(risk_score),
            "latitude": str(driver.get("lat", 40.7128)),
            "longitude": str(driver.get("lng", -74.0060)),
            "speed": str(15.0 + (i % 5) * 8.0),
            "planned_stops": str(len(stops)),
            "completed_stops": "0",
            "stops": json.dumps(stops),
            "planned_eta": planned_eta,
            "eta_minutes_remaining": str(20 + len(stops) * 8),
            "stops_remaining": str(len(stops)),
            "driver_on_time_rate": str(driver["on_time_rate"]),
        })
        if i % 10 == 0:
            print(f"Orders seeded: {i + 1}/50")

    # Publish initial fleet state to tenant channel
    fleet_data = json.dumps({
        "type": "initial_state",
        "tenant_id": TENANT_ID,
        "timestamp": now.isoformat(),
    })
    await client.publish(f"tenant:{TENANT_ID}:events", fleet_data)

    await client.close()
    print("\nSeed complete: 1 tenant, 3 warehouses, 15 drivers, 50 orders")


if __name__ == "__main__":
    asyncio.run(seed())
