"""
🚚 IntelliLog-AI Dashboard — Persistent Map, API Health, and Full Monitoring
Author: Vivek Marri
Project: IntelliLog-AI
"""
import os
import streamlit as st
import pandas as pd
import folium
from streamlit_folium import st_folium
import requests
import numpy as np
import traceback

# ---------------------------------------
# CONFIG
# ---------------------------------------
API_URL = os.getenv("API_URL", "http://api:8000")  # Docker: http://api:8000, Local: override env to http://127.0.0.1:8000
st.set_page_config(page_title="IntelliLog-AI Dashboard", layout="wide")

st.title("🚀 Intelligent Logistics & Delivery Optimization (IntelliLog-AI)")
st.caption("Hybrid ML + DSA System for Delivery Time Prediction and Route Optimization")

# ---------------------------------------
# SIDEBAR — INPUT CONTROL + METRICS
# ---------------------------------------
st.sidebar.header("🗂️ Input Options")
option = st.sidebar.selectbox("Select Input Source", ["Simulate Orders", "Upload CSV"])

if option == "Upload CSV":
    uploaded_file = st.sidebar.file_uploader("Upload your orders CSV", type=["csv"])
    if uploaded_file is not None:
        df = pd.read_csv(uploaded_file)
    else:
        st.warning("Please upload a CSV file to continue.")
        st.stop()
else:
    # Default simulated dataset
    df = pd.DataFrame([
        {"order_id": "O00001", "lat": 12.97, "lon": 77.59, "distance_km": 2.5, "traffic": "medium", "weather": "rain", "order_type": "express"},
        {"order_id": "O00002", "lat": 12.95, "lon": 77.61, "distance_km": 3.5, "traffic": "low", "weather": "clear", "order_type": "normal"},
        {"order_id": "O00003", "lat": 12.99, "lon": 77.63, "distance_km": 4.2, "traffic": "high", "weather": "clear", "order_type": "normal"},
        {"order_id": "O00004", "lat": 12.93, "lon": 77.58, "distance_km": 5.1, "traffic": "medium", "weather": "rain", "order_type": "express"}
    ])

st.markdown("### 📦 Current Orders")
st.dataframe(df)

# Initialize session data
if "df_preds" not in st.session_state:
    st.session_state["df_preds"] = pd.DataFrame()
if "latest_map_html" not in st.session_state:
    st.session_state["latest_map_html"] = None
if "last_routes" not in st.session_state:
    st.session_state["last_routes"] = []

# ---------------------------------------
# 📊 API HEALTH MONITORING
# ---------------------------------------
st.sidebar.markdown("---")
st.sidebar.subheader("📈 API Health Monitor")

if st.sidebar.button("Check API Health"):
    try:
        res = requests.get(f"{API_URL}/metrics", timeout=5)
        if res.status_code == 200:
            metrics = res.json()
            st.sidebar.success("✅ API Healthy")
            st.sidebar.metric("CPU Usage", f"{metrics.get('cpu_usage', 'N/A')} %")
            st.sidebar.metric("Memory Usage", f"{metrics.get('memory_usage', 'N/A')} %")
            st.sidebar.metric("Active Features", metrics.get("active_features", 0))
            st.sidebar.metric("Model Status", "Loaded" if metrics.get("model_loaded") else "⚠️ Not Loaded")
        else:
            st.sidebar.error(f"API returned {res.status_code}")
    except Exception as e:
        st.sidebar.error(f"❌ API not reachable: {e}")

# ---------------------------------------
# DELIVERY TIME PREDICTION (ML)
# ---------------------------------------
st.markdown("---")
st.subheader("⚡ Predict Delivery Times")

if st.button("🔮 Run ML Prediction"):
    with st.spinner("Predicting delivery times using XGBoost model..."):
        try:
            payload = {"orders": df.to_dict(orient="records")}
            res = requests.post(f"{API_URL}/predict_delivery_time", json=payload, timeout=15)

            if res.status_code == 200:
                preds = res.json()
                df_preds = pd.DataFrame(preds)
                st.success("✅ Predictions received successfully!")
                # keep predicted column name consistent
                if "predicted_delivery_time_min" not in df_preds.columns and "delivery_time_min" in df_preds.columns:
                    df_preds = df_preds.rename(columns={"delivery_time_min": "predicted_delivery_time_min"})
                st.dataframe(df_preds[["order_id", "predicted_delivery_time_min"]])

                # KPIs
                avg_time = np.mean(df_preds["predicted_delivery_time_min"])
                min_time = np.min(df_preds["predicted_delivery_time_min"])
                max_time = np.max(df_preds["predicted_delivery_time_min"])

                c1, c2, c3 = st.columns(3)
                c1.metric("🕐 Avg Predicted Time", f"{avg_time:.2f} min")
                c2.metric("⚡ Fastest Delivery", f"{min_time:.2f} min")
                c3.metric("🐢 Slowest Delivery", f"{max_time:.2f} min")

                st.session_state["df_preds"] = df_preds
            else:
                st.error(f"API Error {res.status_code}: {res.text}")
        except Exception as e:
            st.error(f"❌ ML Prediction failed: {e}")
            st.code(traceback.format_exc())

# ---------------------------------------
# ROUTE OPTIMIZATION (DSA)
# ---------------------------------------
st.markdown("---")
st.subheader("🧭 Route Optimization")

drivers = st.slider("Number of Drivers", 1, 10, 2)
method = st.selectbox("Optimization Method", ["greedy", "ortools"])

if st.button("🗺️ Optimize Routes"):
    with st.spinner("Running Vehicle Routing Optimization..."):
        try:
            payload = {"orders": df.to_dict(orient="records"), "drivers": drivers, "method": method}
            res = requests.post(f"{API_URL}/plan_routes", json=payload, timeout=20)

            if res.status_code == 200:
                route_data = res.json()
                routes = route_data.get("routes", [])
                st.write("📡 Debug: API Response", route_data)

                if not routes:
                    st.warning("⚠️ No routes returned from the API.")
                else:
                    st.success("✅ Routes optimized successfully!")
                    # Save last routes
                    st.session_state["last_routes"] = routes

                    # Safely compute per-route loads (backfill if missing)
                    avg_loads = []
                    route_summaries = []
                    for r in routes:
                        load = r.get("load")
                        # if load missing, compute from df distances
                        route_ids = r.get("route", [])
                        distance_sum = float(np.sum(df[df["order_id"].isin(route_ids)]["distance_km"].values)) if route_ids else 0.0
                        if load is None:
                            load = distance_sum
                        avg_loads.append(load)
                        route_summaries.append({"id": r.get("id", None), "load": load, "n": len(route_ids), "distance_km": distance_sum})

                    avg_load = float(np.mean(avg_loads)) if avg_loads else 0.0
                    total_orders = len(df)
                    total_routes = len(routes)

                    c1, c2, c3 = st.columns(3)
                    c1.metric("👨‍✈️ Total Drivers", total_routes)
                    c2.metric("📦 Total Orders", total_orders)
                    c3.metric("💨 Avg Route Load", f"{avg_load:.2f}")

                    # Create Folium Map
                    center_lat = float(df["lat"].mean()) if not df["lat"].isnull().all() else 0.0
                    center_lon = float(df["lon"].mean()) if not df["lon"].isnull().all() else 0.0
                    m = folium.Map(location=[center_lat, center_lon], zoom_start=12)

                    colors = ["red", "blue", "green", "purple", "orange", "darkred", "cadetblue", "pink", "gray", "beige"]
                    df_preds = st.session_state.get("df_preds", pd.DataFrame())

                    for idx, route in enumerate(routes):
                        color = colors[idx % len(colors)]
                        route_ids = route.get("route", [])
                        points = df[df["order_id"].isin(route_ids)][["lat", "lon"]].values.tolist()

                        if not points:
                            # still show marker for first order if present
                            continue

                        # compute display values
                        total_distance = float(np.sum(df[df["order_id"].isin(route_ids)]["distance_km"].values))
                        avg_time = 0.0
                        try:
                            if not df_preds.empty:
                                avg_time = float(df_preds[df_preds["order_id"].isin(route_ids)]["predicted_delivery_time_min"].mean())
                        except Exception:
                            avg_time = 0.0

                        folium.Marker(
                            location=points[0],
                            tooltip=f"Driver {idx} Start — Est {avg_time:.1f} min",
                            icon=folium.Icon(color=color, icon="truck", prefix="fa")
                        ).add_to(m)

                        if len(points) == 1:
                            # single point: add a small circle
                            folium.CircleMarker(location=points[0], radius=6, fill=True, color=color).add_to(m)
                        else:
                            folium.PolyLine(points, color=color, weight=4, opacity=0.8).add_to(m)

                        folium.Marker(
                            location=points[-1],
                            tooltip=f"Driver {idx} End | {total_distance:.1f} km",
                            icon=folium.Icon(color="black", icon="flag", prefix="fa")
                        ).add_to(m)

                    # Save map persistently
                    st.session_state["latest_map_html"] = m._repr_html_()
                    # Save short insights for display
                    st.session_state["route_summaries"] = route_summaries

            else:
                st.error(f"API Error: {res.status_code} - {res.text}")

        except Exception as e:
            st.error("❌ Route Optimization failed.")
            st.code(traceback.format_exc())

# ---------------------------------------
# ✅ Render Map Persistently
# ---------------------------------------
st.markdown("### 🗺️ Delivery Route Map")

if st.session_state["latest_map_html"]:
    st.components.v1.html(st.session_state["latest_map_html"], height=600, width=950)
else:
    st.info("ℹ️ Click '🗺️ Optimize Routes' to generate route map.")

# ---------------------------------------
# Smart Insights (summary)
# ---------------------------------------
st.markdown("---")
st.subheader("🔎 Smart Insights")

route_summaries = st.session_state.get("route_summaries", [])
if route_summaries:
    # convert to DataFrame for display
    rs_df = pd.DataFrame(route_summaries).fillna(0)
    # show top insights
    longest = rs_df.loc[rs_df["distance_km"].idxmax()] if "distance_km" in rs_df.columns else None
    heaviest = rs_df.loc[rs_df["load"].idxmax()] if "load" in rs_df.columns else None

    col_a, col_b, col_c = st.columns(3)
    col_a.metric("🚩 Longest Route (km)", f"{longest['distance_km']:.1f}" if longest is not None else "N/A")
    col_b.metric("📈 Heaviest Load", f"{heaviest['load']:.1f}" if heaviest is not None else "N/A")
    col_c.metric("🧾 Routes Count", f"{len(route_summaries)}")

    with st.expander("View route summaries"):
        st.dataframe(rs_df)
else:
    st.info("No route insights available. Generate routes to see insights.")

st.markdown("---")
st.caption("Developed by Vivek Marri • IntelliLog-AI © 2025")
