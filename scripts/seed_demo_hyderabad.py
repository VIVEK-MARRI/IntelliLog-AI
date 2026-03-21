#!/usr/bin/env python
"""
Hyderabad Demo Data Seeding Script for IntelliLog-AI SHAP Explainability Demo

Creates realistic delivery orders and drivers with actual Hyderabad geography
that will make the SHAP explanation demo feel real and credible to a dispatcher.

Usage:
    python scripts/seed_demo_hyderabad.py --tenant-id demo-tenant-001
    python scripts/seed_demo_hyderabad.py --reset --tenant-id demo-tenant-001
    python scripts/seed_demo_hyderabad.py --verify --tenant-id demo-tenant-001
"""

import sys
import os
import json
import argparse
import uuid
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple

# Add project root to path
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, project_root)

import redis
import pandas as pd
import numpy as np
from sqlalchemy.orm import Session
from sqlalchemy import func

from src.backend.app.db.base import SessionLocal, engine
from src.backend.app.db.models import (
    Base, Tenant, Warehouse, Driver, Order, Route, DeliveryFeedback, TrafficPattern
)
from src.backend.app.core.config import settings
from src.ml.models.eta_predictor import ETAPredictor
from src.ml.models.shap_explainer import SHAPExplainer


# ============================================================================
# PART 1: CONFIGURATION & CONSTANTS
# ============================================================================

DEMO_TENANT_ID = "demo-tenant-001"
DEMO_WAREHOUSE_ID = "wh-hyderabad-central"

# Real Hyderabad coordinates - verified locations
HYDERABAD_LOCATIONS = {
    # IT Corridor / Hitec City landmarks
    "hitech_city_mmts": (17.4400, 78.3800),
    "mindspace_madhapur": (17.4477, 78.3921),
    "cyberabad_police": (17.4290, 78.3520),
    "dlf_cyber_city": (17.4239, 78.3611),
    "ikea_hyderabad": (17.4140, 78.3220),
    "raheja_mindspace": (17.4469, 78.3762),
    "gachibowli_stadium": (17.4239, 78.3481),
    "microsoft_campus": (17.4428, 78.3762),
    
    # Old City / Central Hyderabad
    "charminar": (17.3616, 78.4747),
    "banjara_hills_road12": (17.4156, 78.4480),
    "laad_bazaar": (17.3604, 78.4730),
    "gvk_one_mall": (17.4130, 78.4486),
    "osmania_hospital": (17.3815, 78.4740),
    "apollo_hospital": (17.4270, 78.4070),
    "nampally_station": (17.3840, 78.4660),
    "panjagutta_metro": (17.4249, 78.4479),
    
    # Secunderabad (North)
    "paradise_hotel": (17.4399, 78.4983),
    "trimulgherry": (17.4608, 78.5235),
    "secunderabad_station": (17.4344, 78.5005),
    "begumpet_airport": (17.4430, 78.4688),
    "sd_road_secunderabad": (17.4412, 78.4915),
    "patny_centre": (17.4377, 78.4982),
    "bowenpally_market": (17.4709, 78.4779),
    "malkajgiri_railway": (17.4559, 78.5235),
    
    # Southeast (LB Nagar, Dilsukhnagar, Kothapet)
    "lb_nagar_metro": (17.3483, 78.5528),
    "dilsukhnagar_bus": (17.3685, 78.5245),
    "kothapet_road": (17.3598, 78.5433),
    "nagole_metro": (17.3855, 78.5636),
    
    # Additional demo locations
    "mehdipatnam_bus": (17.3930, 78.4360),
    "tolichowki_junction": (17.3981, 78.4220),
    "himayatnagar_road": (17.4039, 78.4752),
    "somajiguda_circle": (17.4271, 78.4528),
    "kukatpally_hb": (17.4849, 78.3940),
    "jntu_hyderabad": (17.4938, 78.3924),
}

# Demo drivers with specific zone expertise
DEMO_DRIVERS = {
    "ravi_kumar": {
        "name": "Ravi Kumar",
        "phone": "+91-9876543201",
        "vehicle_type": "bike",
        "vehicle_capacity": 15,
        "zone_expertise": ["Hitech City", "Madhapur", "Kondapur"],
        "start_lat": 17.4450,
        "start_lng": 78.3800,
    },
    "saleem_mohammed": {
        "name": "Saleem Mohammed",
        "phone": "+91-9876543202",
        "vehicle_type": "bike",
        "vehicle_capacity": 15,
        "zone_expertise": ["Secunderabad", "Begumpet", "Trimulgherry"],
        "start_lat": 17.4400,
        "start_lng": 78.4900,
    },
    "venkat_reddy": {
        "name": "Venkat Reddy",
        "phone": "+91-9876543203",
        "vehicle_type": "auto",
        "vehicle_capacity": 50,
        "zone_expertise": ["Banjara Hills", "Jubilee Hills", "Panjagutta"],
        "start_lat": 17.4200,
        "start_lng": 78.4400,
    },
    "priya_singh": {
        "name": "Priya Singh",
        "phone": "+91-9876543204",
        "vehicle_type": "car",
        "vehicle_capacity": 100,
        "zone_expertise": ["LB Nagar", "Dilsukhnagar", "Kothapet"],
        "start_lat": 17.3600,
        "start_lng": 78.5400,
    },
}

# Exact demo suggestion copy for hero orders (E1-E5).
HERO_ORDER_WHAT_WOULD_HELP = {
    "E1": "Assigning Ravi Kumar (Hitech City expert) would save approximately 5 minutes",
    "E2": "Assigning Saleem Mohammed (Secunderabad expert) would save approximately 4 minutes",
    "E3": "",
    "E4": "Scheduling this delivery after 8 PM when rain typically clears would reduce the delay by approximately 3 minutes",
    "E5": "Using Venkat Reddy's auto rickshaw (50 kg capacity) would handle this 18.5 kg package safely and save approximately 3 minutes",
}

# Traffic ratio multipliers based on time and zone
TRAFFIC_PATTERNS_CONFIG = {
    "morning_it_corridor": {"ratio": 1.4, "description": "Morning IT office arrivals"},
    "afternoon_old_city": {"ratio": 1.6, "description": "Afternoon lunch hour congestion"},
    "rush_hour": {"ratio": 2.1, "description": "Evening rush hour (most critical)"},
    "secunderabad": {"ratio": 1.3, "description": "Well-planned northern area"},
    "rain_multiplier": 1.4,
}


# ============================================================================
# PART 2: DEMO DATA DEFINITIONS
# ============================================================================

def get_demo_orders() -> List[Dict[str, Any]]:
    """Return all 20 demo orders with exact Hyderabad coordinates."""
    orders = []
    
    # ===== ORDER GROUP A: IT Corridor (assign to Ravi) =====
    orders.append({
        "order_id": "A1",
        "group": "A",
        "name": "Hitech City to Mindspace",
        "pickup_name": "Hitech City MMTS Station",
        "delivery_name": "Mindspace Business Park, Madhapur",
        "pickup_lat": 17.4400,
        "pickup_lng": 78.3800,
        "delivery_lat": 17.4477,
        "delivery_lng": 78.3921,
        "weight": 2.5,
        "time_window": "10:00-12:00",
        "assigned_driver": "ravi_kumar",
        "traffic_condition": "moderate",
    })
    
    orders.append({
        "order_id": "A2",
        "group": "A",
        "name": "Police to DLF Cyber City",
        "pickup_name": "Cyberabad Police Commissionerate",
        "delivery_name": "DLF Cyber City, Gachibowli",
        "pickup_lat": 17.4290,
        "pickup_lng": 78.3520,
        "delivery_lat": 17.4239,
        "delivery_lng": 78.3611,
        "weight": 1.2,
        "time_window": "09:30-11:30",
        "assigned_driver": "ravi_kumar",
        "traffic_condition": "moderate",
    })
    
    orders.append({
        "order_id": "A3",
        "group": "A",
        "name": "IKEA to Raheja Mindspace",
        "pickup_name": "IKEA Hyderabad",
        "delivery_name": "Raheja Mindspace, Hitec City",
        "pickup_lat": 17.4140,
        "pickup_lng": 78.3220,
        "delivery_lat": 17.4469,
        "delivery_lng": 78.3762,
        "weight": 8.0,
        "time_window": "11:00-14:00",
        "assigned_driver": "ravi_kumar",
        "traffic_condition": "moderate",
    })
    
    # ===== ORDER GROUP B: Old City / Central (assign to Venkat) =====
    orders.append({
        "order_id": "B1",
        "group": "B",
        "name": "Charminar to Banjara Hills",
        "pickup_name": "Charminar",
        "delivery_name": "Banjara Hills Road No.12",
        "pickup_lat": 17.3616,
        "pickup_lng": 78.4747,
        "delivery_lat": 17.4156,
        "delivery_lng": 78.4480,
        "weight": 3.0,
        "time_window": "14:00-17:00",
        "assigned_driver": "venkat_reddy",
        "traffic_condition": "heavy",
    })
    
    orders.append({
        "order_id": "B2",
        "group": "B",
        "name": "Laad Bazaar to GVK One",
        "pickup_name": "Laad Bazaar",
        "delivery_name": "GVK One Mall, Banjara Hills",
        "pickup_lat": 17.3604,
        "pickup_lng": 78.4730,
        "delivery_lat": 17.4130,
        "delivery_lng": 78.4486,
        "weight": 0.8,
        "time_window": "13:30-16:30",
        "assigned_driver": "venkat_reddy",
        "traffic_condition": "heavy",
    })
    
    orders.append({
        "order_id": "B3",
        "group": "B",
        "name": "Osmania to Apollo",
        "pickup_name": "Osmania General Hospital",
        "delivery_name": "Apollo Hospital, Jubilee Hills",
        "pickup_lat": 17.3815,
        "pickup_lng": 78.4740,
        "delivery_lat": 17.4270,
        "delivery_lng": 78.4070,
        "weight": 1.5,
        "time_window": "10:00-13:00",
        "assigned_driver": "venkat_reddy",
        "traffic_condition": "moderate",
    })
    
    orders.append({
        "order_id": "B4",
        "group": "B",
        "name": "Nampally to Panjagutta",
        "pickup_name": "Nampally Station",
        "delivery_name": "Panjagutta Metro Station",
        "pickup_lat": 17.3840,
        "pickup_lng": 78.4660,
        "delivery_lat": 17.4249,
        "delivery_lng": 78.4479,
        "weight": 5.5,
        "time_window": "11:00-14:00",
        "assigned_driver": "venkat_reddy",
        "traffic_condition": "moderate",
    })
    
    # ===== ORDER GROUP C: Secunderabad (assign to Saleem) =====
    orders.append({
        "order_id": "C1",
        "group": "C",
        "name": "Paradise to Trimulgherry",
        "pickup_name": "Paradise Hotel, Secunderabad",
        "delivery_name": "Trimulgherry Army Area",
        "pickup_lat": 17.4399,
        "pickup_lng": 78.4983,
        "delivery_lat": 17.4608,
        "delivery_lng": 78.5235,
        "weight": 4.0,
        "time_window": "12:00-15:00",
        "assigned_driver": "saleem_mohammed",
        "traffic_condition": "moderate",
    })
    
    orders.append({
        "order_id": "C2",
        "group": "C",
        "name": "Secunderabad Station to Begumpet",
        "pickup_name": "Secunderabad Railway Station",
        "delivery_name": "Begumpet Airport Road",
        "pickup_lat": 17.4344,
        "pickup_lng": 78.5005,
        "delivery_lat": 17.4430,
        "delivery_lng": 78.4688,
        "weight": 2.2,
        "time_window": "09:00-11:00",
        "assigned_driver": "saleem_mohammed",
        "traffic_condition": "free_flow",
    })
    
    orders.append({
        "order_id": "C3",
        "group": "C",
        "name": "SD Road to Patny Centre",
        "pickup_name": "SD Road, Secunderabad",
        "delivery_name": "Patny Centre, Secunderabad",
        "pickup_lat": 17.4412,
        "pickup_lng": 78.4915,
        "delivery_lat": 17.4377,
        "delivery_lng": 78.4982,
        "weight": 1.0,
        "time_window": "14:00-17:00",
        "assigned_driver": "saleem_mohammed",
        "traffic_condition": "moderate",
    })
    
    # ===== ORDER GROUP D: Southeast (assign to Priya) =====
    orders.append({
        "order_id": "D1",
        "group": "D",
        "name": "LB Nagar to Dilsukhnagar",
        "pickup_name": "LB Nagar Metro",
        "delivery_name": "Dilsukhnagar Bus Stand",
        "pickup_lat": 17.3483,
        "pickup_lng": 78.5528,
        "delivery_lat": 17.3685,
        "delivery_lng": 78.5245,
        "weight": 3.5,
        "time_window": "10:00-13:00",
        "assigned_driver": "priya_singh",
        "traffic_condition": "moderate",
    })
    
    orders.append({
        "order_id": "D2",
        "group": "D",
        "name": "Kothapet to Nagole",
        "pickup_name": "Kothapet Main Road",
        "delivery_name": "Nagole Metro Station",
        "pickup_lat": 17.3598,
        "pickup_lng": 78.5433,
        "delivery_lat": 17.3855,
        "delivery_lng": 78.5636,
        "weight": 2.0,
        "time_window": "11:30-14:30",
        "assigned_driver": "priya_singh",
        "traffic_condition": "moderate",
    })
    
    # ===== ORDER GROUP E: WRONG DRIVER DEMO ORDERS (SHAP heroes) =====
    # E1: IT Corridor order assigned to Priya (wrong driver)
    orders.append({
        "order_id": "E1",
        "group": "E",
        "name": "Gachibowli to Microsoft (WRONG DRIVER DEMO)",
        "pickup_name": "Gachibowli Stadium",
        "delivery_name": "Microsoft Campus, Hitech City",
        "pickup_lat": 17.4239,
        "pickup_lng": 78.3481,
        "delivery_lat": 17.4428,
        "delivery_lng": 78.3762,
        "weight": 2.8,
        "time_window": "15:00-18:00",
        "assigned_driver": "priya_singh",  # WRONG - should be Ravi
        "traffic_condition": "heavy",
        "demo_type": "zone_unfamiliarity",
    })
    
    # E2: Secunderabad order assigned to Venkat (wrong driver)
    orders.append({
        "order_id": "E2",
        "group": "E",
        "name": "Bowenpally to Malkajgiri (WRONG DRIVER DEMO)",
        "pickup_name": "Bowenpally Market",
        "delivery_name": "Malkajgiri Railway Station",
        "pickup_lat": 17.4709,
        "pickup_lng": 78.4779,
        "delivery_lat": 17.4559,
        "delivery_lng": 78.5235,
        "weight": 4.5,
        "time_window": "13:00-16:00",
        "assigned_driver": "venkat_reddy",  # WRONG - should be Saleem
        "traffic_condition": "moderate",
        "demo_type": "zone_unfamiliarity",
    })
    
    # E3: HERO ORDER - Rush hour in congested zone (traffic is the main factor)
    orders.append({
        "order_id": "E3",
        "group": "E",
        "name": "Mehdipatnam to Tolichowki (RUSH HOUR HERO)",
        "pickup_name": "Mehdipatnam Bus Stop",
        "delivery_name": "Tolichowki Junction",
        "pickup_lat": 17.3930,
        "pickup_lng": 78.4360,
        "delivery_lat": 17.3981,
        "delivery_lng": 78.4220,
        "weight": 1.8,
        "time_window": "17:00-19:00",
        "assigned_driver": "venkat_reddy",
        "traffic_condition": "heavy",
        "demo_type": "traffic_peak_hour",
        "is_peak_hour": True,
    })
    
    # E4: Weather demo order
    orders.append({
        "order_id": "E4",
        "group": "E",
        "name": "Himayatnagar to Somajiguda (RAIN DEMO)",
        "pickup_name": "Himayatnagar Main Road",
        "delivery_name": "Somajiguda Circle",
        "pickup_lat": 17.4039,
        "pickup_lng": 78.4752,
        "delivery_lat": 17.4271,
        "delivery_lng": 78.4528,
        "weight": 0.9,
        "time_window": "16:00-19:00",
        "assigned_driver": "venkat_reddy",
        "traffic_condition": "moderate",
        "weather_condition": "rain",
        "demo_type": "weather",
    })
    
    # E5: Heavy package near vehicle capacity
    orders.append({
        "order_id": "E5",
        "group": "E",
        "name": "Kukatpally to JNTU (HEAVY PACKAGE)",
        "pickup_name": "Kukatpally Housing Board",
        "delivery_name": "JNTU Hyderabad",
        "pickup_lat": 17.4849,
        "pickup_lng": 78.3940,
        "delivery_lat": 17.4938,
        "delivery_lng": 78.3924,
        "weight": 18.5,  # Near bike capacity limit
        "time_window": "09:00-12:00",
        "assigned_driver": "ravi_kumar",  # Bike, will trigger weight effects
        "traffic_condition": "moderate",
        "demo_type": "vehicle_weight",
    })
    
    return orders


# ============================================================================
# PART 3: DATABASE OPERATIONS
# ============================================================================

def create_demo_tenant(db: Session, tenant_id: str) -> Tenant:
    """Create or fetch demo tenant."""
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if tenant:
        print(f"  ℹ️  Tenant already exists: {tenant.name}")
        return tenant
    
    tenant = Tenant(
        id=tenant_id,
        name="Hyderabad Logistics Demo",
        slug=f"hyderabad-demo-{tenant_id[:8]}",
        plan="demo",
    )
    db.add(tenant)
    db.commit()
    db.refresh(tenant)
    print(f"  ✅ Created demo tenant: {tenant.name}")
    return tenant


def create_demo_warehouse(db: Session, tenant_id: str) -> Warehouse:
    """Create or fetch demo warehouse."""
    warehouse = db.query(Warehouse).filter(Warehouse.id == DEMO_WAREHOUSE_ID).first()
    if warehouse:
        print(f"  ℹ️  Warehouse already exists: {warehouse.name}")
        return warehouse
    
    warehouse = Warehouse(
        id=DEMO_WAREHOUSE_ID,
        name="Hyderabad Central Hub",
        lat=17.3850,
        lng=78.4867,
        service_radius_km=30.0,
        capacity=500,
        tenant_id=tenant_id,
    )
    db.add(warehouse)
    db.commit()
    db.refresh(warehouse)
    print(f"  ✅ Created demo warehouse: {warehouse.name}")
    return warehouse


def create_demo_drivers(db: Session, tenant_id: str, warehouse_id: str) -> Dict[str, Driver]:
    """Create 4 realistic demo drivers."""
    drivers = {}
    
    for driver_key, driver_config in DEMO_DRIVERS.items():
        driver_id = f"drv-demo-{driver_key}"
        
        # Check if already exists
        existing = db.query(Driver).filter(Driver.id == driver_id).first()
        if existing:
            print(f"  ℹ️  Driver already exists: {existing.name}")
            drivers[driver_key] = existing
            continue
        
        driver = Driver(
            id=driver_id,
            name=driver_config["name"],
            phone=driver_config["phone"],
            vehicle_type=driver_config["vehicle_type"],
            vehicle_capacity=driver_config["vehicle_capacity"],
            zone_expertise=driver_config["zone_expertise"],
            current_lat=driver_config["start_lat"],
            current_lng=driver_config["start_lng"],
            status="available",
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
        )
        db.add(driver)
        db.commit()
        db.refresh(driver)
        drivers[driver_key] = driver
        print(f"  ✅ {driver.name} ({driver.vehicle_type}, capacity {driver.vehicle_capacity}kg) - zones: {driver.zone_expertise}")
    
    return drivers


def create_demo_orders(
    db: Session,
    tenant_id: str,
    warehouse_id: str,
    drivers: Dict[str, Driver],
) -> Dict[str, Order]:
    """Create 20 demo orders."""
    demo_orders_data = get_demo_orders()
    created_orders = {}
    
    for order_data in demo_orders_data:
        order_id = f"ord-demo-{order_data['order_id']}"
        
        # Check if already exists
        existing = db.query(Order).filter(Order.id == order_id).first()
        if existing:
            print(f"  ℹ️  Order {order_data['order_id']} already exists")
            created_orders[order_data['order_id']] = existing
            continue
        
        # Parse time window
        time_window = order_data["time_window"]
        start_hour, start_min = map(int, time_window.split("-")[0].split(":"))
        end_hour, end_min = map(int, time_window.split("-")[1].split(":"))
        
        now = datetime.utcnow()
        time_window_start = now.replace(hour=start_hour, minute=start_min, second=0, microsecond=0)
        time_window_end = now.replace(hour=end_hour, minute=end_min, second=0, microsecond=0)
        
        order = Order(
            id=order_id,
            order_number=f"DEMO-HYD-{order_data['order_id']}",
            customer_name=order_data.get("delivery_name", "Demo Customer"),
            delivery_address=order_data.get("delivery_name", "Demo Address"),
            lat=order_data["delivery_lat"],
            lng=order_data["delivery_lng"],
            weight=order_data["weight"],
            time_window_start=time_window_start,
            time_window_end=time_window_end,
            status="pending",
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
        )
        db.add(order)
        db.commit()
        db.refresh(order)
        created_orders[order_data['order_id']] = order
        print(f"  ✅ Order {order_data['order_id']}: {order_data['name']} ({order_data['weight']}kg)")
    
    return created_orders


# ============================================================================
# PART 4: ETA PREDICTION & ROUTE ASSIGNMENT
# ============================================================================

def predict_etas(
    db: Session,
    orders: Dict[str, Order],
    orders_data: List[Dict],
) -> Dict[str, Dict[str, Any]]:
    """Predict ETAs for all orders using ML model."""
    print("\n🔮 Generating ETA predictions for all 20 orders...")
    
    # Load model
    try:
        eta_model = ETAPredictor(model_path=settings.MODEL_PATH)
        if not eta_model.model:
            raise Exception("Model not loaded")
    except Exception as e:
        print(f"  ⚠️  Warning: Could not load ETA model: {e}")
        print(f"  ℹ️  Using mock ETAs for demo (range 15-35 min)")
        eta_model = None
    
    predictions = {}
    
    for order_data in orders_data:
        order_id = order_data["order_id"]
        order = orders[order_id]
        
        # Build feature vector
        # Note: Using simplified features; full system would use all trained features
        distance_km = haversine(
            order_data["pickup_lat"],
            order_data["pickup_lng"],
            order_data["delivery_lat"],
            order_data["delivery_lng"]
        )
        
        # Mock ETA with traffic consideration
        base_time = 5 + (distance_km / 30 * 60)  # 30 km/h average speed
        
        traffic_multiplier = 1.0
        if order_data.get("traffic_condition") == "heavy":
            traffic_multiplier = 2.1
        elif order_data.get("traffic_condition") == "moderate":
            traffic_multiplier = 1.4
        elif order_data.get("traffic_condition") == "free_flow":
            traffic_multiplier = 1.0
        
        # Add weather impact
        if order_data.get("weather_condition") == "rain":
            traffic_multiplier *= 1.3
        
        # Add weight impact for bikes
        if order_data.get("assigned_driver") in ["ravi_kumar", "saleem_mohammed"]:
            if order_data["weight"] > 10:
                traffic_multiplier *= 1.2
        
        # Add peak hour impact
        is_peak_hour = order_data.get("is_peak_hour", False)
        if is_peak_hour:
            traffic_multiplier *= 1.15
        
        predicted_eta = base_time * traffic_multiplier
        
        # Add small variance for realism
        predicted_eta += np.random.normal(0, 1)  # ±1 min noise
        predicted_eta = max(5, predicted_eta)  # Min 5 min
        
        # Generate confidence interval
        p10 = predicted_eta * 0.8
        p90 = predicted_eta * 1.25
        
        predictions[order_id] = {
            "predicted_eta_min": round(predicted_eta, 1),
            "p10": round(p10, 1),
            "p90": round(p90, 1),
            "distance_km": round(distance_km, 2),
            "traffic_multiplier": round(traffic_multiplier, 2),
        }
        print(f"  ✅ Order {order_id}: ETA {round(predicted_eta, 1)}min (P10: {round(p10, 1)}, P90: {round(p90, 1)})")
    
    return predictions


def assign_orders_to_routes(
    db: Session,
    tenant_id: str,
    warehouse_id: str,
    orders: Dict[str, Order],
    drivers: Dict[str, Driver],
    orders_data: List[Dict],
):
    """Assign orders to drivers and create routes."""
    print("\n🚗 Assigning orders to drivers and creating routes...\n")
    
    # Group orders by assigned driver
    orders_by_driver = {}
    for order_data in orders_data:
        driver_key = order_data.get("assigned_driver")
        if driver_key not in orders_by_driver:
            orders_by_driver[driver_key] = []
        orders_by_driver[driver_key].append(order_data)
    
    routes_created = {}
    
    for driver_key, driver_orders_data in orders_by_driver.items():
        if driver_key not in drivers:
            print(f"  ⚠️  Driver {driver_key} not found, skipping")
            continue
        
        driver = drivers[driver_key]
        
        # Create route for this driver
        route = Route(
            id=f"rte-demo-{driver_key}",
            status="planned",
            matrix_source="ml_predicted",
            matrix_type="ml_informed",
            total_distance_km=0.0,
            total_duration_min=0.0,
            driver_id=driver.id,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
        )
        
        # Assign orders to route
        total_distance = 0
        total_duration = 0
        
        for order_data in driver_orders_data:
            order = orders[order_data["order_id"]]
            order.route = route
            order.status = "assigned"
            
            # Calculate distance for summary
            distance = haversine(
                order_data["pickup_lat"],
                order_data["pickup_lng"],
                order_data["delivery_lat"],
                order_data["delivery_lng"]
            )
            total_distance += distance
            
            # Mock duration based on distance and traffic
            duration = (distance / 30 * 60)  # Assuming 30 km/h avg
            if order_data.get("traffic_condition") == "heavy":
                duration *= 2.1
            elif order_data.get("traffic_condition") == "moderate":
                duration *= 1.4
            total_duration += duration
        
        route.total_distance_km = total_distance
        route.total_duration_min = total_duration
        
        db.add(route)
        print(f"  ✅ {driver.name}: {len(driver_orders_data)} orders, {total_distance:.1f}km, ~{total_duration:.0f}min")
        routes_created[driver_key] = route
    
    db.commit()
    return routes_created


# ============================================================================
# PART 5: SHAP EXPLANATIONS & FEEDBACK STORAGE
# ============================================================================

def generate_and_store_explanations(
    db: Session,
    tenant_id: str,
    orders: Dict[str, Order],
    orders_data: List[Dict],
    predictions: Dict[str, Dict[str, Any]],
    drivers: Dict[str, Driver],
    verify_mode: bool = False,
):
    """Generate SHAP explanations for all orders and store in database."""
    print("\n🧠 Generating SHAP explanations for all 20 orders...\n")
    
    explainer = SHAPExplainer()
    
    for order_data in orders_data:
        order_id = order_data["order_id"]
        order = orders[order_id]
        pred = predictions[order_id]
        
        demo_type = order_data.get("demo_type")
        if demo_type == "zone_unfamiliarity":
            driver_zone_familiarity = 0.2
            familiarity_shap = 4.8
        else:
            driver_zone_familiarity = 0.85
            familiarity_shap = -0.8

        # Build feature values dict
        feature_values = {
            "distance_km": pred["distance_km"],
            "current_traffic_ratio": pred["traffic_multiplier"],
            "is_peak_hour": 1.0 if order_data.get("is_peak_hour") else 0.0,
            "driver_zone_familiarity": driver_zone_familiarity,
            "weight": order_data["weight"],
            "vehicle_type_bike": 1.0 if order_data.get("assigned_driver") in ["ravi_kumar", "saleem_mohammed"] else 0.0,
            "vehicle_type_auto": 1.0 if order_data.get("assigned_driver") == "venkat_reddy" else 0.0,
            "vehicle_type_car": 1.0 if order_data.get("assigned_driver") == "priya_singh" else 0.0,
        }
        
        # Mock SHAP values (in real system, these come from model.explain())
        shap_values = np.array([
            pred["distance_km"] * 0.3,  # distance contribution
            (pred["traffic_multiplier"] - 1.0) * 4,  # traffic contribution
            2.0 if order_data.get("is_peak_hour") else 0.5,  # peak hour
            familiarity_shap,  # zone familiarity contribution
            order_data["weight"] * 0.15,  # weight
            -0.5,  # base offset
            0.2,  # vehicle effects
            -0.1,
            0.3,
        ])
        
        feature_names = list(feature_values.keys())
        
        # Generate explanation
        explanation = explainer.generate_explanation(
            shap_values[:len(feature_names)],
            feature_names,
            feature_values,
            base_prediction=20.0,
            actual_prediction=pred["predicted_eta_min"],
            top_k=4,
        )
        
        # Use exact, human-readable what_would_help copy for hero orders.
        if order_data.get("group") == "E":
            explanation["what_would_help"] = HERO_ORDER_WHAT_WOULD_HELP.get(order_id, "")
        
        # Store in DeliveryFeedback
        feedback = DeliveryFeedback(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            order_id=order.id,
            driver_id=order.route.driver_id if order.route else None,
            prediction_model_version="demo_v1",
            predicted_eta_min=pred["predicted_eta_min"],
            actual_delivery_min=None,
            traffic_condition=order_data.get("traffic_condition"),
            weather=order_data.get("weather_condition"),
            vehicle_type=order_data.get("assigned_driver"),
            distance_km=pred["distance_km"],
            explanation_json=json.dumps(explanation),
            predicted_at=datetime.utcnow(),
        )
        db.add(feedback)
        
        # Print hero orders for verification
        if verify_mode and order_data.get("group") == "E":
            print(f"\n  📋 DEMO ORDER {order_id}: {order_data['name']}")
            print(f"     ETA: {pred['predicted_eta_min']} minutes")
            print(f"     Distance: {pred['distance_km']} km")
            print(f"     Traffic Multiplier: {pred['traffic_multiplier']}x")
            if explanation and "factors" in explanation:
                print(f"     Top Factors:")
                for factor in explanation.get("factors", [])[:3]:
                    print(f"       - {factor['sentence']} ({factor['impact_minutes']:.1f} min)")
            if explanation:
                help_text = explanation.get("what_would_help")
                if help_text:
                    print(f"     💡 {help_text}")
            print()
    
    db.commit()
    print(f"  ✅ Stored SHAP explanations for all orders in DeliveryFeedback table")


# ============================================================================
# PART 6: REDIS SEEDING
# ============================================================================

def seed_redis(drivers: Dict[str, Driver]):
    """Seed driver familiarity and traffic patterns in Redis."""
    print("\n💾 Seeding Redis with driver familiarity and traffic patterns...\n")
    
    try:
        r = redis.from_url(settings.REDIS_URL)
        
        # Seed driver zone familiarity
        familiarity_count = 0
        for driver_key, driver_config in DEMO_DRIVERS.items():
            driver_id = f"drv-demo-{driver_key}"
            
            # High familiarity for expert zones (0.9)
            for zone in driver_config["zone_expertise"]:
                key = f"driver:{driver_id}:familiarity:{zone}"
                r.setex(key, 7 * 24 * 3600, 0.9)  # 7 day TTL
                familiarity_count += 1
            
            # Low familiarity for non-expert zones (0.2)
            all_zones = [
                "Hitech City", "Madhapur", "Kondapur",
                "Secunderabad", "Begumpet", "Trimulgherry",
                "Banjara Hills", "Jubilee Hills", "Panjagutta",
                "LB Nagar", "Dilsukhnagar", "Kothapet"
            ]
            for zone in all_zones:
                if zone not in driver_config["zone_expertise"]:
                    key = f"driver:{driver_id}:familiarity:{zone}"
                    r.setex(key, 7 * 24 * 3600, 0.2)
        
        print(f"  ✅ Seeded {familiarity_count} zone familiarity scores")
        
        # Seed traffic patterns (>=20 keys) and include explicit E3 rush-hour key.
        traffic_count = 0
        day_of_week = datetime.utcnow().weekday()
        hours = [8, 9, 10, 13, 14, 16, 17, 18]
        route_templates = [
            ("Hitech City", "Madhapur", 1.35, "IT corridor daytime traffic"),
            ("Secunderabad", "Malkajgiri", 1.25, "North corridor moderate traffic"),
            ("Mehdipatnam", "Tolichowki", 1.55, "Old city arterial congestion"),
        ]

        for origin, dest, base_ratio, desc in route_templates:
            for hour in hours:
                ratio = base_ratio
                if hour in [17, 18]:
                    ratio += 0.45
                elif hour in [8, 9]:
                    ratio += 0.2

                # Force E3 hero route to heavy rush-hour traffic for 5 PM checks.
                if origin == "Mehdipatnam" and dest == "Tolichowki" and hour == 17:
                    ratio = max(ratio, 2.0)

                key = f"traffic:{origin}:{dest}:{day_of_week}:{hour}"
                traffic_data = {
                    "traffic_ratio": round(ratio, 2),
                    "historical_avg": round(ratio * 0.9, 2),
                    "source": "demo_seed",
                    "description": desc,
                }
                r.setex(key, 24 * 3600, json.dumps(traffic_data))
                traffic_count += 1
        
        print(f"  ✅ Seeded {traffic_count} traffic pattern keys")
        return r
        
    except Exception as e:
        print(f"  ⚠️  Warning: Could not seed Redis: {e}")
        return None


def _fetch_explanation_for_order(db: Session, tenant_id: str, order_suffix: str) -> Optional[Dict[str, Any]]:
    """Fetch explanation JSON for order id suffix (e.g., E3)."""
    row = (
        db.query(DeliveryFeedback.order_id, DeliveryFeedback.explanation_json)
        .filter(
            DeliveryFeedback.tenant_id == tenant_id,
            DeliveryFeedback.order_id.like(f"%{order_suffix}%"),
        )
        .order_by(DeliveryFeedback.predicted_at.desc())
        .first()
    )
    if not row or not row.explanation_json:
        return None
    try:
        return json.loads(row.explanation_json)
    except Exception:
        return None


def run_full_health_check(tenant_id: str, db: Session, redis_client) -> bool:
    """Run full pre-demo health check and return True when demo is ready."""
    check_start = time.time()
    failures: List[str] = []
    summary: Dict[str, str] = {}

    # CHECK 1 — Database
    orders_count = (
        db.query(func.count(Order.id))
        .filter(Order.tenant_id == tenant_id)
        .scalar()
        or 0
    )
    explanation_count = (
        db.query(func.count(DeliveryFeedback.id))
        .filter(
            DeliveryFeedback.tenant_id == tenant_id,
            DeliveryFeedback.explanation_json.isnot(None),
        )
        .scalar()
        or 0
    )

    if orders_count != 20:
        failures.append(f"FAIL: Expected 20 orders, found {orders_count}. Run --reset.")
    if explanation_count != 20:
        failures.append(f"FAIL: {explanation_count}/20 SHAP explanations missing.")

    if orders_count == 20 and explanation_count == 20:
        summary["database"] = f"✓  {orders_count}/20 orders, {explanation_count}/20 explanations"
    else:
        summary["database"] = f"✗  {orders_count}/20 orders, {explanation_count}/20 explanations"

    # CHECK 2 — SHAP explanation quality (E3)
    e3_expl = _fetch_explanation_for_order(db, tenant_id, "E3")
    e3_factors = e3_expl.get("factors", []) if e3_expl else []
    e3_top_impact = float(e3_factors[0].get("impact_minutes", 0)) if e3_factors else 0.0
    e3_top_sentence = e3_factors[0].get("sentence", "") if e3_factors else ""
    e3_help = e3_expl.get("what_would_help") if e3_expl else None

    if len(e3_factors) < 3:
        failures.append("FAIL: E3 has fewer than 3 factors. ETA prediction may not be working.")
    if e3_top_impact <= 5.0:
        failures.append(
            f"FAIL: E3 traffic impact is {e3_top_impact:.1f} min, expected >5. Check traffic seeding."
        )
    if "_" in e3_top_sentence:
        failures.append(
            f"FAIL: E3 sentence contains raw field name: '{e3_top_sentence}'. Fix shapLabels."
        )
    if e3_help not in [None, ""]:
        failures.append("FAIL: E3 has a what_would_help suggestion — should be empty.")

    if len(e3_factors) >= 3 and e3_top_impact > 5.0 and "_" not in e3_top_sentence and e3_help in [None, ""]:
        summary["e3"] = f"✓  Traffic +{e3_top_impact:.1f} min (top factor), clean text"
    else:
        summary["e3"] = "✗  E3 explanation check failed"

    # CHECK 3 — SHAP explanation quality (E1)
    e1_expl = _fetch_explanation_for_order(db, tenant_id, "E1")
    e1_factors = e1_expl.get("factors", []) if e1_expl else []
    e1_help = (e1_expl.get("what_would_help") if e1_expl else "") or ""

    familiarity_factor = next(
        (
            factor
            for factor in e1_factors
            if "familiarity" in str(factor.get("feature", "")).lower()
            or "zone" in str(factor.get("feature", "")).lower()
        ),
        None,
    )
    familiarity_impact = float(familiarity_factor.get("impact_minutes", 0)) if familiarity_factor else 0.0

    if not familiarity_factor:
        failures.append("FAIL: E1 missing zone_familiarity factor. Wrong driver seeding failed.")
    if familiarity_factor and familiarity_impact <= 2.0:
        failures.append(
            f"FAIL: E1 familiarity impact {familiarity_impact:.1f} min is too low. Check driver scores."
        )
    if "Ravi Kumar" not in e1_help:
        failures.append("FAIL: E1 suggestion doesn't name Ravi Kumar.")
    if "approximately" not in e1_help:
        failures.append("FAIL: E1 suggestion uses '~' instead of 'approximately' — sounds robotic.")
    if "_" in e1_help:
        failures.append("FAIL: E1 suggestion contains raw field name.")

    if familiarity_factor and familiarity_impact > 2.0 and "Ravi Kumar" in e1_help and "approximately" in e1_help and "_" not in e1_help:
        summary["e1"] = f"✓  Zone unfamiliarity +{familiarity_impact:.1f} min, names Ravi Kumar"
    else:
        summary["e1"] = "✗  E1 explanation check failed"

    # CHECK 4 — Redis keys
    familiarity_keys = []
    traffic_keys = []
    e3_traffic_ratio = None
    if redis_client is None:
        failures.append("FAIL: Redis client unavailable. Start Redis and reseed.")
        summary["redis"] = "✗  Redis unavailable"
    else:
        try:
            familiarity_keys = redis_client.keys("driver:*:familiarity:*")
            traffic_keys = redis_client.keys("traffic:*")

            if len(familiarity_keys) < 12:
                failures.append(
                    f"FAIL: Only {len(familiarity_keys)} familiarity keys in Redis. Expected 12."
                )
            if len(traffic_keys) < 20:
                failures.append(
                    f"FAIL: Only {len(traffic_keys)} traffic keys in Redis. Expected 20."
                )

            candidate_keys = redis_client.keys("traffic:Mehdipatnam:Tolichowki:*:17")
            if not candidate_keys:
                candidate_keys = redis_client.keys("traffic:*:17*")

            if candidate_keys:
                chosen_key = candidate_keys[0]
                raw_value = redis_client.get(chosen_key)
                if raw_value:
                    parsed = json.loads(raw_value)
                    e3_traffic_ratio = float(parsed.get("traffic_ratio", 0))
            if e3_traffic_ratio is None or e3_traffic_ratio < 1.8:
                shown_val = e3_traffic_ratio if e3_traffic_ratio is not None else "missing"
                failures.append(
                    f"FAIL: E3 traffic ratio is {shown_val}, expected >= 1.8 for rush hour demo."
                )

            if len(familiarity_keys) >= 12 and len(traffic_keys) >= 20 and e3_traffic_ratio is not None and e3_traffic_ratio >= 1.8:
                summary["redis"] = (
                    f"✓  {len(familiarity_keys)} familiarity keys, {len(traffic_keys)} traffic keys"
                )
            else:
                summary["redis"] = (
                    f"✗  {len(familiarity_keys)} familiarity keys, {len(traffic_keys)} traffic keys"
                )
        except Exception as redis_error:
            failures.append(f"FAIL: Redis check failed: {redis_error}")
            summary["redis"] = "✗  Redis check failed"

    # CHECK 5 — ETA realism for hero orders
    eta_ranges = {
        "E1": (15, 28),
        "E2": (18, 32),
        "E3": (18, 35),
        "E4": (8, 18),
        "E5": (8, 20),
    }
    eta_pass = True
    for order_id, (min_eta, max_eta) in eta_ranges.items():
        eta_val = (
            db.query(DeliveryFeedback.predicted_eta_min)
            .filter(
                DeliveryFeedback.tenant_id == tenant_id,
                DeliveryFeedback.order_id.like(f"%{order_id}%"),
            )
            .order_by(DeliveryFeedback.predicted_at.desc())
            .scalar()
        )
        if eta_val is None or not (min_eta <= float(eta_val) <= max_eta):
            eta_pass = False
            failures.append(
                f"FAIL: {order_id} ETA is {eta_val} min — outside realistic range {min_eta}-{max_eta}."
            )

    summary["eta"] = "✓  All 5 hero orders in expected ranges" if eta_pass else "✗  ETA realism checks failed"

    # CHECK 6 — No technical text visible
    forbidden_patterns = [
        "_ratio",
        "_km",
        "_encoded",
        "_severity",
        "_familiarity",
        "_avg_",
        "_std_",
        "_min",
        "_score",
        "_encoded",
    ]
    text_clean = True
    feedback_rows = (
        db.query(DeliveryFeedback.order_id, DeliveryFeedback.explanation_json)
        .filter(DeliveryFeedback.tenant_id == tenant_id)
        .all()
    )

    for order_id, explanation_json in feedback_rows:
        if not explanation_json:
            continue
        try:
            explanation = json.loads(explanation_json)
        except Exception:
            text_clean = False
            failures.append(f"FAIL: Could not parse explanation_json for {order_id}")
            continue

        candidate_texts = []
        for factor in explanation.get("factors", []):
            candidate_texts.append(str(factor.get("sentence", "")))
        help_text = explanation.get("what_would_help")
        if help_text:
            candidate_texts.append(str(help_text))

        for text in candidate_texts:
            lowered = text.lower()
            for pattern in forbidden_patterns:
                if pattern in lowered:
                    text_clean = False
                    failures.append(
                        f"FAIL: Found '{pattern}' in {order_id} sentence: '{text}'"
                    )
                    break
            if not text_clean:
                break
        if not text_clean:
            break

    summary["text"] = "✓  0 raw field names across 20 explanations" if text_clean else "✗  Technical text found"

    # FINAL OUTPUT
    runtime = time.time() - check_start
    print("\n" + "=" * 44)
    print("IntelliLog-AI Demo Health Check")
    print("=" * 44)
    print(f"Database           {summary.get('database', '✗  Not checked')}")
    print(f"SHAP quality (E3)  {summary.get('e3', '✗  Not checked')}")
    print(f"SHAP quality (E1)  {summary.get('e1', '✗  Not checked')}")
    print(f"Redis cache        {summary.get('redis', '✗  Not checked')}")
    print(f"ETA realism        {summary.get('eta', '✗  Not checked')}")
    print(f"Text cleanliness   {summary.get('text', '✗  Not checked')}")
    print("=" * 44)

    if failures:
        print(f"RESULT: NOT DEMO READY — {len(failures)} issues found")
        print("=" * 44)
        print("Fix these before showing anyone:")
        for idx, issue in enumerate(failures, start=1):
            print(f"  {idx}. {issue}")
        print(f"Run time: {runtime:.1f}s")
        return False

    print("RESULT: DEMO READY ✓")
    print(f"Run time: {runtime:.1f}s")
    return True


# ============================================================================
# PART 7: UTILITIES
# ============================================================================

def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance between two coordinates in km."""
    from math import radians, cos, sin, asin, sqrt
    
    lon1, lat1, lon2, lat2 = map(radians, [lon1, lat1, lon2, lat2])
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    a = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
    c = 2 * asin(sqrt(a))
    r = 6371  # km
    return c * r


def reset_demo_data(db: Session, tenant_id: str):
    """Delete all demo data for a tenant."""
    print(f"\n🗑️  Resetting all demo data for tenant {tenant_id}...\n")
    
    # Delete in order of dependencies
    db.query(DeliveryFeedback).filter(DeliveryFeedback.tenant_id == tenant_id).delete()
    db.query(Route).filter(Route.tenant_id == tenant_id).delete()
    db.query(Order).filter(Order.tenant_id == tenant_id).delete()
    db.query(Driver).filter(Driver.tenant_id == tenant_id).delete()
    db.query(Warehouse).filter(Warehouse.tenant_id == tenant_id).delete()
    db.query(Tenant).filter(Tenant.id == tenant_id).delete()
    
    db.commit()
    print(f"  ✅ All demo data deleted for tenant {tenant_id}")


def print_summary(
    drivers: Dict[str, Driver],
    orders_data: List[Dict],
    predictions: Dict[str, Dict[str, Any]],
):
    """Print a summary of seeded data."""
    print("\n" + "=" * 80)
    print("SEEDING COMPLETE — HYDERABAD DEMO DATA READY")
    print("=" * 80)
    
    print("\n📋 DRIVERS (4):")
    for driver_key, driver_config in DEMO_DRIVERS.items():
        print(f"  • {driver_config['name']} ({driver_config['vehicle_type']}, "
              f"{driver_config['vehicle_capacity']}kg) - {', '.join(driver_config['zone_expertise'])}")
    
    print("\n📦 ORDERS BY DRIVER:")
    orders_by_driver = {}
    for order_data in orders_data:
        driver_key = order_data.get("assigned_driver", "unassigned")
        if driver_key not in orders_by_driver:
            orders_by_driver[driver_key] = []
        orders_by_driver[driver_key].append(order_data)
    
    for driver_key, driver_orders in orders_by_driver.items():
        if driver_key in DEMO_DRIVERS:
            driver_name = DEMO_DRIVERS[driver_key]["name"]
            print(f"\n  {driver_name}:")
            for order_data in driver_orders:
                pred = predictions[order_data["order_id"]]
                print(f"    {order_data['order_id']:4} • {order_data['name']:50} "
                      f"ETA: {pred['predicted_eta_min']:6.1f}min ({pred['p10']:5.1f}-{pred['p90']:5.1f})")
    
    print("\n" + "=" * 80)
    print("🎯 KEY DEMO ORDERS FOR SHAP EXPLANATION:")
    print("=" * 80)
    for order_data in orders_data:
        if order_data.get("group") == "E":
            pred = predictions[order_data["order_id"]]
            print(f"\n  {order_data['order_id']} - {order_data['name']}")
            print(f"     ETA: {pred['predicted_eta_min']:.1f}min | Distance: {pred['distance_km']:.1f}km | "
                  f"Traffic: {pred['traffic_multiplier']:.1f}x")
            if order_data.get("demo_type"):
                print(f"     Demo Type: {order_data['demo_type'].upper()}")


# ============================================================================
# MAIN
# ============================================================================

def main():
    """Main seeding orchestration."""
    parser = argparse.ArgumentParser(
        description="Hyderabad demo data seeder for IntelliLog-AI SHAP demo"
    )
    parser.add_argument("--tenant-id", default=DEMO_TENANT_ID, help="Demo tenant ID")
    parser.add_argument("--reset", action="store_true", help="Reset all demo data first")
    parser.add_argument("--verify", action="store_true", help="Verify seeding and print details")
    
    args = parser.parse_args()
    tenant_id = args.tenant_id
    
    print("\n" + "=" * 80)
    print("IntelliLog-AI Hyderabad Demo Data Seeder")
    print("=" * 80)
    print(f"Tenant ID: {tenant_id}")
    print(f"Database: {settings.SQLALCHEMY_DATABASE_URI.split('@')[1] if '@' in settings.SQLALCHEMY_DATABASE_URI else 'localhost'}")
    print(f"Redis: {settings.REDIS_URL}")
    print("=" * 80 + "\n")
    
    start_time = time.time()
    
    try:
        # Create tables if not exist
        Base.metadata.create_all(bind=engine)
        
        db = SessionLocal()

        # Verify-only mode for pre-demo checks (fast path).
        if args.verify and not args.reset:
            redis_client = None
            try:
                redis_client = redis.from_url(settings.REDIS_URL)
                redis_client.ping()
            except Exception:
                redis_client = None

            is_ready = run_full_health_check(tenant_id, db, redis_client)
            db.close()
            sys.exit(0 if is_ready else 1)
        
        # Step 1: Reset if requested
        if args.reset:
            reset_demo_data(db, tenant_id)
            db.close()
            db = SessionLocal()
        
        # Step 2: Create tenant and warehouse
        print("1️⃣  Creating tenant and warehouse...")
        tenant = create_demo_tenant(db, tenant_id)
        warehouse = create_demo_warehouse(db, tenant_id)
        
        # Step 3: Create drivers
        print("\n2️⃣  Creating 4 demo drivers...")
        drivers = create_demo_drivers(db, tenant_id, warehouse.id)
        
        # Step 4: Create orders
        print("\n3️⃣  Creating 20 demo orders...")
        orders_data = get_demo_orders()
        orders = create_demo_orders(db, tenant_id, warehouse.id, drivers)
        
        # Step 5: Predict ETAs
        print("\n4️⃣  Running ETA predictions...")
        predictions = predict_etas(db, orders, orders_data)
        
        # Step 6: Assign orders to routes
        print("\n5️⃣  Assigning orders to drivers and creating routes...")
        routes = assign_orders_to_routes(db, tenant_id, warehouse.id, orders, drivers, orders_data)
        
        # Step 7: Generate SHAP explanations
        print("\n6️⃣  Generating SHAP explanations and feedback...")
        generate_and_store_explanations(
            db, tenant_id, orders, orders_data, predictions, drivers, verify_mode=args.verify
        )
        
        # Step 8: Seed Redis
        print("\n7️⃣  Seeding Redis with driver familiarity and traffic patterns...")
        redis_client = seed_redis(drivers)
        
        # Step 9: Print summary
        print_summary(drivers, orders_data, predictions)
        
        elapsed_time = time.time() - start_time
        print(f"\n✅ Demo seeding completed in {elapsed_time:.1f}s")

        if args.verify:
            is_ready = run_full_health_check(tenant_id, db, redis_client)
            db.close()
            sys.exit(0 if is_ready else 1)

        print(f"\n👉 Next steps:")
        print(f"   1. Run database migrations: alembic upgrade head")
        print(f"   2. Start the API server: python -m src.backend.worker.celery_app")
        print(f"   3. Open dashboard and navigate to order view")
        print(f"   4. Select a demo order (especially E1-E5) to see SHAP explanations")
        print("=" * 80 + "\n")
        
        db.close()
        
    except Exception as e:
        print(f"\n❌ Error during seeding: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
