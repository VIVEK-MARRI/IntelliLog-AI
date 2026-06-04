"""A small async in-memory database used by API tests."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any


class FakeRow:
    """Simulates a SQLAlchemy Row object with tuple-like access and attr access."""
    def __init__(self, data: dict[str, Any]) -> None:
        self._data = data

    def __getitem__(self, key: int | str) -> Any:
        if isinstance(key, int):
            return list(self._data.values())[key]
        return self._data[key]

    def __getattr__(self, name: str) -> Any:
        if name in self._data:
            return self._data[name]
        raise AttributeError(name)


@dataclass
class FakeQueryResult:
    rows: list[dict[str, Any]] = field(default_factory=list)
    scalar_value: Any = None
    rowcount: int = 0

    def scalar(self) -> Any:
        return self.scalar_value

    def mappings(self) -> "FakeQueryResult":
        return self

    def all(self) -> list[dict[str, Any]]:
        return self.rows

    def one(self) -> FakeRow | dict[str, Any]:
        if not self.rows:
            return {
                "orders_processed": 0,
                "active_deliveries": 0,
                "high_risk_deliveries": 0,
                "average_delay_minutes": 0.0,
                "on_time_orders": 0,
                "completed_orders": 0,
                "agent_interventions": 0,
                "gps_event_count": 0,
                "true_positive": 0,
                "true_negative": 0,
                "total_predictions": 0,
            }
        return FakeRow(self.rows[0])

    def one_or_none(self) -> FakeRow | None:
        return FakeRow(self.rows[0]) if self.rows else None

    def first(self) -> FakeRow | None:
        return FakeRow(self.rows[0]) if self.rows else None


class FakeAsyncSession:
    def __init__(self) -> None:
        self.orders: dict[tuple[str, str], dict[str, Any]] = {}
        self.drivers: dict[tuple[str, str], dict[str, Any]] = {}
        self.agent_decisions: dict[tuple[str, str], dict[str, Any]] = {}
        self.route_plans: dict[tuple[str, str], dict[str, Any]] = {}
        self.predictions: dict[tuple[str, str], dict[str, Any]] = {}
        self.config: dict[str, str] = {}

    async def execute(self, statement: Any, parameters: dict[str, Any] | None = None) -> FakeQueryResult:
        sql = str(statement)
        params = parameters or {}
        normalized = " ".join(sql.lower().split())

        if "set_config('app.current_tenant_id'" in normalized:
            self.config["app.current_tenant_id"] = str(params.get("tenant_id", ""))
            return FakeQueryResult()

        if "is_active from tenants" in normalized:
            tenant_id_str = str(params.get("tenant_id", ""))
            return FakeQueryResult(rows=[{"is_active": True}])

        if normalized.startswith("select count(*) as total_count from orders"):
            tenant_id = str(params.get("tenant_id", ""))
            status_filter = params.get("status_filter")
            rows = [
                row for row in self.orders.values()
                if row["tenant_id"] == tenant_id and (status_filter is None or row["status"] == status_filter)
            ]
            return FakeQueryResult(scalar_value=len(rows))

        if normalized.startswith("select id, driver_id, status, planned_eta, actual_eta"):
            tenant_id = str(params.get("tenant_id", ""))
            status_filter = params.get("status_filter")
            rows = [
                row for row in self.orders.values()
                if row["tenant_id"] == tenant_id and (status_filter is None or row["status"] == status_filter)
            ]
            rows = sorted(rows, key=lambda row: row["created_at"], reverse=True)
            offset = int(params.get("offset", 0))
            limit = int(params.get("limit", 20))
            return FakeQueryResult(rows=[
                {
                    "id": row["id"],
                    "driver_id": row["driver_id"],
                    "status": row["status"],
                    "planned_eta": row["planned_eta"],
                    "actual_eta": row["actual_eta"],
                    "current_risk_score": row["current_risk_score"],
                    "planned_stops": row["planned_stops"],
                    "completed_stops": row["completed_stops"],
                    "created_at": row["created_at"],
                    "updated_at": row["updated_at"],
                }
                for row in rows[offset : offset + limit]
            ])

        if "select id, tenant_id, order_id, waypoints" in normalized or "from route_plans" in normalized:
            tenant_id = str(params.get("tenant_id", ""))
            order_id = params.get("order_id")
            rows = [r for r in self.route_plans.values() if r["tenant_id"] == tenant_id]
            if order_id:
                rows = [r for r in rows if r["order_id"] == order_id]
            return FakeQueryResult(rows=rows)

        if "insert into drivers" in normalized:
            driver_id = str(params["driver_id"])
            tenant_id = str(params["tenant_id"])
            self.drivers[(tenant_id, driver_id)] = {
                "id": driver_id,
                "tenant_id": tenant_id,
                "name": params.get("name", f"Driver {driver_id}"),
                "historical_on_time_rate": 0.85,
                "total_deliveries": 0,
            }
            return FakeQueryResult()

        if "insert into route_plans" in normalized:
            plan_id = params.get("id") or f"plan_{len(self.route_plans)+1}"
            order_id = str(params.get("order_id"))
            tenant_id = str(params.get("tenant_id"))
            self.route_plans[(tenant_id, plan_id)] = {
                "id": plan_id,
                "order_id": order_id,
                "tenant_id": tenant_id,
                "waypoints": params.get("waypoints"),
                "total_distance_km": params.get("total_distance_km"),
                "total_duration_minutes": params.get("total_duration_minutes"),
                "solver_status": params.get("solver_status"),
                "solver_duration_ms": params.get("solver_duration_ms"),
                "created_at": datetime.now(timezone.utc),
            }
            return FakeQueryResult()

        if "insert into agent_decisions" in normalized:
            decision_id = params.get("id") or f"decision_{len(self.agent_decisions)+1}"
            order_id = str(params.get("order_id"))
            tenant_id = str(params.get("tenant_id"))
            self.agent_decisions[(tenant_id, decision_id)] = {
                "id": decision_id,
                "order_id": order_id,
                "tenant_id": tenant_id,
                "decision": params.get("decision"),
                "reason": params.get("reason"),
                "created_at": datetime.now(timezone.utc),
            }
            return FakeQueryResult()

        if "select id, decision, reason" in normalized or "from agent_decisions" in normalized:
            tenant_id = str(params.get("tenant_id", ""))
            order_id = params.get("order_id")
            rows = [r for r in self.agent_decisions.values() if r["tenant_id"] == tenant_id]
            if order_id:
                rows = [r for r in rows if r["order_id"] == order_id]
            return FakeQueryResult(rows=rows)

        if "insert into predictions" in normalized:
            pred_id = params.get("id") or f"pred_{len(self.predictions)+1}"
            order_id = str(params.get("order_id"))
            tenant_id = str(params.get("tenant_id"))
            self.predictions[(tenant_id, pred_id)] = {
                "id": pred_id,
                "order_id": order_id,
                "tenant_id": tenant_id,
                "score": params.get("score"),
                "explanation": params.get("explanation"),
                "created_at": datetime.now(timezone.utc),
            }
            return FakeQueryResult()

        if "from predictions" in normalized:
            tenant_id = str(params.get("tenant_id", ""))
            order_id = params.get("order_id")
            rows = [r for r in self.predictions.values() if r["tenant_id"] == tenant_id]
            if order_id:
                rows = [r for r in rows if r["order_id"] == order_id]
            return FakeQueryResult(rows=rows)

        if "insert into orders" in normalized:
            order_id = str(params["order_id"])
            tenant_id = str(params["tenant_id"])
            now = datetime.now(timezone.utc)
            existing = self.orders.get((tenant_id, order_id))
            created_at = existing["created_at"] if existing else now
            self.orders[(tenant_id, order_id)] = {
                "id": order_id,
                "tenant_id": tenant_id,
                "driver_id": str(params["driver_id"]),
                "status": "pending",
                "planned_stops": int(params["planned_stops"]),
                "completed_stops": 0,
                "planned_eta": params["planned_eta"],
                "actual_eta": None,
                "current_risk_score": 0.0,
                "created_at": created_at,
                "updated_at": now,
            }
            return FakeQueryResult()

        if normalized.startswith("update orders set actual_eta = :eta"):
            order_id = str(params["order_id"])
            for key, row in self.orders.items():
                if key[1] == order_id:
                    row["actual_eta"] = params["eta"]
                    row["updated_at"] = params["now"]
                    return FakeQueryResult(rowcount=1)
            return FakeQueryResult(rowcount=0)

        return FakeQueryResult()

    async def commit(self) -> None:
        return None

    async def rollback(self) -> None:
        return None

    async def close(self) -> None:
        return None
