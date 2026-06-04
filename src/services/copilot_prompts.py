"""
Grounded Prompt System for IntelliLog-AI Copilot.

These prompts enforce:
- Operational grounding (all claims must cite platform data)
- No hallucinations (LLM must decline if data is insufficient)
- Confidence scoring (0.0-1.0 based on data completeness)
- Evidence reporting (every recommendation must cite specific orders/drivers/metrics)
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Optional
import structlog

logger = structlog.get_logger(__name__)


@dataclass
class CopilotResponse:
    summary: str
    confidence: float
    evidence: list[str]
    recommendations: list[str]
    affected_orders: list[str] = field(default_factory=list)
    affected_drivers: list[str] = field(default_factory=list)
    risk_drivers: list[dict] = field(default_factory=list)
    shap_factors: list[dict] = field(default_factory=list)
    intent: str = "general"
    metadata: dict[str, Any] = field(default_factory=dict)


SYSTEM_PROMPT = """You are IntelliLog-AI Copilot, an operational intelligence analyst for logistics operations.

## YOUR ROLE
You analyze real-time logistics data and provide grounded, actionable recommendations to fleet operators. You are NOT a general-purpose chatbot. You ONLY reason about logistics operations using the data provided in the operational context.

## CORE RULES

1. **GROUNDING**: Every claim you make must cite specific data from the operational context. If you state "risk is high", you must reference specific order IDs and risk scores.

2. **CONFIDENCE**: Assign a confidence score (0.0-1.0) based on:
   - 0.9-1.0: Multiple data sources agree, clear patterns
   - 0.7-0.9: Good data, moderate certainty
   - 0.5-0.7: Limited data, preliminary assessment
   - 0.0-0.5: Insufficient data — say "I cannot determine" instead of guessing

3. **NO HALLUCINATION**: If the operational context does not contain enough information to answer a question, state "Insufficient data to answer this question" and suggest what data would help. NEVER fabricate metrics, order IDs, or driver information.

4. **EVIDENCE**: Every recommendation must include supporting evidence. At minimum 2 evidence items per response.

5. **RECOMMENDATIONS**: Must be specific and actionable. Not generic advice.

## OUTPUT FORMAT

Return ONLY valid JSON with this structure:
{
  "summary": "Brief operational summary (2-3 sentences)",
  "confidence": 0.0-1.0,
  "evidence": ["Specific data point 1", "Specific data point 2", ...],
  "recommendations": ["Actionable recommendation 1", "Actionable recommendation 2", ...],
  "affected_orders": ["order_id_1", "order_id_2"],
  "affected_drivers": ["driver_id_1"],
  "risk_drivers": [{"factor": "description", "impact": "high|medium|low"}],
  "shap_factors": [{"feature": "feature_name", "contribution": 0.0}]
}
"""


def build_query_prompt(context_text: str, query: str) -> str:
    return f"""Analyze the following operational context to answer the user's question.

## OPERATIONAL CONTEXT
{context_text}

## USER QUESTION
{query}

## INSTRUCTIONS
1. Only use data present in the operational context above.
2. If the context does not contain relevant data, state that clearly.
3. Be specific — reference actual order IDs, driver IDs, and metrics from the context.
4. If the user asks about something not in the context, say \"I don't have data on that\" rather than guessing.

Return valid JSON in the specified format."""


def build_summary_prompt(context_text: str, summary_type: str) -> str:
    type_instructions = {
        "operational": "Provide a concise executive summary of current operations. Focus on active deliveries, delays, and overall fleet health.",
        "risk": "Analyze current risk posture. Identify patterns in high-risk orders, common SHAP factors, and emerging risk trends.",
        "driver": "Summarize driver performance. Identify which drivers need intervention and why.",
        "route": "Summarize route efficiency. Identify which routes are underperforming and optimization opportunities.",
    }
    instruction = type_instructions.get(summary_type, type_instructions["operational"])
    return f"""Generate an executive summary based on the operational context below.

## OPERATIONAL CONTEXT
{context_text}

## SUMMARY TYPE: {summary_type}
{instruction}

## INSTRUCTIONS
1. Cite specific metrics from the context.
2. Be concise but data-rich.
3. Include actionable observations.

Return valid JSON."""


def build_recommendation_prompt(context_text: str, focus_area: Optional[str] = None) -> str:
    focus = focus_area or "overall operations"
    return f"""Analyze the operational context and generate specific, actionable recommendations for {focus}.

## OPERATIONAL CONTEXT
{context_text}

## INSTRUCTIONS
1. Each recommendation must reference specific orders or drivers.
2. Prioritize by urgency (high-risk first).
3. Include expected impact.
4. If no improvements are needed, state that.

Return valid JSON."""


_CONFIDENCE_MAP = {
    "high": 0.9,
    "medium": 0.6,
    "low": 0.3,
    "very high": 0.95,
    "very low": 0.1,
    "critical": 0.95,
    "moderate": 0.6,
    "certain": 0.95,
    "uncertain": 0.3,
}


def _parse_confidence(raw: object) -> float:
    """Parse a confidence value that may be numeric, percentage, or string-level.

    Returns a float in [0.0, 1.0]. Never raises.
    """
    if raw is None:
        return 0.0

    # Already numeric
    if isinstance(raw, (int, float)):
        val = float(raw)
        # Treat values > 1 as percentages (e.g. 92 → 0.92)
        if val > 1.0:
            val = val / 100.0
        return max(0.0, min(1.0, val))

    # String
    if isinstance(raw, str):
        s = raw.strip().lower()

        # Try keyword map
        if s in _CONFIDENCE_MAP:
            return _CONFIDENCE_MAP[s]

        # Try percentage suffix (e.g. "92%")
        if s.endswith("%"):
            try:
                val = float(s[:-1].strip()) / 100.0
                return max(0.0, min(1.0, val))
            except (ValueError, TypeError):
                pass

        # Try direct float parse
        try:
            val = float(s)
            if val > 1.0:
                val = val / 100.0
            return max(0.0, min(1.0, val))
        except (ValueError, TypeError):
            pass

    # Unparseable — return 0.0
    logger.warning("unparseable_confidence", value=repr(raw))
    return 0.0


def validate_response(data: dict) -> Optional[CopilotResponse]:
    required = ["summary", "confidence"]
    for field in required:
        if field not in data:
            logger.warning("response_missing_field", field=field)
            return None
    confidence = _parse_confidence(data.get("confidence", 0))
    if confidence > 0 and not data.get("evidence"):
        confidence = confidence * 0.5
    return CopilotResponse(
        summary=str(data.get("summary", "")),
        confidence=max(0.0, min(1.0, confidence)),
        evidence=data.get("evidence", []),
        recommendations=data.get("recommendations", []),
        affected_orders=data.get("affected_orders", []),
        affected_drivers=data.get("affected_drivers", []),
        risk_drivers=data.get("risk_drivers", []),
        shap_factors=data.get("shap_factors", []),
        intent=data.get("intent", "general"),
        metadata=data.get("metadata", {}),
    )


def build_anomaly_prompt(context_text: str) -> str:
    return f"""Analyze the operational context for telemetry anomalies and operational risks.

## OPERATIONAL CONTEXT
{context_text}

## INSTRUCTIONS
1. Identify any anomalies (excessive speed, route deviation, stopped vehicles).
2. Correlate anomalies with high-risk orders.
3. Prioritize by severity.
4. Suggest immediate actions for critical anomalies.

Return valid JSON with:
{{
  "anomalies_found": [{{"order_id": "str", "type": "str", "severity": "high|medium|low", "action": "str"}}],
  "summary": "Brief anomaly assessment",
  "critical_count": 0,
  "recommendations": ["action1", "action2"]
}}"""
