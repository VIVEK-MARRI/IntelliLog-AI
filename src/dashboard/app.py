"""
🚚 IntelliLog-AI Dashboard v4.5 — Smart Fleet Command Center (Final Release)
Author: Vivek Marri
Project: IntelliLog-AI
Features:
 - Real-time ML prediction using XGBoost
 - Route Optimization (Greedy / OR-Tools)
 - Fleet Simulation + Live Telemetry (API or Offline)
 - SHAP Explainability
 - Analytics Dashboard
 - Pillow 10+ compatible avatars
 - Fully responsive Streamlit layout
"""

import os
import io
import random
import time
import traceback
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
st.set_page_config(page_title="IntelliLog-AI v4.5", layout="wide", page_icon="🚚")

TITLE_HTML = """
<h1 style='text-align:center; color:#1f77b4;'>
🚀 IntelliLog-AI — Fleet Command Center (v4.5)
</h1>
"""
st.markdown(TITLE_HTML, unsafe_allow_html=True)
st.caption("Real-Time AI • Route Optimization • Fleet Control • Explainable ML • Telemetry Simulation")

# ----------------------------------------------------------------
# SIDEBAR — Input Data
# ----------------------------------------------------------------
st.sidebar.header("⚙️ Configuration")
source = st.sidebar.radio("Input Source", ["Simulate Orders", "Upload CSV"])
if source == "Upload CSV":
    uploaded = st.sidebar.file_uploader("Upload orders CSV", type=["csv"])
    if uploaded:
        try:
            df = pd.read_csv(uploaded)
        except Exception:
            st.sidebar.error("❌ Invalid CSV. Expected columns: lat, lon, order_id, distance_km, traffic, weather, order_type.")
            st.stop()
    else:
        st.sidebar.info("Upload a CSV file to continue.")
        st.stop()
else:
    df = pd.DataFrame([
        {
            "order_id": f"O000{i}",
            "lat": 12.90 + i * 0.01,
            "lon": 77.60 + i * 0.01,
            "distance_km": 1.5 + i * 0.8,
            "traffic": np.random.choice(["low", "medium", "high"]),
            "weather": np.random.choice(["clear", "rain"]),
            "order_type": np.random.choice(["normal", "express"])
        }
        for i in range(1, 6)
    ])

refresh_sec = st.sidebar.slider("Auto-refresh Interval (seconds)", 3, 30, 6)
dark_mode = st.sidebar.checkbox("🌙 Dark Mode", value=False)

# ----------------------------------------------------------------
# SESSION STATE
# ----------------------------------------------------------------
defaults = {
    "df_preds": None,
    "routes": [],
    "live_positions": [],
    "telemetry": [],
    "live_running": False,
    "fleet_paused": False
}
for k, v in defaults.items():
    if k not in st.session_state:
        st.session_state[k] = v

# ----------------------------------------------------------------
# UTILITIES
# ----------------------------------------------------------------
@st.cache_data
def make_avatar(driver_id: int, size: int = 100) -> Image.Image:
    """Generate circular avatars (compatible with Pillow 10+)."""
    colors = [
        (45, 152, 218), (246, 128, 89), (117, 201, 136),
        (168, 111, 214), (255, 199, 64), (112, 128, 144)
    ]
    bg = colors[int(driver_id) % len(colors)]
    img = Image.new("RGBA", (size, size), (255, 255, 255, 0))
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
    except AttributeError:
        tw, th = draw.textsize(text, font=font)
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
    """Simulate live fleet tracking when API is offline."""
    data = []
    for i in range(drivers):
        lat = 12.90 + random.uniform(-0.01, 0.01)
        lon = 77.60 + random.uniform(-0.01, 0.01)
        data.append({
            "driver_id": i,
            "lat": lat,
            "lon": lon,
            "eta_min": round(random.uniform(5, 30), 1),
            "speed_kmph": round(random.uniform(20, 70), 1),
            "timestamp": datetime.now().isoformat()
        })
    return data

# ----------------------------------------------------------------
# API HEALTH CHECK
# ----------------------------------------------------------------
with st.expander("📊 API Health", expanded=False):
    res = safe_api_get("/metrics")
    if res is None:
        st.error(f"❌ API offline: {API_URL}")
    elif res.status_code == 200:
        st.success("✅ API Online")
        st.json(res.json())
    else:
        st.error(f"⚠️ API Error {res.status_code}: {res.text}")

# ----------------------------------------------------------------
# TABS
# ----------------------------------------------------------------
tab1, tab2, tab3, tab4, tab5 = st.tabs([
    "🤖 Predict", "🧭 Optimize", "🚦 Fleet", "🧠 Explainability", "📊 Analytics"
])

# ----------------------------------------------------------------
# TAB 1: ML Prediction
# ----------------------------------------------------------------
with tab1:
    st.subheader("⚡ Predict Delivery Times (XGBoost)")
    if st.button("🔮 Run Prediction"):
        payload = {"orders": df.to_dict(orient="records")}
        res = safe_api_post("/predict_delivery_time", payload, timeout=25)
        if res and res.status_code == 200:
            preds = pd.DataFrame(res.json())
            st.session_state["df_preds"] = preds
            st.success("✅ Predictions ready.")
            st.dataframe(preds)
            st.download_button("📥 Download CSV", preds.to_csv(index=False).encode("utf-8"), "predictions.csv", "text/csv")
        else:
            st.warning("API unreachable or error. Showing mock predictions.")
            df["predicted_delivery_time_min"] = np.random.uniform(10, 45, len(df))
            st.session_state["df_preds"] = df
            st.dataframe(df)

# ----------------------------------------------------------------
# TAB 2: Route Optimization
# ----------------------------------------------------------------
with tab2:
    st.subheader("🧭 Route Optimization & Visualization")
    drivers = st.number_input("Number of Drivers", 1, 10, 3)
    method = st.selectbox("Optimization Method", ["greedy", "ortools"])
    if st.button("🗺️ Plan Routes"):
        payload = {"orders": df.to_dict("records"), "drivers": int(drivers), "method": method}
        res = safe_api_post("/plan_routes", payload, timeout=30)
        if res and res.status_code == 200:
            st.session_state["routes"] = res.json().get("routes", [])
            st.success(f"✅ {len(st.session_state['routes'])} routes optimized.")
        else:
            st.warning("⚙️ Using mock route simulation.")
            st.session_state["routes"] = [{"route": df["order_id"].tolist()}]

    if st.session_state["routes"]:
        st.subheader("📍 Route Map")
        m = folium.Map(location=[df["lat"].mean(), df["lon"].mean()], zoom_start=12)
        colors = ["red", "blue", "green", "purple", "orange"]
        for i, route in enumerate(st.session_state["routes"]):
            pts = df[df["order_id"].isin(route.get("route", []))][["lat", "lon"]].values.tolist()
            if pts:
                folium.PolyLine(pts, color=colors[i % len(colors)], weight=4, tooltip=f"Driver {i}").add_to(m)
        st_folium(m, width=950, height=550)

# ----------------------------------------------------------------
# TAB 3: Fleet Control
# ----------------------------------------------------------------
with tab3:
    st.subheader("🚦 Fleet Control & Telemetry")
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
        st.session_state["telemetry"].clear()

    running = st.session_state["live_running"]
    paused = st.session_state["fleet_paused"]

    if running and not paused:
        _ = st_autorefresh(interval=refresh_sec * 1000, key="fleet_refresh")
        res = safe_api_get("/live_tracking", timeout=6)
        if res and res.status_code == 200:
            live = res.json().get("drivers", [])
        else:
            live = simulate_live_positions(drivers=3)
        st.session_state["live_positions"] = live
        st.session_state["telemetry"].append(pd.DataFrame(live))

    live_drivers = st.session_state["live_positions"]
    st.markdown("### 🚚 Fleet Summary")
    if live_drivers:
        for drv in live_drivers:
            c1, c2, c3 = st.columns([1, 2, 3])
            did = drv.get("driver_id", 0)
            avatar = make_avatar(did, 90)
            buf = io.BytesIO()
            avatar.save(buf, format="PNG")
            buf.seek(0)
            with c1:
                st.image(buf, width=90)
            with c2:
                st.markdown(f"**Driver {did}**")
                st.metric("Speed", f"{drv.get('speed_kmph')} km/h")
                st.metric("ETA", f"{drv.get('eta_min')} min")
            with c3:
                eff = max(0, min(100, 100 - abs(drv.get("eta_min", 20) - 20) * 2))
                fig = go.Figure(go.Indicator(
                    mode="gauge+number",
                    value=eff,
                    gauge={
                        "axis": {"range": [0, 100]},
                        "bar": {"color": "#1f77b4"},
                        "steps": [
                            {"range": [0, 50], "color": "lightcoral"},
                            {"range": [50, 80], "color": "gold"},
                            {"range": [80, 100], "color": "lightgreen"},
                        ]
                    }
                ))
                fig.update_layout(height=120, margin=dict(t=5, b=0, l=0, r=0))
                st.plotly_chart(fig, use_container_width=True)
    else:
        st.info("No live drivers — start fleet to begin telemetry.")

    st.markdown("### 🗺️ Fleet Map")
    m = folium.Map(location=[df["lat"].mean(), df["lon"].mean()], zoom_start=12)
    for drv in live_drivers:
        folium.Marker(
            [float(drv["lat"]), float(drv["lon"])],
            popup=f"Driver {drv['driver_id']} | ETA: {drv['eta_min']} | Speed: {drv['speed_kmph']} km/h",
            icon=folium.Icon(color="blue", icon="truck", prefix="fa"),
        ).add_to(m)
    st_folium(m, width=950, height=520)

# ----------------------------------------------------------------
# TAB 4: Explainability
# ----------------------------------------------------------------
with tab4:
    st.subheader("🧠 Explainability (SHAP)")
    if st.button("📊 Generate SHAP Insights"):
        res = safe_api_post("/predict_explain", {"orders": df.to_dict("records")}, timeout=40)
        if res and res.status_code == 200:
            data = res.json().get("explanation", {})
            vals = np.array(data.get("shap_values", []))
            feats = data.get("feature_names", [])
            if vals.size:
                imp = np.mean(np.abs(vals), axis=0)
                fig = px.bar(x=feats, y=imp, title="Mean |SHAP| Feature Importance")
                st.plotly_chart(fig, use_container_width=True)
        else:
            st.warning("Explainability API unavailable.")

# ----------------------------------------------------------------
# TAB 5: Analytics
# ----------------------------------------------------------------
with tab5:
    st.subheader("📊 Analytics Dashboard")
    preds = st.session_state.get("df_preds")
    routes = st.session_state.get("routes")

    if preds is not None and not preds.empty:
        fig = px.histogram(preds, x="predicted_delivery_time_min", nbins=10, title="Delivery Time Distribution")
        st.plotly_chart(fig, use_container_width=True)

    if routes:
        loads = [r.get("load", 0) for r in routes]
        fig = px.pie(values=loads, names=[f"Driver {i}" for i in range(len(loads))], title="Route Load Distribution")
        st.plotly_chart(fig, use_container_width=True)

st.markdown("---")
st.caption("Developed by Vivek Marri • IntelliLog-AI v4.5 © 2025 — Professional Fleet ML Dashboard")
