"""
Explainability Studio router.
Aggregates SHAP explanations, agent reasoning, and impact analysis
for a single order into one structured response.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text

from src.api.auth import AuthenticatedTenant, get_current_tenant
from src.api.deps import get_db, get_prediction_service, get_redis
from src.api.schemas import RiskFactor
from src.ml.inference import PredictionService

logger = structlog.get_logger(__name__)

router = APIRouter(tags=["explain"], prefix="/explain")

FEATURE_LABELS: dict[str, str] = {
    "stops_remaining_ratio": "Stops Remaining",
    "time_elapsed_ratio": "Time Elapsed",
    "pace_ratio": "Pace",
    "avg_stop_dwell_minutes": "Avg Stop Dwell",
    "current_speed_kmh": "Current Speed",
    "speed_ratio": "Speed Ratio",
    "route_deviation_meters": "Route Deviation",
    "speed_trend": "Speed Trend",
    "driver_on_time_rate": "Driver History",
    "hour_of_day_sin": "Hour of Day",
    "hour_of_day_cos": "Hour of Day",
    "is_peak_hour": "Peak Hour",
    "day_of_week_sin": "Day of Week",
    "day_of_week_cos": "Day of Week",
}


@router.get("/{order_id}")
async def explain_order(
    order_id: str,
    current_tenant: AuthenticatedTenant = Depends(get_current_tenant),
    redis_client: Any = Depends(get_redis),
    prediction_service: PredictionService = Depends(get_prediction_service),
    db=Depends(get_db),
) -> dict:
    """
    Return a comprehensive explainability snapshot for a single order.

    Sections returned:
      - order_summary      — order metadata, risk score, confidence, ETA
      - shap_factors       — raw SHAP factors (for waterfall chart)
      - feature_importance — ranked by |contribution|
      - risk_narrative     — generated plain-English explanation
      - agent_decision     — latest agent decision with reasoning
      - impact_analysis    — before/after risk and time comparison
    """
    # ── 1. Load order state from Redis, fallback to DB ──────────────────
    order_state: dict[str, str] = {}
    try:
        raw_state = await redis_client.hgetall(f"order:{order_id}")
        if raw_state:
            order_state = {k.decode() if isinstance(k, bytes) else k:
                           v.decode() if isinstance(v, bytes) else v
                           for k, v in raw_state.items()}
    except Exception:
        pass  # fallback to DB below

    if not order_state:
        # Load order metadata from DB (columns may differ from Redis state)
        try:
            row = await db.execute(
                text("""
                    SELECT o.status, o.driver_id, o.planned_stops, o.completed_stops,
                           o.planned_eta
                    FROM orders o
                    WHERE o.tenant_id = :t AND o.id::text = :oid
                    LIMIT 1
                """),
                {"t": current_tenant.tenant_id, "oid": order_id},
            )
            r = row.mappings().first()
        except Exception:
            r = None
        if r:
            order_state = {k: str(v) if v is not None else "" for k, v in r.items()}
            order_state.setdefault("driver_on_time_rate", "0.85")
        else:
            # Order not in DB either — use sensible defaults
            order_state = {
                "status": "unknown",
                "driver_id": "unknown",
                "planned_stops": "1",
                "completed_stops": "0",
                "planned_eta": "",
                "driver_on_time_rate": "0.85",
            }

    # Ensure defaults for optional fields
    order_state.setdefault("driver_on_time_rate", "0.85")

    # ── 2. Run prediction with SHAP ─────────────────────────────────────
    try:
        features = prediction_service.feature_builder.build_from_live(
            {
                "order_id": order_id,
                "planned_stops": int(order_state.get("planned_stops", 1)),
                "completed_stops": int(order_state.get("completed_stops", 0)),
                "planned_duration_minutes": float(order_state.get("planned_duration_minutes", 60.0)),
                "actual_duration_so_far_minutes": float(order_state.get("actual_duration_so_far_minutes", 0.0)),
                "stops_remaining": int(order_state.get("stops_remaining", 0)),
                "eta_minutes_remaining": float(order_state.get("eta_minutes_remaining", 0.0)),
                "speed": float(order_state.get("speed", 35.0)),
                "deviation_meters": float(order_state.get("deviation_meters", 0.0)),
                "hour_of_day": datetime.now(timezone.utc).hour,
                "day_of_week": datetime.now(timezone.utc).weekday(),
            },
            {
                "driver_on_time_rate": float(order_state.get("driver_on_time_rate", 0.85)),
            },
        )
        result = prediction_service.predict_with_shap(order_id, features)
    except Exception as e:
        logger.error("explain_prediction_error", order_id=order_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to compute prediction: {e}",
        )

    # ── 3. Convert SHAP factors ────────────────────────────────────────
    shap_factors = [
        {
            "feature": f["feature"],
            "label": FEATURE_LABELS.get(f["feature"], f["feature"].replace("_", " ").title()),
            "value": f.get("value", 0),
            "contribution": f["contribution"],
            "shap_value": f.get("shap_value", f["contribution"] * (1 if f["direction"] == "increases_risk" else -1)),
            "direction": "increases" if f["direction"] in ("increases_risk", "increases") else "decreases",
        }
        for f in result.top_risk_factors
    ]

    # ── 4. Feature importance (ranked by |contribution|) ────────────────
    feature_importance = sorted(
        shap_factors,
        key=lambda x: abs(x["contribution"]),
        reverse=True,
    )

    # ── 5. Risk narrative (generated from SHAP factors) ─────────────────
    inc_factors = [f for f in shap_factors if f["direction"] == "increases"]
    dec_factors = [f for f in shap_factors if f["direction"] == "decreases"]

    narrative_parts: list[str] = []
    if result.is_high_risk:
        narrative_parts.append(f"Risk is elevated ({result.risk_score:.0%}).")
    else:
        narrative_parts.append(f"Risk is manageable ({result.risk_score:.0%}).")

    if inc_factors:
        top_inc = inc_factors[0]
        narrative_parts.append(
            f"The primary driver is {top_inc['label'].lower()} "
            f"(contribution: {top_inc['contribution']:.3f})."
        )
        if len(inc_factors) > 1:
            secondary = ", ".join(
                f"{f['label'].lower()} ({f['contribution']:.3f})"
                for f in inc_factors[1:3]
            )
            narrative_parts.append(f"Secondary contributors: {secondary}.")

    if dec_factors:
        top_dec = dec_factors[0]
        narrative_parts.append(
            f"Mitigating factors include {top_dec['label'].lower()} "
            f"(contribution: {top_dec['contribution']:.3f})."
        )

    narrative_parts.append(
        f"Predicted delay: {result.predicted_delay_minutes:.0f} minutes. "
        f"Confidence: {result.confidence}."
    )

    risk_narrative = " ".join(narrative_parts)

    # ── 6. Agent decision history ───────────────────────────────────────
    agent_section: dict[str, Any] = {
        "has_decisions": False,
        "latest_decision": None,
        "decisions": [],
    }
    try:
        rows_result = await db.execute(
            text("""
                SELECT id::text, order_id::text, decided_at, risk_score, decision,
                       reasoning, tools_called, outcome
                FROM agent_decisions
                WHERE tenant_id = :tenant_id AND order_id = :order_id
                ORDER BY decided_at DESC
                LIMIT 10
            """),
            {"tenant_id": current_tenant.tenant_id, "order_id": order_id},
        )
        rows = rows_result.mappings().all()
        if rows:
            decisions: list[dict[str, Any]] = []
            for row in rows:
                reasoning = row["reasoning"]
                if isinstance(reasoning, str):
                    try:
                        reasoning = json.loads(reasoning)
                    except Exception:
                        reasoning = {"summary": reasoning}
                tools = row["tools_called"]
                if isinstance(tools, str):
                    try:
                        tools = json.loads(tools)
                    except Exception:
                        tools = []
                    if not isinstance(tools, list):
                        tools = [tools]

                # Extract SHAP factors from reasoning JSONB
                rf = []
                raw_factors = (reasoning if isinstance(reasoning, dict) else {}).get("top_risk_factors") or []
                for factor in raw_factors[:5]:
                    if isinstance(factor, dict):
                        rf.append({
                            "feature": str(factor.get("feature", "unknown")),
                            "contribution": float(factor.get("contribution", 0.0)),
                            "direction": str(factor.get("direction", "increases_risk")),
                        })

                decisions.append({
                    "decision_id": row["id"],
                    "decision_type": _normalize_decision(str(row["decision"])),
                    "risk_score": float(row["risk_score"] or 0.0),
                    "reasoning": str(reasoning.get("summary") if isinstance(reasoning, dict) else reasoning),
                    "tools_invoked": tools if isinstance(tools, list) else [],
                    "outcome": str(row["outcome"] or "unknown"),
                    "timestamp": row["decided_at"].isoformat() if row["decided_at"] else None,
                    "latency_ms": int(reasoning.get("latency_ms", 0)) if isinstance(reasoning, dict) else 0,
                    "shap_factors": rf,
                })

            agent_section = {
                "has_decisions": True,
                "latest_decision": decisions[0],
                "decisions": decisions,
            }
    except Exception as e:
        logger.warning("explain_agent_query_failed", error=str(e))

    # ── 7. Impact analysis ──────────────────────────────────────────────
    impact: dict[str, Any] = {
        "current_risk_score": result.risk_score,
        "previous_risk_score": None,
        "risk_reduction": None,
        "time_saved_minutes": None,
        "has_intervention": False,
    }
    if agent_section["has_decisions"] and agent_section["latest_decision"]:
        latest = agent_section["latest_decision"]
        impact["previous_risk_score"] = latest["risk_score"]
        impact["risk_reduction"] = round(
            max(0.0, latest["risk_score"] - result.risk_score), 4
        )
        if latest["decision_type"] in ("reroute", "alert"):
            impact["has_intervention"] = True
            impact["time_saved_minutes"] = max(
                0,
                int(result.predicted_delay_minutes) - int(latest.get("latency_ms", 0) // 60000),
            )

    # ── 8. Order info from order_state ─────────────────────────────────
    driver_id = order_state.get("driver_id", "unknown")
    driver_result = None
    try:
        driver_result = await db.execute(
            text("SELECT name, id FROM drivers WHERE id::text = :did LIMIT 1"),
            {"did": driver_id},
        )
        driver_row = driver_result.mappings().first()
    except Exception:
        driver_row = None

    order_summary = {
        "order_id": order_id,
        "driver_id": driver_id,
        "driver_name": driver_row["name"] if driver_row else "Unknown",
        "status": order_state.get("status", "unknown"),
        "risk_score": result.risk_score,
        "is_high_risk": result.is_high_risk,
        "confidence": result.confidence,
        "predicted_delay_minutes": result.predicted_delay_minutes,
        "planned_eta": order_state.get("planned_eta", ""),
        "stops_remaining": int(order_state.get("stops_remaining", 0)),
        "speed": float(order_state.get("speed", 0)),
    }

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "order_summary": order_summary,
        "shap_factors": shap_factors,
        "feature_importance": feature_importance,
        "risk_narrative": risk_narrative,
        "agent_decision": agent_section,
        "impact_analysis": impact,
    }


def _normalize_decision(decision: str) -> str:
    d = decision.lower()
    if d in ("alert", "alert_customer", "escalate"):
        return "alert"
    if d == "reroute":
        return "reroute"
    return "no_action"
