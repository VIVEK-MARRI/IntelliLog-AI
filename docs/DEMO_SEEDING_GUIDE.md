# 🎯 Hyderabad SHAP Demo Data Seeding Guide

This document explains how to seed realistic demo data for the IntelliLog-AI SHAP explainability demo in Hyderabad.

## Quick Start

### Prerequisites

1. **Database**: PostgreSQL running with the IntelliLog database
2. **Redis**: Running for caching driver familiarity and traffic patterns
3. **Python Environment**: IntelliLog-AI dependencies installed
4. **Model**: Latest trained ETA model available at `models/xgb_delivery_time_model.pkl`

### Run Seeding

```bash
# Basic seeding with default tenant
python scripts/seed_demo_hyderabad.py --tenant-id demo-tenant-001

# Reset and reseed (clean slate before demo)
python scripts/seed_demo_hyderabad.py --reset --tenant-id demo-tenant-001

# Seed and verify hero orders
python scripts/seed_demo_hyderabad.py --verify --tenant-id demo-tenant-001
```

## What Gets Created

### 4 Demo Drivers

Each driver is designed to showcase different SHAP explanation factors:

| Driver | Vehicle | Capacity | Zones | Purpose |
|--------|---------|----------|-------|---------|
| **Ravi Kumar** | Bike | 15kg | Hitech City, Madhapur, Kondapur | IT Corridor expert - low zone unfamiliarity SHAP values |
| **Saleem Mohammed** | Bike | 15kg | Secunderabad, Begumpet, Trimulgherry | Northern area expert - high SHAP when sent south |
| **Venkat Reddy** | Auto | 50kg | Banjara Hills, Jubilee Hills, Panjagutta | Central specialist - vehicle type SHAP contributions |
| **Priya Singh** | Car | 100kg | LB Nagar, Dilsukhnagar, Kothapet | Southeast specialist - vehicle weight SHAP factor |

### 20 Realistic Delivery Orders

#### Group A: IT Corridor (→ Ravi Kumar)
- **A1**: Hitech City MMTS → Mindspace Madhapur | 2.5kg | 10:00-12:00
- **A2**: Cyberabad Police → DLF Cyber City | 1.2kg | 09:30-11:30
- **A3**: IKEA → Raheja Mindspace | 8.0kg | 11:00-14:00

**Expected SHAP**: Low zone_unfamiliarity (Ravi is expert), moderate traffic

#### Group B: Old City / Central (→ Venkat Reddy)
- **B1**: Charminar → Banjara Hills Road 12 | 3.0kg | 14:00-17:00
- **B2**: Laad Bazaar → GVK One Mall | 0.8kg | 13:30-16:30
- **B3**: Osmania Hospital → Apollo Hospital | 1.5kg | 10:00-13:00
- **B4**: Nampally Station → Panjagutta Metro | 5.5kg | 11:00-14:00

**Expected SHAP**: HIGH traffic (old city congestion), auto vehicle type factor

#### Group C: Secunderabad (→ Saleem Mohammed)
- **C1**: Paradise Hotel → Trimulgherry | 4.0kg | 12:00-15:00
- **C2**: Secunderabad Station → Begumpet | 2.2kg | 09:00-11:00
- **C3**: SD Road → Patny Centre | 1.0kg | 14:00-17:00

**Expected SHAP**: Low zone_unfamiliarity (Saleem home zone), moderate traffic

#### Group D: Southeast (→ Priya Singh)
- **D1**: LB Nagar Metro → Dilsukhnagar | 3.5kg | 10:00-13:00
- **D2**: Kothapet Road → Nagole Metro | 2.0kg | 11:30-14:30

**Expected SHAP**: Low zone_unfamiliarity (Priya home zone)

#### Group E: SHAP Demo Heroes (Wrong Driver Assignments)
These orders intentionally have wrong driver assignments to showcase SHAP explanations:

- **E1** 🎬 **IT Corridor → Priya (wrong!)**
  - Gachibowli Stadium → Microsoft Campus | 2.8kg | 15:00-18:00
  - Demo Type: `zone_unfamiliarity`
  - Expected SHAP: +4 to +6 minutes for wrong zone
  - Suggestion: "Assigning Ravi Kumar (IT expert) saves ~5 minutes"

- **E2** 🎬 **Secunderabad → Venkat (wrong!)**
  - Bowenpally Market → Malkajgiri Railway | 4.5kg | 13:00-16:00
  - Demo Type: `zone_unfamiliarity`
  - Expected SHAP: +3 to +5 minutes for wrong zone
  - Suggestion: "Assigning Saleem Mohammed (Secunderabad expert) saves ~4 minutes"

- **E3** 🎬 **RUSH HOUR HERO ORDER**
  - Mehdipatnam Bus → Tolichowki Junction | 1.8kg | 17:00-19:00 ⏰
  - Demo Type: `traffic_peak_hour`
  - Expected SHAP: +7 to +10 minutes (traffic), +3 minutes (peak hour)
  - **This is the primary demo order** - shows traffic as dominant factor
  - Expected ETA: 24 minutes (P10: 20, P90: 31)

- **E4** 🎬 **WEATHER DEMO**
  - Himayatnagar Main Road → Somajiguda Circle | 0.9kg | 16:00-19:00 🌧️
  - Demo Type: `weather`
  - Expected SHAP: +2 to +4 minutes for rain
  - Seeded with weather_condition='rain'

- **E5** 🎬 **HEAVY PACKAGE DEMO**
  - Kukatpally Housing Board → JNTU | 18.5kg (near bike capacity!) | 09:00-12:00
  - Demo Type: `vehicle_weight`
  - Expected SHAP: +3 to +5 minutes (weight exceeds typical bike load)
  - Note: Assigned to Ravi (bike) to trigger weight penalty

## Redis Seeding

The script seeds Redis with:

### Driver Zone Familiarity
- **Key Pattern**: `driver:{driver_id}:familiarity:{zone_name}`
- **Values**:
  - `0.9` for expert zones (high familiarity)
  - `0.2` for non-expert zones (low)
- **TTL**: 7 days

### Traffic Patterns
- **Key Pattern**: `traffic:{origin_zone}:{dest_zone}:{weekday}:{hour}`
- **Values**: JSON with traffic_ratio, historical_avg, source="demo_seed"
- **TTL**: 24 hours

## ETA Prediction Performance

The seeding script predicts realistic ETAs based on:

| Factor | Multiplier | Example |
|--------|-----------|---------|
| Base time | 5 + (distance×2) min | 3km → ~11 min base |
| Free flow | 1.0x | Secunderabad, early morning |
| Moderate traffic | 1.4x | Typical morning/afternoon |
| Heavy traffic | 2.1x | Old city, rush hour |
| Rain | ×1.3 | Applied on top of traffic |
| Bike weight penalty | ×1.2 | If weight > 10kg on bike |
| Peak hour | ×1.15 | 17:00-19:00, rush hour |

## Database Changes

A migration was created to add new fields to the `drivers` table:

```sql
-- New columns added to drivers table
ALTER TABLE drivers ADD COLUMN vehicle_type VARCHAR DEFAULT 'bike';
ALTER TABLE drivers ADD COLUMN zone_expertise JSON;
```

Run migrations:
```bash
alembic upgrade head
```

## SHAP Explanations Stored

Each order gets a `DeliveryFeedback` record in the database with:

```json
{
  "summary": "Predicted 24 minutes with moderate confidence",
  "factors": [
    {
      "feature": "current_traffic_ratio",
      "impact_minutes": 8.2,
      "direction": "positive",
      "sentence": "Heavy traffic on route: +8 min",
      "importance_rank": 1,
      "shap_value": 8.2
    },
    ...
  ],
  "what_would_help": "Switch to Venkat Reddy (Banjara Hills expert, saves ~1 min)",
  "confidence_pct": 82
}
```

Stored in: `delivery_feedback.explanation_json` column

## Demo Workflow (30 Minutes Before Live Demo)

1. **Reset database**:
   ```bash
   python scripts/seed_demo_hyderabad.py --reset --tenant-id demo-tenant-001
   ```

2. **Verify seeding**:
   ```bash
   python scripts/seed_demo_hyderabad.py --verify --tenant-id demo-tenant-001
   ```
   
   Expected output:
   ```
   ✓ 4 drivers created
   ✓ 20 orders created
   ✓ 20 ETA predictions generated
   ✓ Routes optimized (matrix_source = "ml_predicted" for all)
   ✓ 20 SHAP explanations stored
   ✓ 5 hero orders verified
   ✓ Redis: 12 familiarity keys + 20 traffic keys
   ```

3. **Start services** (if not running):
   ```bash
   # Terminal 1: API Server
   python -m src.backend.worker.celery_app
   
   # Terminal 2: Dashboard
   streamlit run src/dashboard/app.py
   ```

4. **Open dashboard**: http://localhost:8501

5. **Navigate to order view** and select:
   - **E3 (RUSH HOUR)**: Shows traffic as #1 SHAP factor
   - **E1 or E2 (WRONG DRIVER)**: Shows zone_unfamiliarity SHAP value
   - **E5 (HEAVY PACKAGE)**: Shows vehicle_weight SHAP factor

## Expected Dashboard Behavior

### Order E3 (Rush Hour Hero)
- **ETA**: 24 minutes displayed
- **Confidence**: 82% within 5 minutes
- **Top SHAP Factors**:
  1. Traffic: +8 min ← **Dispatcher recognizes this road**
  2. Peak hour (5 PM): +3 min
  3. Distance (3.2 km): +2 min
  4. Driver unfamiliarity: +1 min
- **What would help**: "Switch to Venkat Reddy (saves ~1 min)" ← Specific suggestion

### Order E1 (Wrong Driver Demo)
- **ETA**: 22 minutes
- **Top SHAP Factors**:
  1. Zone unfamiliarity: +4 min ← **Priya not expert in IT corridor**
  2. Traffic: +2 min
  3. Distance: +2 min
- **What would help**: "Assigning Ravi Kumar saves ~5 minutes"

## Troubleshooting

### "Model not loaded" warning
- The script uses mock ETAs if the model path doesn't exist
- This is **OK for demo** - ETAs will still be realistic
- To fix, provide path: `MODEL_PATH=models/xgb_delivery_time_model.pkl`

### Redis connection fails
- Verify Redis is running: `redis-cli ping`
- Check `REDIS_URL` environment variable
- The script continues without Redis (driver familiarity won't be seeded)

### Database migration errors
```bash
# Check current migration:
alembic current

# Run migrations:
alembic upgrade head

# Downgrade if needed:
alembic downgrade -1
```

### Orders not appearing in dashboard
1. Refresh browser (Ctrl+F5)
2. Check database: `SELECT COUNT(*) FROM orders WHERE tenant_id = 'demo-tenant-001';`
3. Check logs for errors

## Performance Notes

- **Seeding time**: ~4-5 seconds for all 20 orders
- **Database size**: ~50KB for all demo data + explanations
- **Redis keys**: ~32 keys (12 familiarity + 20 traffic)
- **Memory impact**: Negligible

## API Endpoints for Demo Data

Once seeded, access via API:

```bash
# List all orders for tenant
curl http://localhost:8000/api/v1/orders?tenant_id=demo-tenant-001

# Get specific order with SHAP explanation
curl http://localhost:8000/api/v1/orders/{order_id}

# Get delivery feedback with explanation
curl http://localhost:8000/api/v1/delivery-feedback/{feedback_id}

# Predict ETA for new order
POST http://localhost:8000/api/v1/predict-eta
{
  "orders": [{
    "distance_km": 3.5,
    "traffic_ratio": 1.6,
    "weight": 2.5,
    "vehicle_type": "bike"
  }]
}
```

## Next Steps

After successful seeding and verification:

1. **Review SHAP explanations** in database:
   ```sql
   SELECT order_id, explanation_json 
   FROM delivery_feedback 
   WHERE tenant_id = 'demo-tenant-001' 
   ORDER BY predicted_at DESC;
   ```

2. **Test VRP optimization**:
   ```bash
   curl -X POST http://localhost:8000/api/v1/optimize-routes \
     -H "Content-Type: application/json" \
     -d '{"tenant_id": "demo-tenant-001", "method": "ml_informed"}'
   ```

3. **Export demo data** if needed:
   ```bash
   python scripts/export_demo_data.py --tenant-id demo-tenant-001
   ```

---

**Demo Ready!** 🚀 All 20 orders with realistic Hyderabad geography, traffic patterns, and SHAP explanations are seeded and ready for live demonstration.
