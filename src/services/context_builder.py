"""
Operational Context Builder for IntelliLog-AI.

Gathers live operational state from PostgreSQL and Redis to build
a structured context object that grounds all LLM reasoning in real platform data.

No LLM calls here — pure data aggregation.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Any, Optional

import redis.asyncio as redis
import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = structlog.get_logger(__name__)


@dataclass
class HighRiskOrder:
    order_id: str
    driver_id: str
    risk_score: float
    top_shap_factors: list[dict]
    eta_drift_minutes: float
    current_speed_kmh: float
    route_deviation_meters: float
    estimated_delay_minutes: float
    last_agent_decision: Optional[str] = None
    planned_eta: Optional[str] = None


@dataclass
class DelayedRoute:
    order_id: str
    driver_id: str
    delay_minutes: float
    route_efficiency: float
    stops_remaining: int
    stops_completed: int


@dataclass
class ActiveDriver:
    driver_id: str
    name: str
    on_time_rate: float
    total_deliveries: int
    current_risk_avg: float
    status: str = "active"


@dataclass
class RecentAgentAction:
    order_id: str
    decision: str
    risk_score: float
    tools_called: list[str]
    timestamp: str


@dataclass
class OperationalContext:
    tenant_id: str
    high_risk_orders: list[HighRiskOrder] = field(default_factory=list)
    delayed_routes: list[DelayedRoute] = field(default_factory=list)
    active_drivers: list[ActiveDriver] = field(default_factory=list)
    recent_agent_actions: list[RecentAgentAction] = field(default_factory=list)
    top_shap_factors_global: list[dict] = field(default_factory=list)
    summary_stats: dict[str, Any] = field(default_factory=dict)
    collected_at: str = ""
    telemetry_anomalies: list[dict] = field(default_factory=list)


class ContextBuilder:
    def __init__(self, db: AsyncSession, redis_client: redis.Redis):
        self.db = db
        self.redis = redis_client
        self.logger = logger.bind(service="context_builder")

    async def build(self, tenant_id: str) -> OperationalContext:
        ctx = OperationalContext(
            tenant_id=tenant_id,
            collected_at=datetime.now(timezone.utc).isoformat(),
        )
        await self._load_high_risk_orders(ctx)
        await self._load_delayed_routes(ctx)
        await self._load_active_drivers(ctx)
        await self._load_recent_agent_actions(ctx)
        await self._load_telemetry_anomalies(ctx)
        await self._compute_summary_stats(ctx)
        self.logger.info("context_built", tenant_id=tenant_id, stats=ctx.summary_stats)
        return ctx

    async def _load_high_risk_orders(self, ctx: OperationalContext):
        try:
            result = await self.db.execute(
                text("""
                    SELECT
                        o.id::text AS order_id,
                        o.driver_id::text AS driver_id,
                        o.current_risk_score,
                        o.planned_eta,
                        o.current_speed_kmh,
                        o.route_deviation_meters,
                        COALESCE(
                            EXTRACT(EPOCH FROM (o.actual_eta - o.planned_eta)) / 60,
                            0
                        ) AS eta_drift_minutes,
                        COALESCE(
                            (SELECT p.top_risk_factors
                             FROM predictions p
                             WHERE p.order_id = o.id AND p.tenant_id = :tenant_id
                             ORDER BY p.created_at DESC LIMIT 1),
                            '[]'
                        ) AS top_risk_factors,
                        COALESCE(
                            (SELECT p.predicted_delay_minutes
                             FROM predictions p
                             WHERE p.order_id = o.id AND p.tenant_id = :tenant_id
                             ORDER BY p.created_at DESC LIMIT 1),
                            0
                        ) AS estimated_delay_minutes,
                        o.last_decision
                    FROM orders o
                    WHERE o.tenant_id = :tenant_id
                      AND o.status NOT IN ('completed', 'cancelled')
                      AND o.current_risk_score >= 0.50
                    ORDER BY o.current_risk_score DESC
                    LIMIT 20
                """),
                {"tenant_id": tenant_id},
            )
            rows = result.mappings().all()
            for row in rows:
                factors = []
                raw = row.get("top_risk_factors", "[]")
                if isinstance(raw, str):
                    try:
                        factors = json.loads(raw)
                    except (json.JSONDecodeError, TypeError):
                        factors = []
                elif isinstance(raw, (list, tuple)):
                    factors = raw
                ctx.high_risk_orders.append(HighRiskOrder(
                    order_id=row["order_id"],
                    driver_id=row.get("driver_id", "unknown"),
                    risk_score=float(row.get("current_risk_score", 0)),
                    top_shap_factors=factors[:5] if factors else [],
                    eta_drift_minutes=float(row.get("eta_drift_minutes", 0)),
                    current_speed_kmh=float(row.get("current_speed_kmh", 0)),
                    route_deviation_meters=float(row.get("route_deviation_meters", 0)),
                    estimated_delay_minutes=float(row.get("estimated_delay_minutes", 0)),
                    last_agent_decision=row.get("last_decision"),
                    planned_eta=str(row.get("planned_eta", "")) if row.get("planned_eta") else None,
                ))
        except Exception as e:
            self.logger.warning("context_load_high_risk_failed", error=str(e))

    async def _load_delayed_routes(self, ctx: OperationalContext):
        try:
            result = await self.db.execute(
                text("""
                    SELECT
                        o.id::text AS order_id,
                        o.driver_id::text AS driver_id,
                        COALESCE(
                            EXTRACT(EPOCH FROM (o.actual_eta - o.planned_eta)) / 60,
                            0
                        ) AS delay_minutes,
                        o.planned_stops,
                        o.completed_stops,
                        CASE
                            WHEN o.planned_stops > 0
                            THEN (o.completed_stops::float / o.planned_stops::float) * 100
                            ELSE 0
                        END AS route_efficiency
                    FROM orders o
                    WHERE o.tenant_id = :tenant_id
                      AND o.status = 'active'
                      AND (
                          EXTRACT(EPOCH FROM (o.actual_eta - o.planned_eta)) / 60 > 10
                          OR o.current_risk_score > 0.60
                      )
                    ORDER BY delay_minutes DESC
                    LIMIT 20
                """),
                {"tenant_id": tenant_id},
            )
            rows = result.mappings().all()
            for row in rows:
                ctx.delayed_routes.append(DelayedRoute(
                    order_id=row["order_id"],
                    driver_id=row.get("driver_id", "unknown"),
                    delay_minutes=float(row.get("delay_minutes", 0)),
                    route_efficiency=float(row.get("route_efficiency", 0)),
                    stops_remaining=int(row.get("planned_stops", 0)) - int(row.get("completed_stops", 0)),
                    stops_completed=int(row.get("completed_stops", 0)),
                ))
        except Exception as e:
            self.logger.warning("context_load_delayed_routes_failed", error=str(e))

    async def _load_active_drivers(self, ctx: OperationalContext):
        try:
            result = await self.db.execute(
                text("""
                    SELECT
                        d.id::text AS driver_id,
                        COALESCE(d.name, 'Unknown') AS name,
                        d.historical_on_time_rate,
                        d.total_deliveries,
                        COALESCE(AVG(o.current_risk_score), 0) AS current_risk_avg
                    FROM drivers d
                    LEFT JOIN orders o ON o.driver_id = d.id AND o.tenant_id = d.tenant_id
                      AND o.status = 'active'
                    WHERE d.tenant_id = :tenant_id
                    GROUP BY d.id, d.name, d.historical_on_time_rate, d.total_deliveries
                    ORDER BY current_risk_avg DESC
                    LIMIT 20
                """),
                {"tenant_id": tenant_id},
            )
            rows = result.mappings().all()
            for row in rows:
                ctx.active_drivers.append(ActiveDriver(
                    driver_id=row["driver_id"],
                    name=row.get("name", "Unknown"),
                    on_time_rate=float(row.get("historical_on_time_rate", 0.85)),
                    total_deliveries=int(row.get("total_deliveries", 0)),
                    current_risk_avg=float(row.get("current_risk_avg", 0)),
                ))
        except Exception as e:
            self.logger.warning("context_load_drivers_failed", error=str(e))

    async def _load_recent_agent_actions(self, ctx: OperationalContext):
        try:
            result = await self.db.execute(
                text("""
                    SELECT
                        order_id::text,
                        decision,
                        risk_score,
                        tools_called,
                        created_at::text AS timestamp
                    FROM agent_decisions
                    WHERE tenant_id = :tenant_id
                    ORDER BY created_at DESC
                    LIMIT 15
                """),
                {"tenant_id": tenant_id},
            )
            rows = result.mappings().all()
            for row in rows:
                tools = row.get("tools_called", [])
                if isinstance(tools, str):
                    try:
                        tools = json.loads(tools)
                    except (json.JSONDecodeError, TypeError):
                        tools = [tools]
                ctx.recent_agent_actions.append(RecentAgentAction(
                    order_id=row["order_id"],
                    decision=row.get("decision", "unknown"),
                    risk_score=float(row.get("risk_score", 0)),
                    tools_called=tools if isinstance(tools, list) else [],
                    timestamp=str(row.get("timestamp", "")),
                ))
        except Exception as e:
            self.logger.warning("context_load_actions_failed", error=str(e))

    async def _load_telemetry_anomalies(self, ctx: OperationalContext):
        try:
            result = await self.db.execute(
                text("""
                    SELECT
                        o.id::text AS order_id,
                        o.current_speed_kmh,
                        o.route_deviation_meters,
                        CASE
                            WHEN o.current_speed_kmh > 120 THEN 'excessive_speed'
                            WHEN o.route_deviation_meters > 5000 THEN 'major_route_deviation'
                            WHEN o.current_speed_kmh < 1 AND o.status = 'active' THEN 'possible_stopped'
                            ELSE NULL
                        END AS anomaly_type
                    FROM orders o
                    WHERE o.tenant_id = :tenant_id
                      AND o.status = 'active'
                      AND (
                          o.current_speed_kmh > 120
                          OR o.route_deviation_meters > 5000
                          OR (o.current_speed_kmh < 1 AND o.current_speed_kmh >= 0)
                      )
                    LIMIT 20
                """),
                {"tenant_id": tenant_id},
            )
            rows = result.mappings().all()
            for row in rows:
                if row.get("anomaly_type"):
                    ctx.telemetry_anomalies.append({
                        "order_id": row["order_id"],
                        "type": row["anomaly_type"],
                        "speed_kmh": float(row.get("current_speed_kmh", 0)),
                        "deviation_meters": float(row.get("route_deviation_meters", 0)),
                    })
        except Exception as e:
            self.logger.warning("context_load_anomalies_failed", error=str(e))

    async def _compute_summary_stats(self, ctx: OperationalContext):
        try:
            result = await self.db.execute(
                text("""
                    SELECT
                        COUNT(*) FILTER (WHERE status = 'active') AS active_deliveries,
                        COUNT(*) FILTER (WHERE status = 'active' AND current_risk_score >= 0.70) AS high_risk_count,
                        COALESCE(AVG(current_risk_score) FILTER (WHERE status = 'active'), 0) AS avg_risk_score,
                        COALESCE(
                            AVG(EXTRACT(EPOCH FROM (actual_eta - planned_eta)) / 60)
                            FILTER (WHERE status = 'active'),
                            0
                        ) AS avg_delay_minutes,
                        COUNT(*) FILTER (WHERE current_speed_kmh > 120) AS speed_anomalies,
                        COUNT(*) FILTER (WHERE route_deviation_meters > 5000) AS deviation_anomalies
                    FROM orders
                    WHERE tenant_id = :tenant_id
                """),
                {"tenant_id": tenant_id},
            )
            row = (await result.mappings().all())[0]
            ctx.summary_stats = {
                "active_deliveries": int(row.get("active_deliveries", 0)),
                "high_risk_count": int(row.get("high_risk_count", 0)),
                "avg_risk_score": round(float(row.get("avg_risk_score", 0)), 4),
                "avg_delay_minutes": round(float(row.get("avg_delay_minutes", 0)), 1),
                "speed_anomalies": int(row.get("speed_anomalies", 0)),
                "deviation_anomalies": int(row.get("deviation_anomalies", 0)),
                "high_risk_orders_count": len(ctx.high_risk_orders),
                "delayed_routes_count": len(ctx.delayed_routes),
                "active_drivers_count": len(ctx.active_drivers),
                "anomalies_count": len(ctx.telemetry_anomalies),
                "agent_actions_count": len(ctx.recent_agent_actions),
            }
        except Exception as e:
            self.logger.warning("context_compute_stats_failed", error=str(e))
            ctx.summary_stats = {"error": str(e)}

    def context_to_prompt_text(self, ctx: OperationalContext) -> str:
        lines = []
        lines.append(f"=== OPERATIONAL CONTEXT (tenant: {ctx.tenant_id}) ===")
        lines.append(f"Collected at: {ctx.collected_at}")
        lines.append("")
        stats = ctx.summary_stats
        lines.append("--- Summary Stats ---")
        for k, v in stats.items():
            lines.append(f"  {k}: {v}")
        lines.append("")
        if ctx.high_risk_orders:
            lines.append("--- High-Risk Orders (risk_score >= 0.50) ---")
            for o in ctx.high_risk_orders:
                factors_str = ", ".join(
                    f.get("feature", "?") for f in o.top_shap_factors[:3]
                ) if o.top_shap_factors else "none"
                lines.append(
                    f"  Order {o.order_id}: risk={o.risk_score:.2f}, "
                    f"ETA drift={o.eta_drift_minutes:.0f}min, "
                    f"speed={o.current_speed_kmh:.0f}km/h, "
                    f"delay_est={o.estimated_delay_minutes:.0f}min, "
                    f"SHAP factors: [{factors_str}]"
                )
            lines.append("")
        if ctx.delayed_routes:
            lines.append("--- Delayed Routes ---")
            for r in ctx.delayed_routes:
                lines.append(
                    f"  Order {r.order_id}: delay={r.delay_minutes:.0f}min, "
                    f"efficiency={r.route_efficiency:.0f}%, "
                    f"stops remaining={r.stops_remaining}"
                )
            lines.append("")
        if ctx.active_drivers:
            lines.append("--- Active Drivers ---")
            for d in ctx.active_drivers:
                lines.append(
                    f"  Driver {d.driver_id} ({d.name}): on_time_rate={d.on_time_rate:.1%}, "
                    f"deliveries={d.total_deliveries}, avg_risk={d.current_risk_avg:.2f}"
                )
            lines.append("")
        if ctx.recent_agent_actions:
            lines.append("--- Recent Agent Actions ---")
            for a in ctx.recent_agent_actions:
                lines.append(
                    f"  Order {a.order_id}: decision={a.decision}, "
                    f"risk={a.risk_score:.2f}, tools={a.tools_called}"
                )
            lines.append("")
        if ctx.telemetry_anomalies:
            lines.append("--- Telemetry Anomalies ---")
            for a in ctx.telemetry_anomalies:
                lines.append(
                    f"  Order {a['order_id']}: type={a['type']}, "
                    f"speed={a['speed_kmh']:.0f}km/h, deviation={a['deviation_meters']:.0f}m"
                )
            lines.append("")
        return "\n".join(lines)

    def context_to_structured(self, ctx: OperationalContext) -> dict[str, Any]:
        return asdict(ctx)
