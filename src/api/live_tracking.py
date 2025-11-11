"""
src/api/live_tracking.py

Live Tracking Simulator for IntelliLog-AI (v3.2)
- Stores last N positions per driver (history)
- Supports posting driver routes to follow
- Endpoints:
    GET  /live_tracking           -> current simulated positions
    GET  /live_tracking/history   -> historical positions (last N)
    POST /live_tracking/routes    -> assign routes to drivers (optional)
"""

import time
import random
from typing import Dict, List, Any
from fastapi import APIRouter, Body

router = APIRouter(prefix="/live_tracking", tags=["Live Tracking"])

# Config
HISTORY_LEN = 50  # keep last 50 updates per driver
STEP_DELAY_SEC = 1  # internal simulation step (doesn't block API)

# In-memory state
# driver_routes: driver_id -> list of waypoints [{"lat": ..., "lon": ...}, ...]
driver_routes: Dict[int, List[Dict[str, float]]] = {}
# driver_progress: driver_id -> float (position index, fractional for interpolation)
driver_progress: Dict[int, float] = {}
# driver_history: driver_id -> list of historical positions [{ts, lat, lon, speed, eta}, ...]
driver_history: Dict[int, List[Dict[str, Any]]] = {}

# initialize default routes
def _init_default_routes(n_drivers: int = 3, waypoints_per: int = 6):
    base_lat, base_lon = 12.97, 77.59
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

# helper interpolation between two points
def _interp(p0, p1, frac: float):
    lat = p0["lat"] + (p1["lat"] - p0["lat"]) * frac
    lon = p0["lon"] + (p1["lon"] - p0["lon"]) * frac
    return {"lat": lat, "lon": lon}

# advance each driver a step (fractional step)
def _advance_drivers(step_frac: float = 0.25):
    for d, route in driver_routes.items():
        if not route:
            continue
        prog = driver_progress.get(d, 0.0)
        prog += step_frac
        # loop back at end
        if prog >= len(route):
            prog = prog % len(route)
        driver_progress[d] = prog

        # compute interpolated position
        idx0 = int(prog) % len(route)
        idx1 = (idx0 + 1) % len(route)
        frac = prog - int(prog)
        pos = _interp(route[idx0], route[idx1], frac)

        # compute eta roughly = remaining waypoints * random minute factor
        remaining = len(route) - prog
        eta_min = max(0.1, remaining * random.uniform(0.8, 1.6))

        rec = {
            "ts": time.strftime("%Y-%m-%d %H:%M:%S"),
            "driver_id": d,
            "lat": round(pos["lat"], 6),
            "lon": round(pos["lon"], 6),
            "speed_kmph": round(random.uniform(18, 42), 1),
            "eta_min": round(eta_min, 1),
        }

        # push to history (bounded)
        hist = driver_history.setdefault(d, [])
        hist.append(rec)
        if len(hist) > HISTORY_LEN:
            hist.pop(0)

# endpoint: assign routes (POST)
@router.post("/routes", summary="Assign routes to drivers")
def assign_routes(routes: Dict[int, List[Dict[str, float]]] = Body(...)):
    """
    Accepts JSON mapping driver_id -> list of waypoints (each waypoint: {lat, lon})
    Example:
    {
      "0": [{"lat": 12.97, "lon": 77.59}, {"lat": 12.98, "lon": 77.60}],
      "1": [...]
    }
    """
    try:
        # convert keys to int
        for k, v in routes.items():
            did = int(k)
            if not isinstance(v, list) or not v:
                continue
            driver_routes[did] = v
            driver_progress[did] = 0.0
            driver_history[did] = []
        return {"status": "ok", "message": "Routes assigned", "n_drivers": len(driver_routes)}
    except Exception as e:
        return {"status": "error", "message": str(e)}

# endpoint: current positions
@router.get("/", summary="Get current live positions")
def live_tracking():
    """
    Returns current simulated positions for all drivers.
    Example response:
    {
      "timestamp": "...",
      "drivers": [{driver_id, lat, lon, speed_kmph, eta_min}, ...]
    }
    """
    # lazy init
    if not driver_routes:
        _init_default_routes(n_drivers=3, waypoints_per=6)

    # advance simulation by a fractional step (non-blocking)
    _advance_drivers(step_frac=random.uniform(0.2, 0.6))

    drivers = []
    for d in sorted(driver_routes.keys()):
        hist = driver_history.get(d, [])
        current = hist[-1] if hist else None
        if current:
            drivers.append({
                "driver_id": current["driver_id"],
                "lat": current["lat"],
                "lon": current["lon"],
                "speed_kmph": current["speed_kmph"],
                "eta_min": current["eta_min"],
            })
    return {"timestamp": time.strftime("%Y-%m-%d %H:%M:%S"), "drivers": drivers, "message": "ok"}

# endpoint: get history / replay
@router.get("/history", summary="Get last N position updates (per driver)")
def live_history(limit: int = 20):
    """
    Returns recent history for all drivers (up to limit per driver).
    """
    out = {}
    for d, hist in driver_history.items():
        out[d] = hist[-limit:]
    return {"timestamp": time.strftime("%Y-%m-%d %H:%M:%S"), "history": out}
