"""
src/dashboard/app.py

🚚 IntelliLog-AI — Intelligent Logistics & Delivery Optimization Dashboard (v3.3.3 Pro)
Author: Vivek Marri

Overview:
    IntelliLog-AI is an AI-powered Smart Fleet Command Center designed for real-time logistics management,
    route optimization, predictive delivery analytics, and explainable ML insights.

Features:
    • 🚀 Predictive Delivery Time Estimation (XGBoost Model)
    • 🧭 Route Optimization & Visualization (Greedy / OR-Tools / OSRM Integration)
    • 🚦 Live Fleet Tracking & Telemetry Simulation
    • 🧠 Explainable AI using SHAP (Global + Local Feature Analysis)
    • 📊 Advanced Analytics Dashboard for delivery metrics and route distribution

Notes:
    • Uses OSRM (Open Source Routing Machine) for realistic road geometry visualization.
    • Fully compatible with both simulated and live backend APIs.
    • Built for enterprise-grade logistics visualization with responsive Streamlit UI.

Backend API Endpoints:
    GET    /metrics                     → API health and performance metrics
    POST   /predict_delivery_time       → Delivery time predictions (AI model)
    POST   /plan_routes                 → Multi-driver route optimization
    GET    /live_tracking?drivers=<n>   → Real-time driver telemetry and fleet status
    POST   /predict_explain             → SHAP-based model explainability insights

Release:
    IntelliLog-AI v3.3.3 Pro — Optimized for Deployment, Visualization, and Explainability

Developed By:
    Vivek Marri
    (AI Engineer & Developer — Intelligent Logistics Systems)
"""

import os
import io
import random
from typing import List, Tuple, Dict, Any
from datetime import datetime

import numpy as np
import pandas as pd
import requests
import streamlit as st
import plotly.express as px
import plotly.graph_objects as go
import folium
from streamlit_folium import st_folium
from PIL import Image, ImageDraw, ImageFont
from streamlit_autorefresh import st_autorefresh

# ----------------------------------------------------------------
# CONFIG
# ----------------------------------------------------------------
API_URL = os.getenv("API_URL", "http://127.0.0.1:8000")
OSRM_URL = os.getenv("OSRM_URL", "http://router.project-osrm.org")
st.set_page_config(
    page_title="IntelliLog-AI — Smart Logistics & Delivery Optimization",
    layout="wide",
    page_icon="🚚"
)

# ----------------------------------------------------------------
# CUSTOM STYLES
# ----------------------------------------------------------------
st.markdown("""
<style>
/* Global Font + Background */
html, body, [class*="css"] {
    font-family: 'Inter', sans-serif;
}
body {
    background-color: #f8f9fb;
}

/* Header Styling */
.main-header {
    text-align: center;
    padding: 0.8rem 0;
    background: linear-gradient(90deg, #004e92, #000428);
    color: white;
    border-radius: 12px;
    margin-bottom: 1rem;
    box-shadow: 0 3px 10px rgba(0,0,0,0.15);
}
.main-header h1 {
    color: #ffffff;
    font-size: 2.3rem;
    margin-bottom: 0.1rem;
    font-weight: 700;
    letter-spacing: 0.5px;
}
.main-header p {
    color: #dcdcdc;
    font-size: 0.95rem;
    margin-top: 0;
}

/* Sidebar Style */
section[data-testid="stSidebar"] {
    background: linear-gradient(180deg, #001f3f, #003366);
    color: white !important;
}
section[data-testid="stSidebar"] .st-radio label,
section[data-testid="stSidebar"] .st-slider label,
section[data-testid="stSidebar"] .stFileUploader label {
    color: #e5e5e5 !important;
}
section[data-testid="stSidebar"] .stSlider > div {
    color: white !important;
}
section[data-testid="stSidebar"] h1, h2, h3 {
    color: white !important;
}

/* Expander Style */
.streamlit-expanderHeader {
    background: #003366 !important;
    color: white !important;
    font-weight: 600 !important;
    border-radius: 8px;
}
</style>
""", unsafe_allow_html=True)

# ----------------------------------------------------------------
# HEADER
# ----------------------------------------------------------------
st.markdown("""
<div class="main-header">
    <h1>IntelliLog-AI</h1>
    <p>AI-Powered Logistics • Predictive Routing • Fleet Optimization • Explainable ML Analytics</p>
</div>
""", unsafe_allow_html=True)

# ----------------------------------------------------------------
# SIDEBAR
# ----------------------------------------------------------------
st.sidebar.header("⚙️ Configuration Panel")
st.sidebar.markdown(
    "<small>Set up your order input and simulation options below.</small>",
    unsafe_allow_html=True
)

source = st.sidebar.radio("📦 Input Source", ["Simulate Orders", "Upload CSV"])

if source == "Upload CSV":
    uploaded = st.sidebar.file_uploader("📁 Upload orders CSV file", type=["csv"])
    if "uploaded_df" not in st.session_state:
        st.session_state["uploaded_df"] = None

    if uploaded:
        try:
            df = pd.read_csv(uploaded)
            st.session_state["uploaded_df"] = df
            st.sidebar.success(f"✅ Loaded {len(df)} records successfully.")
        except Exception as e:
            st.sidebar.error(f"❌ Failed to read CSV: {e}")
            st.stop()
    elif st.session_state["uploaded_df"] is not None:
        df = st.session_state["uploaded_df"]
        st.sidebar.success(f"✅ Loaded cached dataset ({len(df)} records).")
    else:
        st.sidebar.info("📄 Please upload a valid CSV file to continue.")
        st.stop()

else:
    # Small demo dataset (for quick testing)
    df = pd.DataFrame([
        {
            "order_id": f"O000{i}",
            "lat": 12.97 + i * 0.003,
            "lon": 77.59 + i * 0.003,
            "distance_km": 1.5 + i * 0.8,
            "traffic": np.random.choice(["low", "medium", "high"]),
            "weather": np.random.choice(["clear", "rain"]),
            "order_type": np.random.choice(["normal", "express"])
        }
        for i in range(1, 9)
    ])
    st.sidebar.success("✅ Using simulated demo orders (8 orders generated).")

refresh_sec = st.sidebar.slider("🔁 Auto-refresh Interval (seconds)", 3, 30, 6)

st.sidebar.markdown("""
---
**Expected CSV Columns:**
- `order_id`
- `lat`, `lon`
- `distance_km`
- `traffic`
- `weather`
- `order_type`
""")

# ----------------------------------------------------------------
# SESSION STATE
# ----------------------------------------------------------------
defaults = {
    "df_preds": None,
    "routes": [],
    "live_positions": [],
    "telemetry": [],
    "live_running": False,
    "fleet_paused": False,
    "last_shap_data": None,
}
for k, v in defaults.items():
    if k not in st.session_state:
        st.session_state[k] = v

# ----------------------------------------------------------------
# UTILITIES
# ----------------------------------------------------------------
@st.cache_data
def make_avatar(driver_id: int, size: int = 90) -> Image.Image:
    colors = [(45,152,218), (246,128,89), (117,201,136), (168,111,214), (255,199,64)]
    bg = colors[int(driver_id) % len(colors)]
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.ellipse((0, 0, size, size), fill=bg + (255,))
    text = f"D{driver_id}"
    try:
        font = ImageFont.truetype("DejaVuSans-Bold.ttf", int(size * 0.36))
    except Exception:
        font = ImageFont.load_default()
    try:
        bbox = draw.textbbox((0, 0), text, font=font)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    except Exception:
        tw, th = font.getsize(text)
    draw.text(((size - tw) / 2, (size - th) / 2), text, fill="white", font=font)
    return img

def safe_api_post(path: str, payload: dict, timeout: int = 20):
    try:
        return requests.post(f"{API_URL}{path}", json=payload, timeout=timeout)
    except Exception:
        return None

def safe_api_get(path: str, timeout: int = 5):
    try:
        return requests.get(f"{API_URL}{path}", timeout=timeout)
    except Exception:
        return None

def simulate_live_positions(drivers=3):
    return [{
        "driver_id": i,
        "lat": 12.97 + random.uniform(-0.02, 0.02),
        "lon": 77.59 + random.uniform(-0.02, 0.02),
        "eta_min": round(random.uniform(5, 30), 1),
        "speed_kmph": round(random.uniform(20, 60), 1)
    } for i in range(drivers)]

# OSRM route geometry helper (returns list of (lat, lon) tuples)
@st.cache_data(show_spinner=False)
def osrm_route_geometry(coord_pairs: List[Tuple[float, float]]) -> List[Tuple[float, float]]:
    if len(coord_pairs) < 2:
        return []
    full_coords = []
    try:
        for i in range(len(coord_pairs) - 1):
            a_lat, a_lon = coord_pairs[i]
            b_lat, b_lon = coord_pairs[i + 1]
            url = f"{OSRM_URL}/route/v1/driving/{a_lon},{a_lat};{b_lon},{b_lat}?overview=full&geometries=geojson"
            r = requests.get(url, timeout=8)
            if r.status_code != 200:
                return []
            data = r.json()
            seg_coords = data["routes"][0]["geometry"]["coordinates"]
            seg_latlon = [(lat, lon) for lon, lat in seg_coords]
            if full_coords and seg_latlon:
                full_coords.extend(seg_latlon[1:])
            else:
                full_coords.extend(seg_latlon)
        return full_coords
    except Exception:
        return []

# Utility: map order_id sequence to lat/lon list preserving order
def orderid_sequence_to_coords(order_seq: List[str], orders_df: pd.DataFrame) -> List[Tuple[float, float]]:
    coords = []
    order_lookup = orders_df.set_index("order_id")[["lat", "lon"]].to_dict(orient="index")
    for oid in order_seq:
        if oid in order_lookup:
            row = order_lookup[oid]
            coords.append((float(row["lat"]), float(row["lon"])))
    return coords

# Defensive formatting of API routes payloads
def normalize_routes_response(routes_raw: Any, orders_df: pd.DataFrame) -> List[Dict[str, Any]]:
    routes_out = []
    try:
        if isinstance(routes_raw, dict):
            routes_raw = list(routes_raw.values())
        for idx, r in enumerate(routes_raw):
            out = {"driver": idx, "route_ids": [], "waypoints": [], "load": 0}
            if isinstance(r, dict):
                if "route" in r:
                    out["route_ids"] = [str(x) for x in r["route"]]
                    out["waypoints"] = orderid_sequence_to_coords(out["route_ids"], orders_df)
                elif "waypoints" in r:
                    wp = [(float(wp["lat"]), float(wp["lon"])) for wp in r["waypoints"]]
                    out["waypoints"] = wp
                out["load"] = len(out["waypoints"])
            elif isinstance(r, list):
                out["route_ids"] = [str(x) for x in r]
                out["waypoints"] = orderid_sequence_to_coords(out["route_ids"], orders_df)
                out["load"] = len(out["route_ids"])
            routes_out.append(out)
    except Exception:
        routes_out = [{
            "driver": 0,
            "route_ids": orders_df["order_id"].tolist(),
            "waypoints": list(orders_df[["lat", "lon"]].itertuples(index=False, name=None)),
            "load": len(orders_df)
        }]
    return routes_out

# ----------------------------------------------------------------
# API HEALTH CHECK
# ----------------------------------------------------------------
with st.expander("📊 API Health Status", expanded=False):
    res = safe_api_get("/metrics")
    st_autorefresh(interval=60000, key="api_health_refresh")
    if not res:
        st.error("❌ API offline or unreachable.")
    elif res.status_code == 200:
        try:
            st.success("✅ API Online")
            st.json(res.json())
        except Exception:
            st.info("✅ API Online (unstructured payload)")
    else:
        st.warning(f"⚠️ API Error: {res.status_code}")

# ----------------------------------------------------------------
# TABS
# ----------------------------------------------------------------
tab1, tab2, tab3, tab4, tab5 = st.tabs([
    "🤖 **Predict**",
    "🧭 **Optimize**",
    "🚦 **Fleet Control**",
    "🧠 **Explainability (SHAP)**",
    "📊 **Analytics Dashboard**"
])

# ----------------------------------------------------------------
# TAB 1 — PREDICT (Enhanced v3.3.3)
# ----------------------------------------------------------------
with tab1:
    st.subheader("⚡ Predict Delivery Times (XGBoost Model)")
    st.write("Send orders to the model endpoint for AI-based predicted delivery times.")

    if st.button("🔮 Run Prediction"):
        payload = {"orders": df.to_dict(orient="records")}

        with st.spinner("Running model prediction... please wait ⏳"):
            res = safe_api_post("/predict_delivery_time", payload)

        if res and res.status_code == 200:
            try:
                preds = pd.DataFrame(res.json())

                # Ensure non-empty results
                if preds.empty:
                    st.warning("⚠️ Prediction API returned empty results.")
                    st.stop()

                # Add timestamp for later analytics
                preds["timestamp"] = pd.Timestamp.now().strftime("%Y-%m-%d %H:%M:%S")

                st.session_state["df_preds"] = preds
                st.success("✅ Predictions generated successfully!")
                st.dataframe(preds, use_container_width=True)

                # Quick stats
                st.markdown("#### 📈 Summary Statistics")
                st.dataframe(preds.describe().T, use_container_width=True)

            except Exception as e:
                st.error(f"Prediction API returned malformed payload: {e}")
        else:
            # Local mock fallback
            st.warning("⚠️ Prediction API unavailable. Using local mock predictions.")
            df_mock = df.copy()
            df_mock["predicted_delivery_time_min"] = np.random.uniform(10, 45, len(df_mock)).round(2)
            df_mock["timestamp"] = pd.Timestamp.now().strftime("%Y-%m-%d %H:%M:%S")
            st.session_state["df_preds"] = df_mock
            st.success("✅ Mock predictions generated locally.")
            st.dataframe(df_mock, use_container_width=True)

            st.markdown("#### 📈 Summary Statistics (Mock Data)")
            st.dataframe(df_mock.describe().T, use_container_width=True)

# ----------------------------------------------------------------
# TAB 2 — ROUTE OPTIMIZATION (Enhanced v3.3.3)
# ----------------------------------------------------------------
import geopy.distance

def route_distance_km(wp):
    """Approximate total travel distance (km) for waypoints list."""
    if len(wp) < 2:
        return 0
    try:
        return sum(geopy.distance.distance(wp[i], wp[i+1]).km for i in range(len(wp)-1))
    except Exception:
        return 0

with tab2:
    st.subheader("🧭 Route Optimization & Visualization")

    drivers = st.number_input(
        "Number of Drivers", 
        min_value=1, 
        max_value=20, 
        value=3, 
        help="How many active drivers to plan for"
    )

    method = st.selectbox(
        "Optimization Method", 
        ["greedy", "ortools"], 
        help="Select backend optimization algorithm"
    )

    if st.button("🗺️ Optimize Routes"):
        payload = {"orders": df.to_dict("records"), "drivers": int(drivers), "method": method}

        with st.spinner("Optimizing routes... please wait ⏳"):
            res = safe_api_post("/plan_routes", payload, timeout=30)

        if res and res.status_code == 200:
            try:
                raw_routes = res.json().get("routes", res.json())
                normalized = normalize_routes_response(raw_routes, df)
                st.session_state["routes"] = normalized
                st.success(f"✅ {len(normalized)} optimized routes received from API!")
            except Exception as e:
                st.error(f"Malformed route response: {e}")
                st.session_state["routes"] = [
                    {
                        "driver": i,
                        "route_ids": [],
                        "waypoints": list(df[["lat", "lon"]].itertuples(index=False, name=None)),
                        "load": len(df)
                    }
                    for i in range(min(int(drivers), len(df)))
                ]
        else:
            st.warning("⚠️ API unavailable. Generating mock routes locally (fallback mode).")

            # Simple greedy fallback routing
            order_ids = df["order_id"].tolist()
            chunks = [[] for _ in range(int(drivers))]
            for i, oid in enumerate(order_ids):
                chunks[i % int(drivers)].append(oid)

            normalized = []
            for i, ch in enumerate(chunks):
                normalized.append({
                    "driver": i,
                    "route_ids": ch,
                    "waypoints": orderid_sequence_to_coords(ch, df),
                    "load": len(ch)
                })

            st.session_state["routes"] = normalized
            st.success("✅ Mock routes created successfully.")

    # ----------------------------------------------------------------
    # Display Route Visualization
    # ----------------------------------------------------------------
    routes = st.session_state.get("routes", [])

    if routes:
        st.subheader("📍 Optimized Route Map (with OSRM road geometry when available)")

        # Folium Map Initialization
        m = folium.Map(
            location=[df["lat"].mean(), df["lon"].mean()],
            zoom_start=12,
            control_scale=True
        )
        colors = ["red", "blue", "green", "purple", "orange", "darkred",
                  "cadetblue", "darkgreen", "beige", "pink", "gray"]

        # Build route summary data
        route_summary = []

        for r in routes:
            idx = r.get("driver", 0)
            color = colors[idx % len(colors)]
            wp = r.get("waypoints", [])

            # If waypoints empty but route_ids exist, generate coords
            if not wp and r.get("route_ids"):
                wp = orderid_sequence_to_coords(r["route_ids"], df)

            geom = osrm_route_geometry(wp) if len(wp) >= 2 else []

            if geom:
                folium.PolyLine(
                    geom,
                    color=color,
                    weight=5,
                    opacity=0.85,
                    tooltip=f"Driver {idx} (OSRM route)"
                ).add_to(m)
            elif len(wp) >= 2:
                folium.PolyLine(
                    wp,
                    color=color,
                    weight=4,
                    opacity=0.7,
                    tooltip=f"Driver {idx} (straight line)"
                ).add_to(m)
                st.info(f"Driver {idx}: OSRM unavailable, showing straight-line route.")

            # Add numbered stop markers
            for j, (lat, lon) in enumerate(wp):
                folium.CircleMarker(
                    location=[lat, lon],
                    radius=6,
                    color=color,
                    fill=True,
                    fill_opacity=0.9,
                    popup=f"Driver {idx} Stop {j+1}"
                ).add_to(m)

            # Add start marker
            if wp:
                folium.Marker(
                    location=[wp[0][0], wp[0][1]],
                    popup=f"Driver {idx} Start",
                    icon=folium.Icon(color=color, icon="play")
                ).add_to(m)

            # Route summary for analytics
            route_summary.append({
                "Driver": f"Driver {idx}",
                "Stops": len(r.get("route_ids", [])),
                "Distance (km)": round(route_distance_km(wp), 2),
                "Load": r.get("load", 0)
            })

        # Display route map
        st_folium(m, width=950, height=550)

        # Display Route Summary Table
        if route_summary:
            st.markdown("#### 🚛 Route Summary Overview")
            route_df = pd.DataFrame(route_summary)
            st.dataframe(route_df, use_container_width=True)
    else:
        st.info("No optimized routes available. Click '🗺️ Optimize Routes' to generate.")

# ----------------------------------------------------------------
# TAB 3 — FLEET CONTROL (v3.3.3 PRO — Fixed & Enhanced)
# ----------------------------------------------------------------
with tab3:
    st.subheader("🚦 Fleet Control & Telemetry")

    # Fleet Control Buttons
    c1, c2, c3, c4 = st.columns(4)
    if c1.button("▶️ Start Fleet"):
        st.session_state["live_running"] = True
        st.session_state["fleet_paused"] = False
    if c2.button("⏸️ Pause"):
        st.session_state["fleet_paused"] = True
    if c3.button("🔄 Resume"):
        st.session_state["fleet_paused"] = False
    if c4.button("🛑 Stop"):
        st.session_state["live_running"] = False
        st.session_state["live_positions"] = []
        st.session_state["telemetry"] = []
        st.session_state["last_update"] = None

    running, paused = st.session_state["live_running"], st.session_state["fleet_paused"]

    # Status Indicator
    if running and not paused:
        st.markdown("🟢 **Fleet Status:** Running")
    elif paused:
        st.markdown("🟡 **Fleet Status:** Paused")
    else:
        st.markdown("🔴 **Fleet Status:** Stopped")

    # Request live positions
    if running and not paused:
        _ = st_autorefresh(interval=refresh_sec * 1000, key="fleet_refresh_v3", limit=1000)
        if not running:
            st_autorefresh(interval=0, key="fleet_refresh_stop")
        res = safe_api_get(f"/live_tracking?drivers={int(drivers)}", timeout=6)
        if res and res.status_code == 200:
            try:
                live = res.json().get("drivers", [])
                for drv in live:
                    drv["driver_id"] = int(drv.get("driver_id", 0))
                    drv["lat"] = float(drv.get("lat", 0.0))
                    drv["lon"] = float(drv.get("lon", 0.0))
                st.session_state["live_positions"] = live
            except Exception:
                st.warning("Malformed live-tracking response. Using simulator.")
                st.session_state["live_positions"] = simulate_live_positions(int(drivers))
        else:
            st.warning("Live-tracking API unavailable — using simulator.")
            st.session_state["live_positions"] = simulate_live_positions(int(drivers))
        st.session_state["last_update"] = datetime.now().strftime("%H:%M:%S")

    live = st.session_state.get("live_positions", [])

    # Fleet Overview
    st.markdown(f"### 🚚 Active Fleet Overview — {len(live)} Drivers")
    if live:
        for drv in live:
            c1, c2, c3 = st.columns([1, 2, 2])
            did = drv.get("driver_id", 0)
            avatar = make_avatar(did, 80)
            buf = io.BytesIO()
            avatar.save(buf, format="PNG")
            buf.seek(0)
            with c1:
                st.image(buf, width=70)
            with c2:
                st.markdown(f"**Driver {did}**")
                st.metric("Speed (km/h)", drv.get("speed_kmph", "N/A"))
                st.metric("ETA (min)", drv.get("eta_min", "N/A"))
            with c3:
                eff = max(0, min(100, 100 - abs(drv.get("eta_min", 20) - 20) * 2))
                fig = go.Figure(go.Indicator(
                    mode="gauge+number",
                    value=eff,
                    title={'text': f"Driver {did} Efficiency", 'font': {'size': 12}},
                    gauge={'axis': {'range': [0, 100]}, 'bar': {'color': "#1f77b4"}}
                ))
                fig.update_layout(height=120, margin=dict(t=8, b=8, l=8, r=8))
                st.plotly_chart(fig, use_container_width=True)
    else:
        st.info("No active drivers. Start fleet to begin tracking.")

    # ----------------------------------------------------------------
    # Fleet Map + Heatmap Visualization
    # ----------------------------------------------------------------
    st.markdown("### 🗺️ Fleet Map & Movement History")
    m = folium.Map(location=[df["lat"].mean(), df["lon"].mean()], zoom_start=12)

    # Add live driver markers
    for drv in live:
        try:
            folium.Marker(
                [drv["lat"], drv["lon"]],
                popup=f"Driver {drv['driver_id']} | ETA: {drv['eta_min']} min | Speed: {drv['speed_kmph']} km/h",
                icon=folium.Icon(color="blue", icon="truck", prefix="fa")
            ).add_to(m)
        except Exception:
            continue

    # Add heatmap for historical movement
    hist_res = safe_api_get("/live_tracking/history", timeout=6)
    if hist_res and hist_res.status_code == 200:
        try:
            from folium.plugins import HeatMap
            hist_data = hist_res.json().get("history", {})
            heat_points = [(h["lat"], h["lon"]) for d in hist_data.values() for h in d]
            if heat_points:
                HeatMap(heat_points, radius=10, blur=15, gradient={
                    0.4: 'blue', 0.65: 'lime', 1: 'red'
                }).add_to(m)
            else:
                st.info("Heatmap will populate after a few updates.")
        except Exception:
            st.info("No heatmap data available yet (history endpoint not active).")

    # Force refresh map on every live update
    st_folium(m, width=950, height=520, key=f"fleet_map_{random.randint(0,10000)}")

    # Timestamp
    if st.session_state.get("last_update"):
        st.caption(f"⏱️ Last Updated: {st.session_state['last_update']}")



# ----------------------------------------------------------------
# TAB 4 — EXPLAINABILITY (SHAP) — Enhanced v3.3.3
# ----------------------------------------------------------------
with tab4:
    st.subheader("🧠 Explainability (Global + Local SHAP Insights)")
    st.markdown("Use this section to interpret how the model makes predictions — both globally and for each individual order.")

    if st.button("📊 Generate SHAP Insights"):
        payload = {"orders": df.to_dict(orient="records")}
        res = safe_api_post("/predict_explain", payload, timeout=30)

        if res and res.status_code == 200:
            try:
                data = res.json().get("explanation", {})
                vals = np.array(data.get("shap_values", []))
                feats = data.get("feature_names", [])
                st.session_state["last_shap_data"] = (feats, vals)

                if vals.size:
                    # -----------------------------
                    # Global SHAP Importance (Top 10)
                    # -----------------------------
                    imp = np.mean(np.abs(vals), axis=0)
                    imp_df = pd.DataFrame({"Feature": feats, "Importance": imp})
                    imp_df = imp_df.sort_values("Importance", ascending=False).head(10)
                    fig = px.bar(
                        imp_df,
                        x="Importance",
                        y="Feature",
                        orientation="h",
                        title="🌍 Top 10 Features by Mean |SHAP| Importance",
                        color="Importance",
                        color_continuous_scale="Blues"
                    )
                    fig.update_layout(yaxis={'categoryorder': 'total ascending'})
                    st.plotly_chart(fig, use_container_width=True)

                    # -----------------------------
                    # Global SHAP Summary Plot
                    # -----------------------------
                    st.markdown("#### 🎯 Global SHAP Summary Distribution")
                    shap_df = pd.DataFrame(vals, columns=feats)
                    fig_summary = px.box(
                        shap_df.melt(var_name="Feature", value_name="SHAP Value"),
                        x="Feature",
                        y="SHAP Value",
                        color="Feature",
                        title="SHAP Value Distribution per Feature",
                        points="all"
                    )
                    fig_summary.update_layout(showlegend=False)
                    st.plotly_chart(fig_summary, use_container_width=True)

                    # -----------------------------
                    # Local SHAP Breakdown (Interactive)
                    # -----------------------------
                    st.markdown("#### 🔍 Local Instance Explanation")
                    instance_idx = st.number_input(
                        "Select Instance Index",
                        0, vals.shape[0]-1, 0,
                        help="Choose which order’s SHAP values to inspect"
                    )
                    local_vals = vals[int(instance_idx)]
                    local_df = pd.DataFrame({
                        "Feature": feats,
                        "SHAP Value": local_vals
                    }).sort_values("SHAP Value", ascending=False)

                    fig_local = px.bar(
                        local_df,
                        x="SHAP Value",
                        y="Feature",
                        orientation="h",
                        color="SHAP Value",
                        color_continuous_scale="RdYlGn",
                        title=f"Local SHAP Explanation — Instance {instance_idx}"
                    )
                    fig_local.update_layout(yaxis={'categoryorder': 'total ascending'})
                    st.plotly_chart(fig_local, use_container_width=True)

                    st.dataframe(
                        local_df.style.background_gradient(cmap="RdYlGn").format(precision=4),
                        use_container_width=True
                    )

                else:
                    st.warning("⚠️ No SHAP values found in the API response.")

            except Exception as e:
                st.error(f"❌ Error while parsing explainability response: {e}")
        else:
            st.warning("⚠️ Explainability API unavailable. Ensure model + SHAP are correctly installed on the server.")

# ----------------------------------------------------------------
# TAB 5 — ANALYTICS (Enhanced v3.3.3)
# ----------------------------------------------------------------
with tab5:
    st.subheader("📊 Advanced Analytics Dashboard")

    preds = st.session_state.get("df_preds")
    routes = st.session_state.get("routes", [])

    if preds is not None and not preds.empty:
        # ------------------------------------------------------------
        # 1️⃣ KPI METRICS
        # ------------------------------------------------------------
        avg_time = preds["predicted_delivery_time_min"].mean()
        max_time = preds["predicted_delivery_time_min"].max()
        min_time = preds["predicted_delivery_time_min"].min()
        num_routes = len(routes) if routes else 0
        total_orders = len(preds)

        c1, c2, c3, c4 = st.columns(4)
        c1.metric("📦 Total Orders", f"{total_orders}")
        c2.metric("⏱️ Avg Delivery Time", f"{avg_time:.2f} min")
        c3.metric("🚚 Max Predicted Time", f"{max_time:.2f} min")
        c4.metric("🗺️ Active Routes", f"{num_routes}")

        st.markdown("---")

        # ------------------------------------------------------------
        # 2️⃣ DISTRIBUTIONS AND RELATIONSHIPS
        # ------------------------------------------------------------
        c1, c2 = st.columns(2)
        with c1:
            fig = px.histogram(
                preds,
                x="predicted_delivery_time_min",
                nbins=10,
                title="Delivery Time Distribution",
                color_discrete_sequence=["#1f77b4"]
            )
            fig.update_layout(xaxis_title="Predicted Delivery Time (min)", yaxis_title="Count")
            st.plotly_chart(fig, use_container_width=True)

        with c2:
            if "distance_km" in preds.columns:
                fig2 = px.scatter(
                    preds,
                    x="distance_km",
                    y="predicted_delivery_time_min",
                    title="Distance vs Predicted Time",
                    trendline="ols",
                    color_discrete_sequence=["#ff7f0e"]
                )
                fig2.update_layout(xaxis_title="Distance (km)", yaxis_title="Predicted Time (min)")
                st.plotly_chart(fig2, use_container_width=True)

        st.markdown("---")

        # ------------------------------------------------------------
        # 3️⃣ SUMMARY STATISTICS
        # ------------------------------------------------------------
        st.markdown("#### 📈 Summary Statistics")
        summary_df = preds["predicted_delivery_time_min"].describe().to_frame().T
        st.dataframe(summary_df.style.format(precision=2), use_container_width=True)

        st.markdown("---")

        # ------------------------------------------------------------
        # 4️⃣ DRIVER ROUTE DISTRIBUTION
        # ------------------------------------------------------------
        if routes:
            route_loads = [r.get("load", 0) for r in routes]
            labels = [f"Driver {r.get('driver', i)}" for i, r in enumerate(routes)]
            fig = px.pie(
                values=route_loads,
                names=labels,
                title="Driver Route Distribution",
                hole=0.3,
                color_discrete_sequence=px.colors.qualitative.Bold
            )
            fig.update_traces(textinfo="percent+label")
            st.plotly_chart(fig, use_container_width=True)

        st.markdown("---")

        # ------------------------------------------------------------
        # 5️⃣ CORRELATION HEATMAP (Feature Insights)
        # ------------------------------------------------------------
        st.markdown("#### 🔗 Feature Correlation Heatmap")
        num_cols = preds.select_dtypes(include=np.number).columns
        if len(num_cols) > 1:
            corr = preds[num_cols].corr()
            fig_corr = px.imshow(
                corr,
                text_auto=True,
                color_continuous_scale="RdBu_r",
                title="Feature Correlation Matrix"
            )
            st.plotly_chart(fig_corr, use_container_width=True)
        else:
            st.info("Not enough numeric features to compute correlations.")

        st.markdown("---")

        # ------------------------------------------------------------
        # 6️⃣ DELIVERY TYPE ANALYSIS (if available)
        # ------------------------------------------------------------
        if "order_type" in preds.columns:
            st.markdown("#### 🧩 Delivery Time Comparison by Order Type")
            fig3 = px.box(
                preds,
                x="order_type",
                y="predicted_delivery_time_min",
                color="order_type",
                title="Delivery Time Distribution by Order Type",
                color_discrete_sequence=px.colors.qualitative.Set2
            )
            fig3.update_layout(xaxis_title="Order Type", yaxis_title="Predicted Delivery Time (min)")
            st.plotly_chart(fig3, use_container_width=True)

        st.markdown("---")

        # ------------------------------------------------------------
        # 7️⃣ OPTIONAL: TIME TREND ANALYSIS (if timestamps exist)
        # ------------------------------------------------------------
        if "timestamp" in preds.columns:
            st.markdown("#### ⏳ Delivery Time Trend Over Time")
            preds["timestamp"] = pd.to_datetime(preds["timestamp"])
            fig4 = px.line(
                preds,
                x="timestamp",
                y="predicted_delivery_time_min",
                title="Delivery Time Trend Over Time",
                markers=True,
                color_discrete_sequence=["#2ca02c"]
            )
            st.plotly_chart(fig4, use_container_width=True)

    else:
        st.info("No predictions available yet. Please run the prediction module first.")

# ----------------------------------------------------------------
# FOOTER
# ----------------------------------------------------------------
st.markdown("---")
st.caption("Developed by Vivek Marri • IntelliLog-AI v3.3.1 © 2025 — AI-Powered Fleet Dashboard")
