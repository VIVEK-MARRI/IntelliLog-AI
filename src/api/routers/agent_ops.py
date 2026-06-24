from __future__ import annotations

import json
from datetime import datetime, timezone, timedelta
from typing import Any

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import text

from src.api.auth import AuthenticatedTenant, get_current_tenant
from src.api.deps import get_db

logger = structlog.get_logger(__name__)

router = APIRouter(tags=["agent-ops"], prefix="/agent-ops")

AGENT_MAP: dict[str, str] = {
    "reroute": "Optimization Agent",
    "alert_customer": "Risk Agent",
    "no_action": "Recommendation Agent",
    "alert": "Risk Agent",
    "escalate": "Risk Agent",
}

TOOL_MAP: dict[str, str] = {
    "redis": "Redis",
    "prediction_engine": "Prediction Engine",
    "route_optimizer": "Route Optimizer",
    "copilot": "Copilot",
    "prediction": "Prediction Engine",
    "route": "Route Optimizer",
    "recommendation": "Copilot",
    "reroute": "Route Optimizer",
    "alert": "Copilot",
}


def _normalize_decision(decision: str) -> str:
    d = decision.lower()
    if d in ("alert", "alert_customer", "escalate"):
        return "alert"
    if d == "reroute":
        return "reroute"
    return "no_action"


def _resolve_agent_type(decision: str, tools: list[str]) -> str:
    norm = _normalize_decision(decision)
    if norm == "reroute":
        return "Optimization Agent"
    if norm == "alert":
        return "Risk Agent"
    if "copilot" in tools or "recommendation" in tools:
        return "Recommendation Agent"
    if "route_optimizer" in tools or "route" in tools:
        return "Optimization Agent"
    if "prediction_engine" in tools or "prediction" in tools:
        return "Risk Agent"
    return AGENT_MAP.get(norm, "Recommendation Agent")


def _parse_tools(tools_raw: Any) -> list[str]:
    if isinstance(tools_raw, list):
        return [str(t).lower() for t in tools_raw]
    if isinstance(tools_raw, str):
        try:
            parsed = json.loads(tools_raw)
            return [str(t).lower() for t in parsed] if isinstance(parsed, list) else []
        except Exception:
            return []
    return []


@router.get("")
async def get_agent_ops(
    current_tenant: AuthenticatedTenant = Depends(get_current_tenant),
    db=Depends(get_db),
) -> dict:
    try:
        rows_result = await db.execute(
            text("""
                SELECT id::text, order_id::text, decided_at, risk_score, decision,
                       reasoning, tools_called, outcome, model_version
                FROM agent_decisions
                WHERE tenant_id = :tenant_id
                ORDER BY decided_at DESC
            """),
            {"tenant_id": current_tenant.tenant_id},
        )
        rows = rows_result.mappings().all()
    except Exception as e:
        logger.error("agent_ops_query_failed", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to query agent decisions",
        )

    if not rows:
        return _empty_response()

    decisions_raw: list[dict[str, Any]] = []
    for row in rows:
        reasoning = row["reasoning"]
        if isinstance(reasoning, str):
            try:
                reasoning = json.loads(reasoning)
            except Exception:
                reasoning = {}

        tools = _parse_tools(row["tools_called"])
        agent_type = _resolve_agent_type(str(row["decision"]), tools)

        factors = reasoning.get("factors") or reasoning.get("top_risk_factors") or []
        risk_factors = []
        if isinstance(factors, list):
            for f in factors[:3]:
                if isinstance(f, dict):
                    risk_factors.append({
                        "feature": str(f.get("feature", "unknown")),
                        "contribution": float(f.get("contribution", 0.0)),
                    })

        latency_ms = int(reasoning.get("latency_ms", 0)) if isinstance(reasoning, dict) else 0

        decisions_raw.append({
            "id": row["id"],
            "order_id": row["order_id"],
            "decided_at": row["decided_at"].isoformat() if row["decided_at"] else None,
            "decision_type": _normalize_decision(str(row["decision"])),
            "agent_type": agent_type,
            "risk_score": float(row["risk_score"] or 0.0),
            "outcome": str(row["outcome"] or "unknown"),
            "reasoning": str(reasoning.get("reason", reasoning.get("summary", ""))),
            "tools_called": tools,
            "latency_ms": latency_ms,
            "risk_factors": risk_factors,
            "model_version": str(row["model_version"] or "v1"),
        })

    # ── 1. Agent Summary ────────────────────────────────────────────────
    agents: dict[str, dict[str, Any]] = {}
    for d in decisions_raw:
        agent = d["agent_type"]
        if agent not in agents:
            agents[agent] = {"total": 0, "failures": 0, "latencies": [], "outcomes": []}
        agents[agent]["total"] += 1
        agents[agent]["latencies"].append(d["latency_ms"])
        agents[agent]["outcomes"].append(d["outcome"])
        if d["outcome"] in ("still_late",):
            agents[agent]["failures"] += 1

    agent_summary = []
    for name in ("Risk Agent", "Optimization Agent", "Recommendation Agent"):
        a = agents.get(name, {"total": 0, "failures": 0, "latencies": [], "outcomes": []})
        total = a["total"]
        failures = a["failures"]
        latencies = a["latencies"]
        successes = total - failures
        agent_summary.append({
            "name": name,
            "total_decisions": total,
            "success_rate": successes / total if total > 0 else 0,
            "avg_latency_ms": sum(latencies) / len(latencies) if latencies else 0,
            "failures": failures,
        })

    # ── 2. Decision Volume (decisions/hour) ─────────────────────────────
    if decisions_raw:
        timestamps = [
            datetime.fromisoformat(d["decided_at"]) for d in decisions_raw if d["decided_at"]
        ]
        if timestamps:
            min_ts = min(timestamps)
            max_ts = max(timestamps)
            span_hours = max((max_ts - min_ts).total_seconds() / 3600, 0.01)
            hourly_rate = len(timestamps) / span_hours
        else:
            hourly_rate = 0

        hourly_buckets: dict[str, int] = {}
        for t in timestamps:
            bucket = t.strftime("%Y-%m-%dT%H:00")
            hourly_buckets[bucket] = hourly_buckets.get(bucket, 0) + 1
    else:
        hourly_rate = 0
        hourly_buckets = {}

    decision_volume = {
        "decisions_per_hour": round(hourly_rate, 1),
        "hourly_buckets": [{"hour": k, "count": v} for k, v in sorted(hourly_buckets.items())],
        "total_decisions": len(decisions_raw),
    }

    # ── 3. Decision Outcomes ────────────────────────────────────────────
    outcome_counts: dict[str, int] = {}
    for d in decisions_raw:
        o = d["outcome"]
        outcome_counts[o] = outcome_counts.get(o, 0) + 1

    decision_outcomes = [
        {"outcome": "success", "count": outcome_counts.get("delivered_on_time", 0) + outcome_counts.get("prevented", 0)},
        {"outcome": "failed", "count": outcome_counts.get("still_late", 0)},
        {"outcome": "pending", "count": outcome_counts.get("unknown", 0)},
    ]

    # ── 4. Tool Usage ───────────────────────────────────────────────────
    tool_counts: dict[str, int] = {}
    for d in decisions_raw:
        used = set()
        for t in d["tools_called"]:
            mapped = TOOL_MAP.get(t, t.title())
            used.add(mapped)
        for tool in used:
            tool_counts[tool] = tool_counts.get(tool, 0) + 1

    tool_usage = [
        {"tool": display, "count": tool_counts.get(display, 0)}
        for display in ["Redis", "Prediction Engine", "Route Optimizer", "Copilot"]
    ]

    # ── 5. Agent Leaderboard ────────────────────────────────────────────
    leaderboard_rows: list[dict[str, Any]] = []
    leaderboard_data: dict[str, Any] = {}
    for d in decisions_raw:
        a = d["agent_type"]
        if a not in leaderboard_data:
            leaderboard_data[a] = {"total": 0, "successes": 0, "latencies": [], "time_saved": 0}
        leaderboard_data[a]["total"] += 1
        if d["outcome"] in ("delivered_on_time", "prevented"):
            leaderboard_data[a]["successes"] += 1
        leaderboard_data[a]["latencies"].append(d["latency_ms"])
        leaderboard_data[a]["time_saved"] += max(0, 10 - (d["latency_ms"] / 1000))

    for name, ld in leaderboard_data.items():
        total = ld["total"]
        leaderboard_rows.append({
            "rank": 0,
            "agent_name": name,
            "impact_score": round((ld["successes"] / total if total > 0 else 0) * 100, 1),
            "success_rate": round(ld["successes"] / total if total > 0 else 0, 3),
            "time_saved_minutes": int(ld["time_saved"]),
            "total_decisions": total,
        })

    leaderboard_rows.sort(key=lambda x: x["impact_score"], reverse=True)
    for i, row in enumerate(leaderboard_rows):
        row["rank"] = i + 1

    # ── 6. Decision Explorer (paginated, filterable) ────────────────────
    explorer_decisions = [
        {
            "id": d["id"],
            "order_id": d["order_id"],
            "timestamp": d["decided_at"],
            "decision_type": d["decision_type"],
            "agent_type": d["agent_type"],
            "risk_score": d["risk_score"],
            "outcome": d["outcome"],
            "reasoning": d["reasoning"],
            "tools_called": d["tools_called"],
            "latency_ms": d["latency_ms"],
        }
        for d in decisions_raw
    ]

    # ── 7. Failure Analysis ─────────────────────────────────────────────
    failures = [d for d in decisions_raw if d["outcome"] in ("still_late",)]
    failure_reasons: dict[str, int] = {}
    for f in failures:
        reason = f["reasoning"] or "unknown"
        failure_reasons[reason] = failure_reasons.get(reason, 0) + 1

    failure_analysis = {
        "total_failures": len(failures),
        "failure_rate": len(failures) / len(decisions_raw) if decisions_raw else 0,
        "reasons": [{"reason": k, "count": v} for k, v in sorted(failure_reasons.items(), key=lambda x: -x[1])],
        "avg_retries": 0,
    }

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "agent_summary": agent_summary,
        "decision_volume": decision_volume,
        "decision_outcomes": decision_outcomes,
        "tool_usage": tool_usage,
        "leaderboard": leaderboard_rows,
        "decision_explorer": {
            "decisions": explorer_decisions,
            "total": len(explorer_decisions),
        },
        "failure_analysis": failure_analysis,
    }


def _empty_response() -> dict:
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "agent_summary": [
            {"name": "Risk Agent", "total_decisions": 0, "success_rate": 0, "avg_latency_ms": 0, "failures": 0},
            {"name": "Optimization Agent", "total_decisions": 0, "success_rate": 0, "avg_latency_ms": 0, "failures": 0},
            {"name": "Recommendation Agent", "total_decisions": 0, "success_rate": 0, "avg_latency_ms": 0, "failures": 0},
        ],
        "decision_volume": {"decisions_per_hour": 0, "hourly_buckets": [], "total_decisions": 0},
        "decision_outcomes": [
            {"outcome": "success", "count": 0},
            {"outcome": "failed", "count": 0},
            {"outcome": "pending", "count": 0},
        ],
        "tool_usage": [
            {"tool": "Redis", "count": 0},
            {"tool": "Prediction Engine", "count": 0},
            {"tool": "Route Optimizer", "count": 0},
            {"tool": "Copilot", "count": 0},
        ],
        "leaderboard": [],
        "decision_explorer": {"decisions": [], "total": 0},
        "failure_analysis": {"total_failures": 0, "failure_rate": 0, "reasons": [], "avg_retries": 0},
    }
