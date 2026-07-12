"""
LangGraph-based delay prevention agent graph.

This is a directed state graph where:
- Each node is an async function
- State flows between nodes
- Edges define the decision logic
- The graph can be invoked with GPS events
"""

from datetime import datetime, timezone, timedelta
from typing import TypedDict, Optional, Annotated
import operator
import structlog
import math
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession
import httpx

from langgraph.graph import StateGraph, END

from src.agent.state import OrderAgentState, StateManager
from src.agent.tools import (
    call_route_optimizer,
    send_customer_notification,
    update_order_eta,
    write_audit_log,
)
from src.ml.feature_engineering import FeatureBuilder
from src.ml.inference import PredictionService, PredictionResult
from src.services.llm_service import get_gemini_service
from src.services.copilot_prompts import build_query_prompt, SYSTEM_PROMPT
from src.services.context_builder import ContextBuilder

logger = structlog.get_logger(__name__)


# ===== State Definition =====

class AgentGraphState(TypedDict):
    """In-flight state for one execution of the agent graph."""
    
    # Input
    gps_event: dict  # Raw GPS ping event
    
    # Populated by nodes
    order_state: Optional[OrderAgentState]
    features: Optional[dict]
    prediction: Optional[PredictionResult]
    decision: Optional[str]  # 'no_action', 'alert_only', 'reroute_and_alert'
    tools_called: list[str]  # Track which tools were invoked
    error: Optional[str]
    should_skip: bool  # Skip processing if event malformed

    # LLM-powered analysis
    llm_insight: Optional[str]  # Gemini-generated operational insight
    llm_risk_drivers: Optional[list[str]]  # Risk drivers identified by LLM
    llm_suggested_actions: Optional[list[str]]  # Actions suggested by LLM
    llm_severity: Optional[str]  # "high", "medium", "low"
    generated_insight: Optional[str]  # Combined insight for dashboard
    risk_level_label: Optional[str]  # "HIGH", "MEDIUM", "LOW"
    
    # Dependencies (injected at runtime)
    state_manager: Optional[StateManager]
    db_session: Optional[AsyncSession]
    redis_client: Optional[Redis]
    http_client: Optional[httpx.AsyncClient]
    feature_builder: Optional[FeatureBuilder]
    prediction_service: Optional[PredictionService]


# ===== Node Functions =====

async def node_update_order_state(state: AgentGraphState) -> AgentGraphState:
    """
    Load or create OrderAgentState from GPS event.
    Update position, speed, and compute route deviation.
    Save back to Redis.
    """
    try:
        gps_event = state["gps_event"]
        state_manager = state["state_manager"]
        
        # Extract event data
        order_id = gps_event.get("order_id")
        driver_id = gps_event.get("driver_id")
        tenant_id = gps_event.get("tenant_id")
        
        if not all([order_id, driver_id, tenant_id]):
            state["should_skip"] = True
            state["error"] = "Missing required fields in GPS event"
            logger.warning("gps_event_malformed", event=gps_event)
            return state
        
        # Try to load existing state
        order_state = await state_manager.load(order_id)
        
        # If not found, create new state from event
        if order_state is None:
            order_state = OrderAgentState(
                order_id=order_id,
                driver_id=driver_id,
                tenant_id=tenant_id,
                current_lat=gps_event["lat"],
                current_lng=gps_event["lng"],
                current_speed_kmh=gps_event.get("speed_kmh", 0.0),
                heading_degrees=gps_event.get("heading_degrees", 0.0),
                last_ping_at=datetime.now(timezone.utc),
                ping_sequence=1,
                planned_stops=gps_event.get("planned_stops", 0),
                completed_stops=gps_event.get("completed_stops", 0),
                planned_eta=datetime.fromisoformat(gps_event["planned_eta"]),
                current_eta=datetime.fromisoformat(gps_event["planned_eta"]),
                driver_on_time_rate=gps_event.get("driver_on_time_rate", 0.85),
            )
            logger.info("new_order_state_created", order_id=order_id)
        else:
            # Update existing state with new GPS data
            order_state.ping_sequence += 1
            order_state.heading_degrees = gps_event.get("heading_degrees", order_state.heading_degrees)
            
            # Add current speed to history
            order_state.recent_speeds.append(gps_event.get("speed_kmh", 0.0))
            
            # Update position
            old_lat = order_state.current_lat
            old_lng = order_state.current_lng
            order_state.current_lat = gps_event["lat"]
            order_state.current_lng = gps_event["lng"]
            order_state.current_speed_kmh = gps_event.get("speed_kmh", 0.0)
            order_state.last_ping_at = datetime.now(timezone.utc)
            
            # Update route progress
            order_state.completed_stops = gps_event.get("completed_stops", order_state.completed_stops)
            order_state.planned_stops = gps_event.get("planned_stops", order_state.planned_stops)
            
            # Compute route deviation (Haversine distance to planned route)
            # For now, simplified: just use the distance from start
            if "planned_lat" in gps_event and "planned_lng" in gps_event:
                order_state.route_deviation_meters = haversine_distance(
                    order_state.current_lat,
                    order_state.current_lng,
                    gps_event["planned_lat"],
                    gps_event["planned_lng"],
                ) * 1000  # Convert km to meters
            
            logger.info(
                "order_state_updated",
                order_id=order_id,
                ping_sequence=order_state.ping_sequence,
                speed_kmh=order_state.current_speed_kmh,
            )
        
        # Save to Redis
        await state_manager.save(order_state, ttl_hours=4)
        
        state["order_state"] = order_state
        return state
    
    except Exception as e:
        state["should_skip"] = True
        state["error"] = f"Failed to update order state: {str(e)}"
        logger.error("update_order_state_failed", error=str(e))
        return state


async def node_compute_features(state: AgentGraphState) -> AgentGraphState:
    """
    Build 14 ML features from OrderAgentState.
    Validate features. If validation fails, skip prediction.
    """
    try:
        if state["should_skip"]:
            return state
        
        order_state = state["order_state"]
        feature_builder = state["feature_builder"]
        
        # Build driver stats dict
        driver_stats = {
            "driver_on_time_rate": order_state.driver_on_time_rate,
        }
        
        # Build features from live order state
        planned_duration_minutes = float(
            state["gps_event"].get("planned_duration_minutes", 60.0)
        )

        actual_duration_so_far_minutes = state["gps_event"].get(
            "actual_duration_so_far_minutes",
            0.0,
        )

        features = feature_builder.build_from_live(
            {
                "order_id": order_state.order_id,
                "planned_stops": order_state.planned_stops,
                "completed_stops": order_state.completed_stops,
                "planned_duration_minutes": planned_duration_minutes,
                "actual_duration_so_far_minutes": actual_duration_so_far_minutes,
                "stops_remaining": order_state.planned_stops - order_state.completed_stops,
                "eta_minutes_remaining": (
                    (order_state.current_eta - datetime.now(timezone.utc)).total_seconds() / 60
                ),
                "speed": order_state.current_speed_kmh,
                "deviation_meters": order_state.route_deviation_meters,
                "hour_of_day": datetime.now(timezone.utc).hour,
                "day_of_week": datetime.now(timezone.utc).weekday(),
            },
            driver_stats,
        )
        
        # Validate features
        if not feature_builder.validate_features(features):
            state["should_skip"] = True
            state["error"] = "Feature validation failed"
            logger.warning("feature_validation_failed", order_id=order_state.order_id)
            return state
        
        state["features"] = features
        logger.info("features_computed", order_id=order_state.order_id)
        return state
    
    except Exception as e:
        state["should_skip"] = True
        state["error"] = f"Failed to compute features: {str(e)}"
        logger.error("compute_features_failed", error=str(e))
        return state


async def node_run_prediction(state: AgentGraphState) -> AgentGraphState:
    """
    Call PredictionService.predict_with_shap().
    Rate-limit: don't predict more frequently than 30 seconds.
    Update risk score and history.
    """
    try:
        if state["should_skip"]:
            return state
        
        order_state = state["order_state"]
        features = state["features"]
        prediction_service = state["prediction_service"]
        
        # === Rate Limiting ===
        if order_state.last_prediction_at is not None:
            seconds_since_last = (
                datetime.now(timezone.utc) - order_state.last_prediction_at
            ).total_seconds()
            
            if seconds_since_last < 30:
                # Use cached risk score
                state["prediction"] = None  # No new prediction, use cached
                logger.info(
                    "prediction_rate_limited",
                    order_id=order_state.order_id,
                    seconds_since_last=seconds_since_last,
                )
                return state
        
        # === Run Prediction ===
        prediction = prediction_service.predict_with_shap(
            order_state.order_id,
            features,
        )
        
        # Update order state
        order_state.current_risk_score = prediction.risk_score
        order_state.risk_history.append(prediction.risk_score)
        order_state.last_prediction_at = datetime.now(timezone.utc)
        
        state["prediction"] = prediction
        logger.info(
            "prediction_completed",
            order_id=order_state.order_id,
            risk_score=prediction.risk_score,
            is_high_risk=prediction.is_high_risk,
        )
        
        return state
    
    except Exception as e:
        state["should_skip"] = True
        state["error"] = f"Prediction failed: {str(e)}"
        logger.error("run_prediction_failed", error=str(e))
        return state


async def node_evaluate_risk(state: AgentGraphState) -> str:
    """
    Conditional edge function. Returns routing key based on risk score.
    Decision logic with rate limiting checks.
    """
    try:
        if state["should_skip"]:
            return "no_action"
        
        order_state = state["order_state"]
        prediction = state["prediction"]
        
        risk_score = prediction.risk_score if prediction else order_state.current_risk_score
        
        # === Decision Logic ===
        
        # Low risk: no action
        if risk_score < 0.30:
            return "no_action"
        
        # Already rerouted: only alert (don't reroute again)
        if order_state.reroute_triggered and risk_score > 0.70:
            return "alert_only"
        
        # Medium risk: alert if rate limit allows
        if 0.30 <= risk_score < 0.70:
            # Check alert rate limit (max 3 alerts per order, 30min apart)
            if order_state.alert_sent_count >= 3:
                return "no_action"
            
            if order_state.last_alert_sent_at is not None:
                minutes_since_last = (
                    datetime.now(timezone.utc) - order_state.last_alert_sent_at
                ).total_seconds() / 60
                
                if minutes_since_last < 30:
                    return "no_action"
            
            return "alert_only"
        
        # High risk: reroute + alert
        if risk_score > 0.70:
            # Don't reroute again if already triggered
            if order_state.reroute_triggered:
                return "alert_only"
            
            return "reroute_and_alert"
        
        return "no_action"
    
    except Exception as e:
        logger.error("evaluate_risk_failed", error=str(e))
        return "no_action"


async def node_prepare_risk_decision(state: AgentGraphState) -> AgentGraphState:
    """Pass-through node used before conditional risk routing."""
    return state


async def node_alert_customer(state: AgentGraphState) -> AgentGraphState:
    """
    Send customer notification with delay warning.
    Generate human-readable reason from SHAP factors.
    """
    try:
        if state["should_skip"]:
            return state
        
        order_state = state["order_state"]
        prediction = state["prediction"]
        http_client = state["http_client"]
        redis_client = state["redis_client"]
        
        state["tools_called"].append("send_customer_notification")
        
        # Generate reason from top risk factors
        if prediction and prediction.top_risk_factors:
            factors_text = ", ".join([
                f["feature"] for f in prediction.top_risk_factors[:3]
            ])
            reason = f"Delivery at risk due to: {factors_text}"
        else:
            reason = "Delivery is running behind schedule"
        
        # Calculate predicted delay
        delay_minutes = (
            order_state.current_eta - datetime.now(timezone.utc)
        ).total_seconds() / 60
        delay_minutes = max(0, -delay_minutes) if delay_minutes < 0 else 0
        
        # Send notification
        notification_result = await send_customer_notification(
            order_id=order_state.order_id,
            tenant_id=order_state.tenant_id,
            delay_minutes=delay_minutes,
            reason=reason,
            new_eta=order_state.current_eta,
            http_client=http_client,
            redis_client=redis_client,
        )
        
        if notification_result.success:
            order_state.alert_sent_count += 1
            order_state.last_alert_sent_at = datetime.now(timezone.utc)
            if order_state.reroute_triggered:
                order_state.last_decision = "reroute_and_alert"
            else:
                order_state.last_decision = "alert_only"
            order_state.last_decision_at = datetime.now(timezone.utc)
            logger.info(
                "customer_notification_sent",
                order_id=order_state.order_id,
                alert_count=order_state.alert_sent_count,
            )
        
        state["order_state"] = order_state
        return state
    
    except Exception as e:
        logger.error("alert_customer_failed", order_id=state["order_state"].order_id, error=str(e))
        return state


async def node_invoke_reroute(state: AgentGraphState) -> AgentGraphState:
    """
    Call route optimizer to find better path for remaining stops.
    If optimizer succeeds and saves time, update order.
    """
    try:
        if state["should_skip"]:
            return state
        
        order_state = state["order_state"]
        http_client = state["http_client"]
        
        state["tools_called"].append("call_route_optimizer")
        
        # Build list of remaining stops (simplified)
        remaining_stops = []
        for i in range(order_state.completed_stops, order_state.planned_stops):
            remaining_stops.append({
                "stop_number": i + 1,
                "lat": order_state.current_lat + (i * 0.001),  # Simplified
                "lng": order_state.current_lng + (i * 0.001),
                "address": f"Stop {i + 1}",
            })
        
        if not remaining_stops:
            logger.info("no_remaining_stops", order_id=order_state.order_id)
            return state
        
        # Call optimizer
        optimizer_result = await call_route_optimizer(
            order_id=order_state.order_id,
            current_lat=order_state.current_lat,
            current_lng=order_state.current_lng,
            remaining_stops=remaining_stops,
            tenant_id=order_state.tenant_id,
            http_client=http_client,
        )
        
        # Check result
        if optimizer_result.success and optimizer_result.time_saved_minutes > 3:
            # Good optimization found
            order_state.reroute_triggered = True
            order_state.last_reroute_at = datetime.now(timezone.utc)
            order_state.last_decision = "reroute_and_alert"
            order_state.last_decision_at = datetime.now(timezone.utc)
            
            # Update ETA
            new_eta = order_state.current_eta - timedelta(
                minutes=optimizer_result.time_saved_minutes
            )
            order_state.current_eta = new_eta
            
            await update_order_eta(
                order_id=order_state.order_id,
                new_eta=new_eta,
                reason=f"Rerouted via optimizer, saving {optimizer_result.time_saved_minutes:.0f} minutes",
                db_session=state["db_session"],
                redis_client=state["redis_client"],
            )
            
            logger.info(
                "reroute_successful",
                order_id=order_state.order_id,
                time_saved_minutes=optimizer_result.time_saved_minutes,
            )
        else:
            logger.warning(
                "reroute_not_beneficial",
                order_id=order_state.order_id,
                reason=optimizer_result.solver_status,
            )
        
        state["order_state"] = order_state
        return state
    
    except Exception as e:
        logger.error("invoke_reroute_failed", order_id=state["order_state"].order_id, error=str(e))
        return state


async def node_record_no_action(state: AgentGraphState) -> AgentGraphState:
    """Record that agent decided no action was needed."""
    try:
        if not state["should_skip"]:
            order_state = state["order_state"]
            order_state.last_decision = "no_action"
            order_state.last_decision_at = datetime.now(timezone.utc)
            
            logger.info(
                "decision_no_action",
                order_id=order_state.order_id,
                risk_score=order_state.current_risk_score,
            )
        
        return state
    
    except Exception as e:
        logger.error("record_no_action_failed", error=str(e))
        return state


async def node_write_audit_log(state: AgentGraphState) -> AgentGraphState:
    """
    Write complete audit log of this agent decision.
    Called on every path through the graph.
    Never fails - best effort logging.
    """
    try:
        if state["should_skip"]:
            return state
        
        order_state = state["order_state"]
        prediction = state["prediction"]
        db_session = state["db_session"]
        
        # Build audit record
        audit_log_id = await write_audit_log(
            order_id=order_state.order_id,
            tenant_id=order_state.tenant_id,
            driver_id=order_state.driver_id,
            decision=order_state.last_decision or "unknown",
            risk_score=order_state.current_risk_score,
            top_risk_factors=[
                {
                    "feature": f["feature"],
                    "contribution": f.get("contribution", 0),
                    "direction": f.get("direction", "neutral"),
                }
                for f in (prediction.top_risk_factors if prediction else [])
            ],
            tools_called=state["tools_called"],
            reroute_result=None,
            notification_result=None,
            db_session=db_session,
            redis_client=state.get("redis_client"),
        )
        
        logger.info(
            "audit_log_written",
            order_id=order_state.order_id,
            audit_log_id=audit_log_id,
        )
        
        return state
    
    except Exception as e:
        # Log but don't fail
        logger.error("write_audit_log_failed", error=str(e))
        return state


# ===== LLM-Powered Analysis Node =====

_llm_analysis_cache: dict[str, float] = {}  # order_id -> timestamp of last LLM call


async def node_analyze_with_llm(state: AgentGraphState) -> AgentGraphState:
    """
    Uses Gemini to analyze high-risk events and generate insights.
    Rate-limited: only runs once per order per 5 minutes.
    Adds llm_insight and llm_recommendations to state.
    """
    try:
        if state["should_skip"]:
            return state

        order_state = state["order_state"]
        prediction = state["prediction"]
        if not order_state or not prediction:
            return state

        order_id = order_state.order_id

        # Rate limit: only run LLM analysis once per order per 5 minutes
        now = time.time()
        last_run = _llm_analysis_cache.get(order_id, 0)
        if now - last_run < 300:
            return state

        # Only analyze high-risk events
        if not prediction.is_high_risk:
            return state

        llm = get_gemini_service()
        if llm._disabled:
            state["llm_insight"] = "LLM unavailable for analysis"
            return state

        context_lines = [
            f"Order: {order_id}",
            f"Driver: {order_state.driver_id}",
            f"Risk Score: {prediction.risk_score:.4f}",
            f"Threshold: {prediction.optimal_threshold:.4f}",
            f"Confidence: {prediction.confidence}",
            f"Estimated Delay: {prediction.predicted_delay_minutes:.0f} minutes",
            f"Speed: {order_state.current_speed_kmh:.1f} km/h",
            f"Route Deviation: {order_state.route_deviation_meters:.0f} meters",
            f"Ping Sequence: {order_state.ping_sequence}",
            f"Stops Completed: {order_state.completed_stops}/{order_state.planned_stops}",
        ]

        if prediction.top_risk_factors:
            context_lines.append("Top SHAP Risk Factors:")
            for f in prediction.top_risk_factors[:5]:
                context_lines.append(f"  - {f['feature']}: contribution={f['contribution']:.4f}, direction={f['direction']}, value={f['value']}")

        context_text = "\n".join(context_lines)

        analysis_prompt = f"""Analyze this delivery risk event and provide operational insight.

## EVENT DATA
{context_text}

## TASK
1. Identify the key risk drivers for this delivery.
2. Suggest specific operational actions.
3. Estimate severity of the risk.

Return valid JSON:
{{
  "risk_drivers": ["driver_1", "driver_2"],
  "suggested_actions": ["action_1", "action_2"],
  "severity": "high|medium|low",
  "operational_insight": "brief insight text"
}}"""

        result = await llm.generate(
            prompt=analysis_prompt,
            required_fields=["risk_drivers", "suggested_actions", "severity", "operational_insight"],
        )

        _llm_analysis_cache[order_id] = now

        if result.structured:
            state["llm_insight"] = result.structured.get("operational_insight", "Analysis complete")
            state["llm_risk_drivers"] = result.structured.get("risk_drivers", [])
            state["llm_suggested_actions"] = result.structured.get("suggested_actions", [])
            state["llm_severity"] = result.structured.get("severity", "medium")
            logger.info(
                "llm_analysis_complete",
                order_id=order_id,
                severity=state["llm_severity"],
                latency_ms=result.latency_ms,
            )
        else:
            state["llm_insight"] = "LLM analysis unavailable"
            logger.warning("llm_analysis_failed", order_id=order_id)

        return state

    except Exception as e:
        logger.error("llm_analysis_error", error=str(e))
        return state


async def node_generate_insight(state: AgentGraphState) -> AgentGraphState:
    """
    Generates a concise natural-language insight for dashboard display.
    Combines ML prediction, SHAP factors, and LLM analysis.
    """
    try:
        if state["should_skip"]:
            return state

        order_state = state["order_state"]
        prediction = state["prediction"]
        llm_insight = state.get("llm_insight", "")

        if not order_state:
            state["generated_insight"] = "No data to generate insight"
            return state

        risk_level = "HIGH" if order_state.current_risk_score > 0.70 else "MEDIUM" if order_state.current_risk_score > 0.30 else "LOW"

        parts = [
            f"Risk Level: {risk_level} (score: {order_state.current_risk_score:.2f})",
        ]

        if llm_insight and llm_insight != "LLM unavailable for analysis" and llm_insight != "LLM analysis unavailable":
            parts.append(f"AI Analysis: {llm_insight}")

        if state.get("llm_suggested_actions"):
            actions = state["llm_suggested_actions"][:2]
            parts.append(f"Suggested: {'; '.join(actions)}")

        if order_state.last_decision:
            parts.append(f"Agent Decision: {order_state.last_decision}")

        if prediction:
            parts.append(f"Confidence: {prediction.confidence}")
            if prediction.risk_score > 0.50:
                factors = [f["feature"] for f in prediction.top_risk_factors[:3]]
                if factors:
                    parts.append(f"Top Factors: {', '.join(factors)}")

        state["generated_insight"] = " | ".join(parts)
        state["risk_level_label"] = risk_level

        return state

    except Exception as e:
        logger.error("generate_insight_error", error=str(e))
        state["generated_insight"] = "Insight generation failed"
        return state

def haversine_distance(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Calculate distance between two lat/lng points in kilometers."""
    R = 6371  # Earth radius in km
    
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lng = math.radians(lng2 - lng1)
    
    a = math.sin(delta_lat / 2) ** 2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lng / 2) ** 2
    c = 2 * math.asin(math.sqrt(a))
    
    return R * c


# ===== Build Graph =====

def build_agent_graph() -> object:
    """Build and compile the agent graph."""
    graph = StateGraph(AgentGraphState)
    
    # Add all nodes
    graph.add_node("update_order_state", node_update_order_state)
    graph.add_node("compute_features", node_compute_features)
    graph.add_node("run_prediction", node_run_prediction)
    graph.add_node("analyze_with_llm", node_analyze_with_llm)
    graph.add_node("generate_insight", node_generate_insight)
    graph.add_node("evaluate_risk", node_prepare_risk_decision)
    graph.add_node("alert_customer", node_alert_customer)
    graph.add_node("invoke_reroute", node_invoke_reroute)
    graph.add_node("record_no_action", node_record_no_action)
    graph.add_node("write_audit_log", node_write_audit_log)
    
    # Set entry point
    graph.set_entry_point("update_order_state")
    
    # Linear edges
    graph.add_edge("update_order_state", "compute_features")
    graph.add_edge("compute_features", "run_prediction")
    graph.add_edge("run_prediction", "analyze_with_llm")
    graph.add_edge("analyze_with_llm", "generate_insight")
    graph.add_edge("generate_insight", "evaluate_risk")
    
    # Conditional edges from evaluate_risk
    graph.add_conditional_edges(
        "evaluate_risk",
        node_evaluate_risk,
        {
            "no_action": "record_no_action",
            "alert_only": "alert_customer",
            "reroute_and_alert": "invoke_reroute",
        }
    )
    
    # End paths
    graph.add_edge("record_no_action", "write_audit_log")
    graph.add_edge("invoke_reroute", "alert_customer")
    graph.add_edge("alert_customer", "write_audit_log")
    graph.add_edge("write_audit_log", END)
    
    return graph.compile()
