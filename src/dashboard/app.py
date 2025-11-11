"""
🚚 IntelliLog-AI Dashboard v3.2 — Live Tracking (API-driven) + Analytics + Explainability
Author: Vivek Marri
Project: IntelliLog-AI
"""

import os
import time
import traceback

import streamlit as st
import pandas as pd
import folium
import numpy as np
import requests
from streamlit_folium import st_folium
import plotly.express as px
from streamlit_autorefresh import st_autorefresh

# ---------------------------------------
# CONFIG
# ---------------------------------------
API_URL = os.getenv("API_URL", "http://127.0.0.1:8000")  # point to your FastAPI
st.set_page_config(page_title="IntelliLog-AI Dashboard", layout="wide")

st.title("🚀 IntelliLog-AI — Real-Time Logistics Optimization & Tracking")
st.caption("A Unified ML + OR-Tools + XAI System for Smart Delivery Management")

# ---------------------------------------
# SIDEBAR — INPUT + LIVE SETTINGS
# ---------------------------------------
st.sidebar.header("🗂️ Data Input")
option = st.sidebar.selectbox("Select Input Source", ["Simulate Orders", "Upload CSV"])

if option == "Upload CSV":
    file = st.sidebar.file_uploader("Upload your orders CSV", type=["csv"])
    if file:
        df = pd.read_csv(file)
    else:
        st.warning("Please upload a CSV file to continue.")
        st.stop()
else:
    df = pd.DataFrame([
        {"order_id": f"O000{i}", "lat": 12.90 + i * 0.01, "lon": 77.60 + i * 0.01,
         "distance_km": 2.0 + i, "traffic": np.random.choice(["low", "medium", "high"]),
         "weather": "clear", "order_type": np.random.choice(["normal", "express"])}
        for i in range(1, 6)
    ])

st.sidebar.markdown("---")
st.sidebar.subheader("🔁 Live Tracking Settings")
refresh_sec = st.sidebar.slider("Auto-refresh interval (seconds)", min_value=2, max_value=30, value=5, step=1)
live_toggle = st.sidebar.checkbox("Enable Live Tracking auto-refresh", value=False)
st.sidebar.markdown("---")

st.markdown("### 📦 Current Orders")
st.dataframe(df)

# ---------------------------------------
# SESSION INITIALIZATION
# ---------------------------------------
for k in ["df_preds", "routes", "map_html", "route_summary", "live_positions", "live_running"]:
    if k not in st.session_state:
        st.session_state[k] = None

# ---------------------------------------
# API HEALTH CHECK
# ---------------------------------------
st.sidebar.subheader("📊 API Health Monitor")
try:
    res = requests.get(f"{API_URL}/metrics", timeout=4)
    if res.status_code == 200:
        metrics = res.json()
        st.sidebar.success("✅ API Healthy")
        st.sidebar.metric("CPU Usage", f"{metrics.get('cpu_usage', 0)} %")
        st.sidebar.metric("Memory Usage", f"{metrics.get('memory_usage', 0)} %")
        st.sidebar.metric("Features", metrics.get("active_features", 0))
        st.sidebar.metric("Model", "Loaded" if metrics.get("model_loaded") else "⚠️ Not Loaded")
    else:
        st.sidebar.error(f"⚠️ API Error {res.status_code}")
except Exception:
    st.sidebar.error("❌ API Not Reachable")

# ---------------------------------------
# TABS
# ---------------------------------------
tab1, tab2, tab3, tab4, tab5 = st.tabs([
    "🤖 ML Prediction",
    "🧭 Route Optimization",
    "🚛 Live Tracking",
    "🧠 Explainability",
    "📊 Smart Insights"
])

# ---------------------------------------
# TAB 1 — ML PREDICTION
# ---------------------------------------
with tab1:
    st.subheader("⚡ Predict Delivery Times using XGBoost")

    if st.button("🔮 Run ML Prediction"):
        with st.spinner("Predicting delivery times..."):
            try:
                payload = {"orders": df.to_dict(orient="records")}
                res = requests.post(f"{API_URL}/predict_delivery_time", json=payload, timeout=20)
                if res.status_code == 200:
                    preds = pd.DataFrame(res.json())
                    st.session_state["df_preds"] = preds
                    st.success("✅ Predictions completed!")

                    avg = preds["predicted_delivery_time_min"].mean()
                    c1, c2, c3 = st.columns(3)
                    c1.metric("🕒 Avg Time", f"{avg:.2f} min")
                    c2.metric("⚡ Fastest", f"{preds['predicted_delivery_time_min'].min():.2f} min")
                    c3.metric("🐢 Slowest", f"{preds['predicted_delivery_time_min'].max():.2f} min")

                    st.dataframe(preds)
                    st.download_button("📥 Download Predictions CSV",
                                       preds.to_csv(index=False).encode("utf-8"),
                                       "predictions.csv", "text/csv")
                else:
                    st.error(f"API Error {res.status_code}: {res.text}")
            except Exception as e:
                st.error(f"❌ Prediction failed: {e}")
                st.code(traceback.format_exc())

# ---------------------------------------
# TAB 2 — ROUTE OPTIMIZATION
# ---------------------------------------
with tab2:
    st.subheader("🧭 Optimize Delivery Routes (Greedy / OR-Tools)")
    drivers = st.slider("Number of Drivers", 1, 10, 2)
    method = st.selectbox("Route Planning Method", ["greedy", "ortools"])

    if st.button("🗺️ Plan & Visualize Routes"):
        with st.spinner("Optimizing routes..."):
            try:
                payload = {"orders": df.to_dict(orient="records"), "drivers": drivers, "method": method}
                res = requests.post(f"{API_URL}/plan_routes", json=payload, timeout=25)
                if res.status_code == 200:
                    route_data = res.json()
                    routes = route_data.get("routes", [])
                    st.session_state["routes"] = routes

                    if not routes:
                        st.warning("⚠️ No routes returned.")
                    else:
                        st.success("✅ Routes optimized successfully!")
                        avg_load = np.mean([r.get("load", 0) for r in routes])
                        st.metric("💨 Avg Route Load", f"{avg_load:.2f}")

                        m = folium.Map(location=[df["lat"].mean(), df["lon"].mean()], zoom_start=12)
                        colors = ["red", "blue", "green", "purple", "orange", "darkred", "cadetblue"]

                        for i, route in enumerate(routes):
                            ids = route.get("route", [])
                            pts = df[df["order_id"].isin(ids)][["lat", "lon"]].values.tolist()
                            color = colors[i % len(colors)]

                            if len(pts) >= 2:
                                folium.PolyLine(pts, color=color, weight=5, opacity=0.8).add_to(m)
                            for p in pts:
                                folium.CircleMarker(p, radius=6, color=color, fill=True).add_to(m)

                            folium.Marker(pts[0], icon=folium.Icon(color=color, icon="truck", prefix="fa"),
                                          tooltip=f"Driver {i} Start").add_to(m)
                            folium.Marker(pts[-1], icon=folium.Icon(color="black", icon="flag", prefix="fa"),
                                          tooltip=f"Driver {i} End").add_to(m)

                        st.session_state["map_html"] = m._repr_html_()
                        st.download_button("📥 Download Routes CSV",
                                           pd.DataFrame(routes).to_csv(index=False).encode("utf-8"),
                                           "routes.csv", "text/csv")
                else:
                    st.error(f"API Error: {res.status_code}")
            except Exception as e:
                st.error("❌ Route optimization failed.")
                st.code(traceback.format_exc())

    if st.session_state["map_html"]:
        st.components.v1.html(st.session_state["map_html"], height=550)

# ---------------------------------------
# TAB 3 — LIVE TRACKING (API-driven)
# ---------------------------------------
with tab3:
    st.subheader("🚛 Live Driver Tracking (backend-driven)")
    routes = st.session_state.get("routes")
    if not routes:
        st.warning("No routes available. Run optimization first in the 'Route Optimization' tab.")
    else:
        # Auto-refresh control: use st_autorefresh only when live_toggle is True
        if live_toggle:
            # compute number of cycles; st_autorefresh returns increment counter
            st_autorefresh(interval=refresh_sec * 1000, key="live_autorefresh")

        # Fetch live positions from backend
        try:
            res = requests.get(f"{API_URL}/live_tracking", timeout=5)
            if res.status_code == 200:
                live = res.json()
                drivers = live.get("drivers", [])
                st.session_state["live_positions"] = drivers
            else:
                st.error(f"Live API Error: {res.status_code}")
                drivers = []
        except Exception as e:
            st.error(f"❌ Failed to fetch live positions: {e}")
            drivers = []

        # Build folium map with routes + live markers
        m = folium.Map(location=[df["lat"].mean(), df["lon"].mean()], zoom_start=12)
        colors = ["red", "blue", "green", "purple", "orange", "darkred"]

        # Draw static routes
        for i, route in enumerate(routes):
            ids = route.get("route", [])
            pts = df[df["order_id"].isin(ids)][["lat", "lon"]].values.tolist()
            color = colors[i % len(colors)]
            if len(pts) >= 2:
                folium.PolyLine(pts, color=color, weight=4, opacity=0.6).add_to(m)
            for p in pts:
                folium.CircleMarker(p, radius=4, color=color, fill=True).add_to(m)

        # Overlay live driver markers returned by backend
        for drv in drivers:
            try:
                did = drv.get("driver_id")
                lat = float(drv.get("lat", 0.0))
                lon = float(drv.get("lon", 0.0))
                speed = drv.get("speed_kmph", None)
                eta = drv.get("eta_min", None)
                tooltip = f"Driver {did} — ETA {eta} min — {speed} km/h"
                folium.Marker([lat, lon],
                              tooltip=tooltip,
                              icon=folium.Icon(color=colors[int(did) % len(colors)], icon="truck", prefix="fa")
                              ).add_to(m)
            except Exception:
                continue

        # Display map
        st_folium(m, width=950, height=550, key=f"live_map_{int(time.time())}")

# ---------------------------------------
# TAB 4 — XAI / EXPLAINABILITY
# ---------------------------------------
with tab4:
    st.subheader("🧠 SHAP Explainability — Why did the model predict that?")
    if st.button("📊 Generate SHAP Insights"):
        try:
            payload = {"orders": df.to_dict(orient="records")}
            res = requests.post(f"{API_URL}/predict_explain", json=payload, timeout=30)
            if res.status_code == 200:
                data = res.json().get("explanation", {})
                if data:
                    shap_vals = np.array(data["shap_values"])
                    features = data["feature_names"]
                    mean_abs = np.mean(np.abs(shap_vals), axis=0)
                    fig = px.bar(x=features, y=mean_abs, title="Mean |SHAP| Feature Importance",
                                 labels={"x": "Feature", "y": "Impact"})
                    st.plotly_chart(fig, use_container_width=True)
                else:
                    st.info("No SHAP data available.")
        except Exception as e:
            st.error("❌ SHAP explanation failed.")
            st.code(traceback.format_exc())

# ---------------------------------------
# TAB 5 — SMART INSIGHTS
# ---------------------------------------
with tab5:
    st.subheader("📊 Analytics Dashboard — Route Efficiency & Distribution")
    preds = st.session_state.get("df_preds")
    routes = st.session_state.get("routes")

    if preds is not None and not preds.empty:
        fig1 = px.histogram(preds, x="predicted_delivery_time_min", nbins=10,
                            title="Delivery Time Distribution", color_discrete_sequence=["#2b8cbe"])
        st.plotly_chart(fig1, use_container_width=True)

    if routes:
        loads = [r.get("load", 0) for r in routes]
        labels = [f"Driver {i}" for i in range(len(loads))]
        fig2 = px.pie(values=loads, names=labels, title="Route Load Distribution")
        st.plotly_chart(fig2, use_container_width=True)

st.markdown("---")
st.caption("Developed by Vivek Marri • IntelliLog-AI v3.2 © 2025 — Real-Time ML + Optimization + XAI Dashboard")
