"""
src/api/live_tracking.py

🚚 Live Tracking Simulator for IntelliLog-AI (v3.3.2 — Dynamic Fleet Edition)

Enhancements over v3.3:
-----------------------
✔ Dynamic reinitialization when driver count changes (thread-safe)
✔ Smooth fractional interpolation with continuous motion
✔ Deterministic simulation seed reset (stable demo)
✔ Robust /routes input validation and feedback
✔ Fully synchronized with Streamlit v3.3.1 dashboard

Endpoints:
    GET  /live_tracking?drivers=n    -> current simulated positions (n drivers)
    GET  /live_tracking/history      -> last N position updates
    POST /live_tracking/routes       -> assign routes to drivers (optional)
"""

import time
import random
import threading
from typing import Dict, List, Any
from fastapi import APIRouter, Body, Query

router = APIRouter(prefix="/live_tracking", tags=["Live Tracking"])

# -------------------------------------------------------------------
# CONFIGURATION
# -------------------------------------------------------------------
HISTORY_LEN = 50       # keep last 50 updates per driver
STEP_DELAY_SEC = 1     # simulation step (non-blocking)
ROUTE_POINTS = 6       # default waypoints per route
SIM_LOCK = threading.Lock()

# In-memory state
driver_routes: Dict[int, List[Dict[str, float]]] = {}
driver_progress: Dict[int, float] = {}
driver_history: Dict[int, List[Dict[str, Any]]] = {}

# -------------------------------------------------------------------
# INITIALIZATION
# -------------------------------------------------------------------
def _init_default_routes(n_drivers: int = 3, waypoints_per: int = ROUTE_POINTS):
    """Initialize circular routes for each driver (simulated coordinates)."""
    global driver_routes, driver_progress, driver_history
    with SIM_LOCK:
        random.seed(42)  # deterministic for consistency
        base_lat, base_lon = 12.97, 77.59
        driver_routes.clear()
        driver_progress.clear()
        driver_history.clear()

        for d in range(n_drivers):
            route = []
            for i in range(waypoints_per):
                route.append({
                    "lat": base_lat + d * 0.02 + i * 0.004 + random.uniform(-0.001, 0.001),
                    "lon": base_lon + d * 0.02 + i * 0.004 + random.uniform(-0.001, 0.001),
                })
            driver_routes[d] = route
            driver_progress[d] = 0.0
            driver_history[d] = []

# -------------------------------------------------------------------
# HELPER FUNCTIONS
# -------------------------------------------------------------------
def _interp(p0: Dict[str, float], p1: Dict[str, float], frac: float) -> Dict[str, float]:
    """Linear interpolation between two coordinates."""
    lat = p0["lat"] + (p1["lat"] - p0["lat"]) * frac
    lon = p0["lon"] + (p1["lon"] - p0["lon"]) * frac
    return {"lat": lat, "lon": lon}


def _advance_drivers(step_frac: float = 0.25):
    """Advance all drivers along their routes by fractional step."""
    with SIM_LOCK:
        for d, route in driver_routes.items():
            if not route:
                continue
            prog = driver_progress.get(d, 0.0) + step_frac
            if prog >= len(route):
                prog %= len(route)  # loop around
            driver_progress[d] = prog

            idx0 = int(prog) % len(route)
            idx1 = (idx0 + 1) % len(route)
            frac = prog - int(prog)
            pos = _interp(route[idx0], route[idx1], frac)
            remaining = len(route) - prog
            eta_min = max(1.0, remaining * random.uniform(0.8, 1.4))

            record = {
                "ts": time.strftime("%Y-%m-%d %H:%M:%S"),
                "driver_id": d,
                "lat": round(pos["lat"], 6),
                "lon": round(pos["lon"], 6),
                "speed_kmph": round(random.uniform(25, 60), 1),
                "eta_min": round(eta_min, 1),
            }

            hist = driver_history.setdefault(d, [])
            hist.append(record)
            if len(hist) > HISTORY_LEN:
                hist.pop(0)

# -------------------------------------------------------------------
# ENDPOINT: ASSIGN ROUTES
# -------------------------------------------------------------------
@router.post("/routes", summary="Assign routes to drivers")
def assign_routes(routes: Dict[str, List[Dict[str, float]]] = Body(...)):
    """
    Assign custom routes to drivers via POST body.
    Example:
    {
      "0": [{"lat": 12.97, "lon": 77.59}, {"lat": 12.98, "lon": 77.60}],
      "1": [{"lat": 12.99, "lon": 77.61}]
    }
    """
    global driver_routes, driver_progress, driver_history
    with SIM_LOCK:
        try:
            if not isinstance(routes, dict) or not routes:
                return {"status": "error", "message": "Invalid format or empty routes"}

            driver_routes.clear()
            driver_progress.clear()
            driver_history.clear()

            assigned = 0
            for k, waypoints in routes.items():
                try:
                    did = int(k)
                except Exception:
                    continue
                if not isinstance(waypoints, list) or not waypoints:
                    continue
                valid_points = [p for p in waypoints if "lat" in p and "lon" in p]
                if not valid_points:
                    continue
                driver_routes[did] = valid_points
                driver_progress[did] = 0.0
                driver_history[did] = []
                assigned += 1

            return {
                "status": "ok",
                "message": f"Routes assigned to {assigned} drivers",
                "n_drivers": assigned
            }
        except Exception as e:
            return {"status": "error", "message": str(e)}

# -------------------------------------------------------------------
# ENDPOINT: LIVE TRACKING (DYNAMIC)
# -------------------------------------------------------------------
@router.get("/", summary="Get current live positions (dynamic driver count)")
def live_tracking(drivers: int = Query(3, description="Number of drivers to simulate")):
    """
    Returns current simulated positions for all drivers.
    Example: /live_tracking?drivers=8
    Automatically reinitializes when driver count changes.
    """
    global driver_routes, driver_progress, driver_history

    with SIM_LOCK:
        # reinitialize if empty or driver count changed
        if not driver_routes or len(driver_routes) != drivers:
            _init_default_routes(n_drivers=drivers, waypoints_per=ROUTE_POINTS)

        # smooth randomized movement
        _advance_drivers(step_frac=random.uniform(0.15, 0.4))

        driver_list = []
        for d in sorted(driver_routes.keys()):
            hist = driver_history.get(d, [])
            if hist:
                current = hist[-1]
                driver_list.append({
                    "driver_id": current["driver_id"],
                    "lat": current["lat"],
                    "lon": current["lon"],
                    "speed_kmph": current["speed_kmph"],
                    "eta_min": current["eta_min"],
                })

    return {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "n_drivers": len(driver_list),
        "drivers": driver_list,
        "message": f"ok ({len(driver_list)} drivers active)"
    }

# -------------------------------------------------------------------
# ENDPOINT: HISTORY
# -------------------------------------------------------------------
@router.get("/history", summary="Get recent position history (per driver)")
def live_history(limit: int = Query(20, description="Number of recent points per driver")):
    """Return last N position updates for all drivers."""
    with SIM_LOCK:
        out = {d: hist[-limit:] for d, hist in driver_history.items()}
        return {
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
            "history": out,
            "n_drivers": len(driver_history),
        }
