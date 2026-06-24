"""Operations copilot service layer with LLM-powered reasoning."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional

import structlog
from redis.asyncio import Redis
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.services.context_builder import ContextBuilder
from src.services.copilot_prompts import (
    CopilotResponse,
    build_query_prompt,
    build_recommendation_prompt,
    build_anomaly_prompt,
    SYSTEM_PROMPT,
    validate_response,
)
from src.services.llm_service import GeminiService, get_gemini_service, ResponseValidator

logger = structlog.get_logger(__name__)


@dataclass
class CopilotInsight:
    summary: str
    evidence: list[str]
    recommendations: list[str]
    confidence: float
    sources: list[str]
    intent: str
    related_order_ids: list[str]
    metadata: dict[str, Any]


class OperationsCopilotService:
    def __init__(self, db: AsyncSession, redis_client: Redis):
        self.db = db
        self.redis_client = redis_client
        self.llm = get_gemini_service()
        self.context_builder = ContextBuilder(db, redis_client)
        self.logger = logger.bind(service="copilot")

    async def query(self, tenant_id: str, query: str, context: Optional[dict] = None) -> CopilotInsight:
        ctx = await self.context_builder.build(tenant_id)
        context_text = self.context_builder.context_to_prompt_text(ctx)

        prompt = build_query_prompt(context_text, query)
        result = await self.llm.generate(
            prompt=prompt,
            system_instruction=SYSTEM_PROMPT,
            required_fields=["summary", "confidence", "evidence", "recommendations"],
        )

        if result.structured:
            validated = validate_response(result.structured)
            if validated:
                return self._to_insight(validated, ctx)
            return self._fallback_insight(ctx, query, "response_validation_failed")
        return self._fallback_insight(ctx, query, "llm_unavailable")

    async def generate_recommendations(self, tenant_id: str, focus_area: Optional[str] = None) -> CopilotInsight:
        ctx = await self.context_builder.build(tenant_id)
        context_text = self.context_builder.context_to_prompt_text(ctx)
        prompt = build_recommendation_prompt(context_text, focus_area)
        result = await self.llm.generate(
            prompt=prompt,
            system_instruction=SYSTEM_PROMPT,
            required_fields=["summary", "confidence", "evidence", "recommendations"],
        )
        if result.structured:
            validated = validate_response(result.structured)
            if validated:
                return self._to_insight(validated, ctx)
        return self._fallback_insight(ctx, "recommendations", "llm_unavailable")

    async def analyze_anomalies(self, tenant_id: str) -> CopilotInsight:
        ctx = await self.context_builder.build(tenant_id)
        context_text = self.context_builder.context_to_prompt_text(ctx)
        prompt = build_anomaly_prompt(context_text)
        result = await self.llm.generate(
            prompt=prompt,
            system_instruction=SYSTEM_PROMPT,
            required_fields=["anomalies_found", "summary", "critical_count", "recommendations"],
        )
        if result.structured:
            return CopilotInsight(
                summary=result.structured.get("summary", "Anomaly analysis completed."),
                evidence=[f"Found {a['type']} for order {a['order_id']}" for a in result.structured.get("anomalies_found", [])],
                recommendations=result.structured.get("recommendations", []),
                confidence=0.8 if result.structured.get("critical_count", 0) > 0 else 0.95,
                sources=["telemetry", "orders"],
                intent="anomaly_analysis",
                related_order_ids=[a.get("order_id") for a in result.structured.get("anomalies_found", []) if a.get("order_id")],
                metadata=result.structured,
            )
        return self._fallback_insight(ctx, "anomaly_analysis", "llm_unavailable")

    async def stream_query(
        self,
        tenant_id: str,
        query: str,
    ):
        ctx = await self.context_builder.build(tenant_id)
        context_text = self.context_builder.context_to_prompt_text(ctx)
        prompt = build_query_prompt(context_text, query)
        async for token in self.llm.stream_generate(
            prompt=prompt,
            system_instruction=SYSTEM_PROMPT,
        ):
            yield token

    def _to_insight(self, response: CopilotResponse, ctx: Any) -> CopilotInsight:
        return CopilotInsight(
            summary=response.summary,
            evidence=response.evidence,
            recommendations=response.recommendations,
            confidence=response.confidence,
            sources=["orders", "predictions", "drivers", "gps_events", "llm"],
            intent=response.intent,
            related_order_ids=response.affected_orders,
            metadata={
                "affected_drivers": response.affected_drivers,
                "risk_drivers": response.risk_drivers,
                "shap_factors": response.shap_factors,
                "llm_generated": True,
                "stats": ctx.summary_stats if hasattr(ctx, "summary_stats") else {},
            },
        )

    async def workspace_query(self, tenant_id: str, query: str) -> dict[str, Any]:
        """Enriched workspace query with supporting orders, predictions, decisions, and actions."""
        insight = await self.query(tenant_id, query)
        result: dict[str, Any] = {
            "summary": insight.summary,
            "evidence": insight.evidence,
            "confidence": insight.confidence,
            "sources": insight.sources,
            "intent": insight.intent,
            "supporting_orders": [],
            "supporting_predictions": [],
            "supporting_decisions": [],
            "recommended_actions": [],
            "related_order_ids": insight.related_order_ids,
        }

        if not insight.related_order_ids:
            result["recommended_actions"] = self._build_generic_actions(insight)
            return result

        try:
            orders_data = await self._fetch_supporting_orders(tenant_id, insight.related_order_ids)
            result["supporting_orders"] = orders_data

            for o in orders_data:
                oid = o["order_id"]
                pred = await self._fetch_prediction(tenant_id, oid)
                if pred:
                    result["supporting_predictions"].append(pred)
                dec = await self._fetch_latest_decision(tenant_id, oid)
                if dec:
                    result["supporting_decisions"].append(dec)

            result["recommended_actions"] = self._build_actions_from_orders(
                orders_data, insight
            )
        except Exception as e:
            self.logger.warning("workspace_enrichment_failed", error=str(e))
            result["recommended_actions"] = self._build_generic_actions(insight)

        return result

    async def _fetch_supporting_orders(
        self, tenant_id: str, order_ids: list[str]
    ) -> list[dict[str, Any]]:
        if not order_ids:
            return []
        placeholders = ",".join(f":oid{i}" for i in range(len(order_ids)))
        params = {"tenant_id": tenant_id, **{f"oid{i}": oid for i, oid in enumerate(order_ids)}}
        result = await self.db.execute(
            text(f"""
                SELECT
                    o.id::text AS order_id,
                    COALESCE(d.name, 'Unknown') AS driver_name,
                    o.status,
                    o.current_risk_score AS risk_score,
                    COALESCE(
                        EXTRACT(EPOCH FROM (o.actual_eta - o.planned_eta)) / 60,
                        0
                    ) AS delay_minutes,
                    o.planned_eta::text AS eta,
                    o.driver_id::text AS driver_id
                FROM orders o
                LEFT JOIN drivers d ON d.id = o.driver_id AND d.tenant_id = o.tenant_id
                WHERE o.tenant_id = :tenant_id AND o.id::text IN ({placeholders})
            """),
            params,
        )
        rows = result.mappings().all()
        return [
            {
                "order_id": r["order_id"],
                "driver_name": r.get("driver_name", "Unknown"),
                "status": r.get("status", "unknown"),
                "risk_score": float(r.get("risk_score", 0)),
                "delay_minutes": float(r.get("delay_minutes", 0)),
                "eta": r.get("eta"),
                "driver_id": r.get("driver_id"),
            }
            for r in rows
        ]

    async def _fetch_prediction(
        self, tenant_id: str, order_id: str
    ) -> Optional[dict[str, Any]]:
        try:
            result = await self.db.execute(
                text("""
                    SELECT
                        p.risk_score,
                        p.confidence,
                        p.predicted_delay_minutes,
                        p.top_risk_factors,
                        p.model_version
                    FROM predictions p
                    WHERE p.order_id::text = :oid AND p.tenant_id = :tenant_id
                    ORDER BY p.created_at DESC
                    LIMIT 1
                """),
                {"oid": order_id, "tenant_id": tenant_id},
            )
            row = (await result.mappings().all())[0]
            factors = row.get("top_risk_factors", [])
            if isinstance(factors, str):
                import json
                try:
                    factors = json.loads(factors)
                except Exception:
                    factors = []
            top_factors = []
            for f in (factors or [])[:3]:
                if isinstance(f, dict):
                    top_factors.append(f.get("feature", f.get("human_readable", str(f))))
                elif isinstance(f, str):
                    top_factors.append(f)
            return {
                "order_id": order_id,
                "risk_score": float(row.get("risk_score", 0)),
                "confidence": float(row.get("confidence", 0)),
                "predicted_delay_minutes": float(row.get("predicted_delay_minutes", 0)),
                "top_factors": top_factors,
                "model_version": str(row.get("model_version", "unknown")),
            }
        except (IndexError, Exception):
            return None

    async def _fetch_latest_decision(
        self, tenant_id: str, order_id: str
    ) -> Optional[dict[str, Any]]:
        try:
            result = await self.db.execute(
                text("""
                    SELECT
                        id::text AS decision_id,
                        order_id::text,
                        decision_type,
                        outcome,
                        reasoning,
                        risk_score,
                        created_at::text AS timestamp
                    FROM agent_decisions
                    WHERE order_id::text = :oid AND tenant_id = :tenant_id
                    ORDER BY created_at DESC
                    LIMIT 1
                """),
                {"oid": order_id, "tenant_id": tenant_id},
            )
            row = (await result.mappings().all())[0]
            return {
                "decision_id": row["decision_id"],
                "order_id": row["order_id"],
                "decision_type": row.get("decision_type", "unknown"),
                "outcome": row.get("outcome", "unknown"),
                "reasoning": row.get("reasoning", ""),
                "risk_score": float(row.get("risk_score", 0)),
                "timestamp": row.get("timestamp", ""),
            }
        except (IndexError, Exception):
            return None

    def _build_actions_from_orders(
        self, orders: list[dict[str, Any]], insight: CopilotInsight
    ) -> list[dict[str, Any]]:
        actions: list[dict[str, Any]] = []
        for o in orders[:3]:
            actions.append({
                "id": f"open_order_{o['order_id']}",
                "type": "open_order",
                "label": f"View Order {o['order_id'][:8]}…",
                "description": f"Risk: {o['risk_score']:.0%}, Delay: {o['delay_minutes']:.0f}min",
                "params": {"order_id": o["order_id"]},
                "priority": "critical" if o["risk_score"] >= 0.7 else "high" if o["risk_score"] >= 0.5 else "normal",
            })
            actions.append({
                "id": f"explain_{o['order_id']}",
                "type": "explain",
                "label": "Explain Prediction",
                "description": f"SHAP analysis for {o['order_id'][:8]}…",
                "params": {"order_id": o["order_id"]},
                "priority": "normal",
            })
            actions.append({
                "id": f"view_route_{o['order_id']}",
                "type": "view_route",
                "label": "View Route",
                "description": f"Route map for {o['order_id'][:8]}…",
                "params": {"order_id": o["order_id"]},
                "priority": "normal",
            })
        actions.append({
            "id": "create_alert",
            "type": "create_alert",
            "label": "Create Alert",
            "description": "Alert operations team about high-risk findings",
            "params": {"intent": insight.intent},
            "priority": "high" if insight.confidence >= 0.7 else "normal",
        })
        actions.append({
            "id": "generate_report",
            "type": "generate_report",
            "label": "Generate Report",
            "description": f"Generate {insight.intent.replace('_', ' ')} report",
            "params": {"intent": insight.intent},
            "priority": "normal",
        })
        return actions

    def _build_generic_actions(self, insight: CopilotInsight) -> list[dict[str, Any]]:
        return [
            {
                "id": "create_alert",
                "type": "create_alert",
                "label": "Create Alert",
                "description": "Alert operations team",
                "params": {"intent": insight.intent},
                "priority": "normal",
            },
            {
                "id": "generate_report",
                "type": "generate_report",
                "label": "Generate Report",
                "description": f"Generate {insight.intent.replace('_', ' ')} report",
                "params": {"intent": insight.intent},
                "priority": "normal",
            },
        ]

    def _fallback_insight(self, ctx: Any, query: str, reason: str) -> CopilotInsight:
        stats = ctx.summary_stats if hasattr(ctx, "summary_stats") else {}
        return CopilotInsight(
            summary=f"LLM-powered analysis unavailable. Showing {stats.get('active_deliveries', 0)} active deliveries with {stats.get('high_risk_count', 0)} high-risk.",
            evidence=[
                f"Active deliveries: {stats.get('active_deliveries', 'N/A')}",
                f"High-risk: {stats.get('high_risk_count', 'N/A')}",
                f"Avg delay: {stats.get('avg_delay_minutes', 'N/A')} min",
            ],
            recommendations=[
                "Inspect high-risk orders in the dashboard.",
                "Review delayed routes for optimization opportunities.",
            ],
            confidence=0.0,
            sources=["orders", "predictions", "gps_events"],
            intent=query,
            related_order_ids=[o.order_id for o in ctx.high_risk_orders[:5]] if hasattr(ctx, "high_risk_orders") else [],
            metadata={"llm_error": reason, "stats": stats, "llm_generated": False},
        )
