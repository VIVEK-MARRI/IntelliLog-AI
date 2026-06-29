"""Operational analytics derived from PostgreSQL and Redis state."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.config import get_settings


@dataclass
class OperationalAnalytics:
    orders_processed: int
    active_deliveries: int
    high_risk_deliveries: int
    average_delay_minutes: float
    agent_interventions: int
    on_time_percentage: float
    driver_risk_distribution: list[dict[str, Any]]
    prediction_accuracy: float
    fleet_health_score: float
    gps_event_count: int


def _is_sqlite(db: AsyncSession) -> bool:
    bind = db.get_bind()
    return bind is not None and hasattr(bind, "dialect") and bind.dialect.name == "sqlite"


class AnalyticsService:
    def __init__(self, db: AsyncSession, redis_client: Any):
        self.db = db
        self.redis_client = redis_client

    async def get_metrics(self, tenant_id: str) -> OperationalAnalytics:
        if _is_sqlite(self.db):
            return await self._get_metrics_sqlite(tenant_id)
        return await self._get_metrics_pg(tenant_id)

    async def _get_metrics_sqlite(self, tenant_id: str) -> OperationalAnalytics:
        orders_result = await self.db.execute(
            text("""
                SELECT
                    COUNT(*) AS orders_processed,
                    COUNT(*) FILTER (WHERE status <> 'completed') AS active_deliveries,
                    COUNT(*) FILTER (WHERE current_risk_score >= 0.70 AND status <> 'completed') AS high_risk_deliveries,
                    COALESCE(AVG(
                        CASE
                            WHEN actual_eta IS NOT NULL AND actual_eta > planned_eta
                            THEN (julianday(actual_eta) - julianday(planned_eta)) * 24 * 60
                            ELSE 0
                        END
                    ), 0) AS average_delay_minutes,
                    COUNT(*) FILTER (WHERE actual_eta IS NOT NULL AND actual_eta <= planned_eta) AS on_time_orders,
                    COUNT(*) FILTER (WHERE actual_eta IS NOT NULL) AS completed_orders
                FROM orders
                WHERE tenant_id = :tenant_id
            """),
            {"tenant_id": tenant_id},
        )
        order_row = orders_result.mappings().one()

        agent_result = await self.db.execute(
            text("SELECT COUNT(*) AS agent_interventions FROM agent_decisions WHERE tenant_id = :tenant_id"),
            {"tenant_id": tenant_id},
        )
        agent_row = agent_result.mappings().one()

        driver_result = await self.db.execute(
            text("""
                SELECT d.id, COALESCE(d.name, 'Unknown') AS name,
                       COALESCE(AVG(p.risk_score), 0) AS avg_risk_score,
                       COUNT(o.id) AS active_orders
                FROM drivers d
                LEFT JOIN orders o ON o.driver_id = d.id AND o.tenant_id = d.tenant_id AND o.status <> 'completed'
                LEFT JOIN predictions p ON p.order_id = o.id AND p.tenant_id = :tenant_id
                WHERE d.tenant_id = :tenant_id
                GROUP BY d.id, d.name
                ORDER BY avg_risk_score DESC, active_orders DESC
            """),
            {"tenant_id": tenant_id},
        )

        pred_result = await self.db.execute(
            text("""
                SELECT
                    COUNT(*) FILTER (WHERE is_high_risk = 1 AND risk_score >= 0.70) AS true_positive,
                    COUNT(*) FILTER (WHERE is_high_risk = 0 AND risk_score < 0.70) AS true_negative,
                    COUNT(*) AS total_predictions
                FROM predictions
                WHERE tenant_id = :tenant_id
            """),
            {"tenant_id": tenant_id},
        )
        pred_row = pred_result.mappings().one()

        # Driver distribution from subquery result
        driver_rows = driver_result.mappings().all()
        on_time_orders = int(order_row["on_time_orders"] or 0)
        completed_orders = int(order_row["completed_orders"] or 0)
        on_time_pct = (on_time_orders / completed_orders * 100.0) if completed_orders else 100.0

        total_predictions = int(pred_row["total_predictions"] or 0)
        correct = int(pred_row["true_positive"] or 0) + int(pred_row["true_negative"] or 0)
        pred_accuracy = (correct / total_predictions * 100.0) if total_predictions else 0.0

        fleet_health = max(0.0, min(100.0, round(
            on_time_pct * 0.45
            + max(0.0, 100.0 - float(order_row["high_risk_deliveries"] or 0) * 4.0) * 0.25
            + max(0.0, 100.0 - float(order_row["average_delay_minutes"] or 0) * 2.0) * 0.20
            + max(0.0, 100.0 - float(agent_row["agent_interventions"] or 0) * 0.5) * 0.10,
            2,
        )))

        driver_risk_distribution = []
        for row in driver_rows:
            avg_risk = float(row["avg_risk_score"] or 0)
            driver_risk_distribution.append({
                "driver_id": row["id"],
                "name": row["name"],
                "avg_risk_score": avg_risk,
                "risk_bucket": "high" if avg_risk >= 0.7 else "medium" if avg_risk >= 0.4 else "low",
                "active_orders": int(row["active_orders"] or 0),
            })

        return OperationalAnalytics(
            orders_processed=int(order_row["orders_processed"] or 0),
            active_deliveries=int(order_row["active_deliveries"] or 0),
            high_risk_deliveries=int(order_row["high_risk_deliveries"] or 0),
            average_delay_minutes=float(order_row["average_delay_minutes"] or 0),
            agent_interventions=int(agent_row["agent_interventions"] or 0),
            on_time_percentage=round(on_time_pct, 2),
            driver_risk_distribution=driver_risk_distribution,
            prediction_accuracy=round(pred_accuracy, 2),
            fleet_health_score=round(fleet_health, 2),
            gps_event_count=0,
        )

    async def _get_metrics_pg(self, tenant_id: str) -> OperationalAnalytics:
        orders_result = await self.db.execute(
            text(
                """
                SELECT
                    COUNT(*) AS orders_processed,
                    COUNT(*) FILTER (WHERE status <> 'completed') AS active_deliveries,
                    COUNT(*) FILTER (WHERE current_risk_score >= 0.70 AND status <> 'completed') AS high_risk_deliveries,
                    COALESCE(AVG(GREATEST(EXTRACT(EPOCH FROM (COALESCE(actual_eta, NOW()) - planned_eta)) / 60.0, 0)), 0) AS average_delay_minutes,
                    COUNT(*) FILTER (WHERE actual_eta IS NOT NULL AND actual_eta <= planned_eta) AS on_time_orders,
                    COUNT(*) FILTER (WHERE actual_eta IS NOT NULL) AS completed_orders
                FROM orders
                WHERE tenant_id = :tenant_id
                """
            ),
            {"tenant_id": tenant_id},
        )
        order_row = orders_result.mappings().one()

        agent_result = await self.db.execute(
            text(
                """
                SELECT COUNT(*) AS agent_interventions
                FROM agent_decisions
                WHERE tenant_id = :tenant_id
                """
            ),
            {"tenant_id": tenant_id},
        )
        agent_row = agent_result.mappings().one()

        gps_result = await self.db.execute(
            text(
                """
                SELECT COUNT(*) AS gps_event_count
                FROM gps_events
                WHERE tenant_id = :tenant_id
                  AND recorded_at >= NOW() - INTERVAL '24 hours'
                """
            ),
            {"tenant_id": tenant_id},
        )
        gps_row = gps_result.mappings().one()

        driver_distribution_result = await self.db.execute(
            text(
                """
                SELECT
                    d.id::text AS driver_id,
                    COALESCE(d.name, 'Unknown') AS name,
                    COALESCE(AVG(latest_prediction.risk_score), 0) AS avg_risk_score,
                    COUNT(o.id) AS active_orders
                FROM drivers d
                LEFT JOIN orders o
                    ON o.driver_id = d.id
                   AND o.tenant_id = d.tenant_id
                   AND o.status <> 'completed'
                LEFT JOIN LATERAL (
                    SELECT p.risk_score
                    FROM predictions p
                    WHERE p.order_id = o.id
                      AND p.tenant_id = :tenant_id
                    ORDER BY p.created_at DESC
                    LIMIT 1
                ) latest_prediction ON TRUE
                WHERE d.tenant_id = :tenant_id
                GROUP BY d.id, d.name
                ORDER BY avg_risk_score DESC, active_orders DESC
                """
            ),
            {"tenant_id": tenant_id},
        )
        driver_rows = driver_distribution_result.mappings().all()

        prediction_accuracy_result = await self.db.execute(
            text(
                """
                SELECT
                    COUNT(*) FILTER (WHERE is_high_risk = TRUE AND risk_score >= 0.70) AS true_positive,
                    COUNT(*) FILTER (WHERE is_high_risk = FALSE AND risk_score < 0.70) AS true_negative,
                    COUNT(*) AS total_predictions
                FROM predictions
                WHERE tenant_id = :tenant_id
                """
            ),
            {"tenant_id": tenant_id},
        )
        prediction_row = prediction_accuracy_result.mappings().one()

        on_time_orders = int(order_row["on_time_orders"] or 0)
        completed_orders = int(order_row["completed_orders"] or 0)
        on_time_percentage = (on_time_orders / completed_orders * 100.0) if completed_orders else 100.0

        total_predictions = int(prediction_row["total_predictions"] or 0)
        correct_predictions = int(prediction_row["true_positive"] or 0) + int(prediction_row["true_negative"] or 0)
        prediction_accuracy = (correct_predictions / total_predictions * 100.0) if total_predictions else 0.0

        fleet_health_score = max(
            0.0,
            min(
                100.0,
                round(
                    on_time_percentage * 0.45
                    + max(0.0, 100.0 - float(order_row["high_risk_deliveries"] or 0) * 4.0) * 0.25
                    + max(0.0, 100.0 - float(order_row["average_delay_minutes"] or 0) * 2.0) * 0.20
                    + max(0.0, 100.0 - float(agent_row["agent_interventions"] or 0) * 0.5) * 0.10,
                    2,
                ),
            ),
        )

        driver_risk_distribution = []
        for row in driver_rows:
            avg_risk = float(row["avg_risk_score"] or 0)
            driver_risk_distribution.append(
                {
                    "driver_id": row["driver_id"],
                    "name": row["name"],
                    "avg_risk_score": avg_risk,
                    "risk_bucket": "high" if avg_risk >= 0.7 else "medium" if avg_risk >= 0.4 else "low",
                    "active_orders": int(row["active_orders"] or 0),
                }
            )

        return OperationalAnalytics(
            orders_processed=int(order_row["orders_processed"] or 0),
            active_deliveries=int(order_row["active_deliveries"] or 0),
            high_risk_deliveries=int(order_row["high_risk_deliveries"] or 0),
            average_delay_minutes=float(order_row["average_delay_minutes"] or 0),
            agent_interventions=int(agent_row["agent_interventions"] or 0),
            on_time_percentage=round(on_time_percentage, 2),
            driver_risk_distribution=driver_risk_distribution,
            prediction_accuracy=round(prediction_accuracy, 2),
            fleet_health_score=round(fleet_health_score, 2),
            gps_event_count=int(gps_row["gps_event_count"] or 0),
        )

    async def get_delay_causes(self, tenant_id: str) -> list[dict[str, Any]]:
        if _is_sqlite(self.db):
            return await self._get_delay_causes_sqlite(tenant_id)
        result = await self.db.execute(
            text(
                """
                SELECT
                    COALESCE(factor->>'feature', 'unknown') AS cause,
                    COUNT(*) AS affected_orders,
                    AVG(p.risk_score) AS avg_risk
                FROM predictions p
                JOIN LATERAL jsonb_array_elements(p.top_risk_factors::jsonb) AS factor ON TRUE
                WHERE p.tenant_id = :tenant_id
                GROUP BY factor->>'feature'
                ORDER BY affected_orders DESC, avg_risk DESC
                LIMIT 5
                """
            ),
            {"tenant_id": tenant_id},
        )
        rows = result.mappings().all()

        total = sum(int(row["affected_orders"] or 0) for row in rows) or 1
        causes = []
        for row in rows:
            affected_orders = int(row["affected_orders"] or 0)
            causes.append(
                {
                    "cause": row["cause"],
                    "percentage": round((affected_orders / total) * 100.0, 2),
                    "affected_orders": affected_orders,
                    "trend": "up" if float(row["avg_risk"] or 0) >= 0.7 else "stable",
                }
            )
        return causes

    async def _get_delay_causes_sqlite(self, tenant_id: str) -> list[dict[str, Any]]:
        result = await self.db.execute(
            text(
                """
                SELECT
                    CASE
                        WHEN json_type(p.top_risk_factors) = 'array'
                        THEN json_extract(value, '$.feature')
                        ELSE key
                    END AS cause,
                    COUNT(*) AS affected_orders,
                    AVG(p.risk_score) AS avg_risk
                FROM predictions p, json_each(p.top_risk_factors)
                WHERE p.tenant_id = :tenant_id
                GROUP BY cause
                ORDER BY affected_orders DESC, avg_risk DESC
                LIMIT 5
                """
            ),
            {"tenant_id": tenant_id},
        )
        rows = result.mappings().all()

        total = sum(int(row["affected_orders"] or 0) for row in rows) or 1
        causes = []
        for row in rows:
            affected_orders = int(row["affected_orders"] or 0)
            causes.append(
                {
                    "cause": row["cause"],
                    "percentage": round((affected_orders / total) * 100.0, 2),
                    "affected_orders": affected_orders,
                    "trend": "up" if float(row["avg_risk"] or 0) >= 0.7 else "stable",
                }
            )
        return causes

    async def get_recommendations(self, tenant_id: str) -> list[dict[str, Any]]:
        metrics = await self.get_metrics(tenant_id)
        recommendations: list[dict[str, Any]] = []

        if metrics.high_risk_deliveries:
            recommendations.append(
                {
                    "id": "review-high-risk-deliveries",
                    "priority": "critical" if metrics.high_risk_deliveries > 5 else "high",
                    "title": "Review high-risk deliveries",
                    "description": f"{metrics.high_risk_deliveries} active deliveries are above the risk threshold.",
                    "confidence": 0.97,
                    "estimated_impact_percentage": min(25, metrics.high_risk_deliveries * 3),
                    "action": "Focus dispatch and customer outreach on shipments with elevated risk scores.",
                }
            )

        if metrics.average_delay_minutes > 5:
            recommendations.append(
                {
                    "id": "reduce-delay-spikes",
                    "priority": "high",
                    "title": "Reduce delay spikes",
                    "description": f"Average delay is {metrics.average_delay_minutes:.1f} minutes.",
                    "confidence": 0.92,
                    "estimated_impact_percentage": min(20, round(metrics.average_delay_minutes * 2)),
                    "action": "Inspect routes, stop density, and driver pacing on delayed orders.",
                }
            )

        if metrics.on_time_percentage < 95:
            recommendations.append(
                {
                    "id": "improve-on-time-rate",
                    "priority": "medium",
                    "title": "Improve on-time rate",
                    "description": f"Current on-time delivery rate is {metrics.on_time_percentage:.1f}%.",
                    "confidence": 0.88,
                    "estimated_impact_percentage": min(15, round((95 - metrics.on_time_percentage) * 1.5)),
                    "action": "Prioritize intervention for orders with shrinking ETA slack.",
                }
            )

        if not recommendations:
            recommendations.append(
                {
                    "id": "maintain-current-operations",
                    "priority": "low",
                    "title": "Maintain current operations",
                    "description": "Active deliveries are within acceptable thresholds.",
                    "confidence": 0.91,
                    "estimated_impact_percentage": 0,
                    "action": "Continue monitoring live order state and predictions.",
                }
            )

        return recommendations
