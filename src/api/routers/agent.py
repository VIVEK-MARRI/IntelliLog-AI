"""
Agent router.
Agent decision history and reasoning access.
"""

import json
from datetime import datetime, timezone
from typing import List

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text

from src.api.auth import AuthenticatedTenant, get_current_tenant
from src.api.deps import get_db
from src.api.schemas import AgentDecisionHistoryResponse, AgentDecisionResponse, DecisionType, RiskFactor

logger = structlog.get_logger(__name__)

router = APIRouter(tags=["agent"], prefix="/agent")


def _map_decision_type(decision: str) -> DecisionType:
    normalized = decision.lower()
    if normalized in {"alert", "alert_customer", "escalate"}:
        return DecisionType.ALERT
    if normalized in {"reroute"}:
        return DecisionType.REROUTE
    return DecisionType.NO_ACTION


def _extract_top_factors(reasoning: object) -> list[RiskFactor]:
    if isinstance(reasoning, dict):
        factors = reasoning.get("top_risk_factors") or reasoning.get("factors") or []
        if isinstance(factors, list):
            output: list[RiskFactor] = []
            for factor in factors[:5]:
                if isinstance(factor, dict):
                    output.append(
                        RiskFactor(
                            feature=str(factor.get("feature", "unknown")),
                            contribution=float(factor.get("contribution", 0.0)),
                            direction=str(factor.get("direction", "increases_risk")),
                            humanReadable=str(factor.get("human_readable") or factor.get("humanReadable") or factor.get("feature", "Risk factor")),
                        )
                    )
            if output:
                return output
    return []


@router.get("/decisions/{order_id}", response_model=AgentDecisionHistoryResponse)
async def get_decision_history(
    order_id: str,
    current_tenant: AuthenticatedTenant = Depends(get_current_tenant),
    db=Depends(get_db),
) -> AgentDecisionHistoryResponse:
    """
    Get agent decision history for an order.

    Returns last 20 decisions with full reasoning and SHAP values.
    Each decision includes:
    - Decision type (no_action, alert, reroute)
    - Risk score at time of decision
    - Top risk factors
    - Tools invoked
    - Outcome
    """
    logger.info(
        "get_decision_history",
        order_id=order_id,
        tenant_id=current_tenant.tenant_id,
    )

    result = await db.execute(
        text(
            """
            SELECT id::text AS decision_id, order_id::text AS order_id, decided_at, risk_score, decision,
                   reasoning, tools_called, outcome
            FROM agent_decisions
            WHERE tenant_id = :tenant_id AND order_id = :order_id
            ORDER BY decided_at DESC
            LIMIT 20
            """
        ),
        {"tenant_id": current_tenant.tenant_id, "order_id": order_id},
    )

    rows = result.mappings().all()
    decisions: List[AgentDecisionResponse] = []
    for row in rows:
        reasoning = row["reasoning"]
        if isinstance(reasoning, str):
            try:
                reasoning = json.loads(reasoning)
            except Exception:
                reasoning = {"summary": reasoning}
        factors = _extract_top_factors(reasoning)
        decisions.append(
            AgentDecisionResponse(
                decisionId=row["decision_id"],
                orderId=row["order_id"],
                decisionType=_map_decision_type(str(row["decision"])),
                reasoning=str(reasoning.get("summary") if isinstance(reasoning, dict) else reasoning),
                riskScore=float(row["risk_score"] or 0.0),
                topRiskFactors=factors,
                toolsInvoked=list(row["tools_called"] or []) if isinstance(row["tools_called"], list) else [],
                outcome=str(row["outcome"] or "unknown"),
                timestamp=row["decided_at"] or datetime.now(timezone.utc),
                latencyMs=int(reasoning.get("latency_ms", 0)) if isinstance(reasoning, dict) else 0,
            )
        )

    latest_decision = decisions[0] if decisions else None

    return AgentDecisionHistoryResponse(
        orderId=order_id,
        decisions=decisions,
        latestDecision=latest_decision,
    )


@router.get(
    "/decisions/{order_id}/{decision_id}",
    response_model=AgentDecisionResponse,
)
async def get_decision_detail(
    order_id: str,
    decision_id: str,
    current_tenant: AuthenticatedTenant = Depends(get_current_tenant),
    db=Depends(get_db),
) -> AgentDecisionResponse:
    """
    Get detailed decision reasoning.

    Returns complete decision data including:
    - Full SHAP feature contributions
    - Decision logic path (which nodes executed)
    - All tools called and their results
    - Agent's confidence level
    """
    logger.info(
        "get_decision_detail",
        order_id=order_id,
        decision_id=decision_id,
        tenant_id=current_tenant.tenant_id,
    )

    result = await db.execute(
        text(
            """
            SELECT id::text AS decision_id, order_id::text AS order_id, decided_at, risk_score, decision,
                   reasoning, tools_called, outcome
            FROM agent_decisions
            WHERE tenant_id = :tenant_id AND order_id = :order_id AND id::text = :decision_id
            LIMIT 1
            """
        ),
        {"tenant_id": current_tenant.tenant_id, "order_id": order_id, "decision_id": decision_id},
    )
    row = result.mappings().first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Decision {decision_id} not found")

    reasoning = row["reasoning"]
    if isinstance(reasoning, str):
        try:
            reasoning = json.loads(reasoning)
        except Exception:
            reasoning = {"summary": reasoning}

    return AgentDecisionResponse(
        decisionId=row["decision_id"],
        orderId=row["order_id"],
        decisionType=_map_decision_type(str(row["decision"])),
        reasoning=str(reasoning.get("summary") if isinstance(reasoning, dict) else reasoning),
        riskScore=float(row["risk_score"] or 0.0),
        topRiskFactors=_extract_top_factors(reasoning),
        toolsInvoked=list(row["tools_called"] or []) if isinstance(row["tools_called"], list) else [],
        outcome=str(row["outcome"] or "unknown"),
        timestamp=row["decided_at"] or datetime.now(timezone.utc),
        latencyMs=int(reasoning.get("latency_ms", 0)) if isinstance(reasoning, dict) else 0,
    )
