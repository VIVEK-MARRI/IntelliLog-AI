"""Operations copilot service layer with LLM-powered reasoning."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional

import structlog
from redis.asyncio import Redis
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
