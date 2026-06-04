"""
Agent module - Delay prevention agent using LangGraph.

This module implements a stateful, event-driven agent that:
- Consumes GPS ping events from Redis Streams
- Maintains order state in Redis
- Runs ML predictions to assess delay risk
- Autonomously decides whether to reroute, alert, or take no action
- Writes audit logs for all decisions

Main components:
- state.py: OrderAgentState and StateManager for persistence
- tools.py: Agent tools (route optimization, notifications, etc.)
- graph.py: LangGraph agent graph with decision logic
- runner.py: Event loop that consumes GPS pings and invokes the agent
"""

from src.agent.graph import AgentGraphState, build_agent_graph
from src.agent.state import OrderAgentState, StateManager
from src.agent.tools import (
    call_route_optimizer,
    send_customer_notification,
    update_order_eta,
    write_audit_log,
)

__all__ = [
    "OrderAgentState",
    "StateManager",
    "build_agent_graph",
    "AgentGraphState",
    "call_route_optimizer",
    "send_customer_notification",
    "update_order_eta",
    "write_audit_log",
]
