# 📋 IntelliLog-AI Scripts Directory

## Hyderabad Demo Data Seeding

### Quick Start

```bash
# Seed production-ready demo data with realistic Hyderabad orders
python seed_demo_hyderabad.py --tenant-id demo-tenant-001

# Reset existing demo data and reseed fresh
python seed_demo_hyderabad.py --reset --tenant-id demo-tenant-001

# Seed and verify with detailed output
python seed_demo_hyderabad.py --verify --tenant-id demo-tenant-001

# Windows PowerShell
.\seed-demo.ps1 -Reset -Verify
```

### What It Does

The **seed_demo_hyderabad.py** script creates:

✅ **4 Demo Drivers** with zone expertise
- Ravi Kumar (Bike, IT Corridor expert)
- Saleem Mohammed (Bike, Secunderabad expert)  
- Venkat Reddy (Auto, Central Hyderabad expert)
- Priya Singh (Car, Southeast expert)

✅ **20 Realistic Delivery Orders**
- Groups A-D: 15 standard orders assigned to appropriate drivers
- Group E: 5 "hero" orders for SHAP demonstration
  - E1: Zone unfamiliarity showcase
  - E2: Driver mismatch demo
  - E3: Rush hour traffic hero (PRIMARY DEMO)
  - E4: Weather impact demo
  - E5: Vehicle weight constraint demo

✅ **ETA Predictions** based on:
- Distance, traffic conditions, vehicle type, weight, weather, peak hours
- Realistic traffic multipliers for Hyderabad zones
- Confidence intervals (P10/P90)

✅ **SHAP Explanations** stored in database:
- Human-readable factor breakdowns
- Specific time impact quantification
- Actionable driver reassignment suggestions

✅ **Redis Caching**:
- Driver zone familiarity scores (0.9 expert, 0.2 non-expert)
- Traffic patterns by route/zone/time

### Real Hyderabad Coordinates

All 20 orders use verified actual locations:

**IT Corridor**: Hitech City MMTS, Mindspace Madhapur, DLF Cyber City, Microsoft Campus, Raheja Mindspace
**Old City**: Charminar, Banjara Hills, Laad Bazaar, GVK One, Apollo Hospital
**North**: Secunderabad Station, Begumpet, Trimulgherry, Paradise Hotel
**Southeast**: LB Nagar, Dilsukhnagar, Kothapet, Nagole Metro

### Database Changes

Migration **2026_03_20_driver_expertise.py** adds:

```sql
ALTER TABLE drivers ADD COLUMN vehicle_type VARCHAR DEFAULT 'bike';
ALTER TABLE drivers ADD COLUMN zone_expertise JSON;
```

Must run migrations first:
```bash
alembic upgrade head
```

### Arguments

- `--tenant-id` (default: `demo-tenant-001`)
  - Tenant identifier for multi-tenancy
  - Different tenants can have different demo data

- `--reset`
  - Deletes all existing demo data for the tenant
  - Use this before each new demo to start clean
  - **Warning**: Destructive - confirms deletion first

- `--verify`
  - Prints detailed information about hero orders
  - Shows SHAP factor breakdowns for E1-E5
  - Useful for pre-demo verification

### Expected Output

```
==============================================================
IntelliLog-AI Hyderabad Demo Data Seeder
==============================================================
Tenant ID: demo-tenant-001
Database: localhost:5433/intellog
Redis: localhost:6379/0
==============================================================

1️⃣  Creating tenant and warehouse...
  ✅ Created demo tenant: Hyderabad Logistics Demo
  ✅ Created demo warehouse: Hyderabad Central Hub

2️⃣  Creating 4 demo drivers...
  ✅ Ravi Kumar (bike, 15kg) - zones: Hitech City, Madhapur, Kondapur
  ✅ Saleem Mohammed (bike, 15kg) - zones: Secunderabad, Begumpet, Trimulgherry
  ✅ Venkat Reddy (auto, 50kg) - zones: Banjara Hills, Jubilee Hills, Panjagutta
  ✅ Priya Singh (car, 100kg) - zones: LB Nagar, Dilsukhnagar, Kothapet

3️⃣  Creating 20 demo orders...
  ✅ Order A1: Hitech City to Mindspace (2.5kg)
  ✅ Order A2: Police to DLF Cyber City (1.2kg)
  ... [18 more]

4️⃣  Generating ETA predictions for all 20 orders...
  ✅ Order A1: ETA 10.2min (P10: 8.2, P90: 12.8)
  ✅ Order E3: ETA 24.1min (P10: 19.3, P90: 30.1)  ← RUSH HOUR HERO
  ... [18 more]

5️⃣  Assigning orders to drivers and creating routes...
  ✅ Ravi Kumar: 4 orders, 12.4km, ~45min
  ✅ Venkat Reddy: 5 orders, 28.3km, ~110min
  ✅ Saleem Mohammed: 3 orders, 18.5km, ~65min
  ✅ Priya Singh: 2 orders, 15.2km, ~52min

6️⃣  Generating SHAP explanations for all 20 orders...
  ✅ Stored SHAP explanations in delivery_feedback table

7️⃣  Seeding Redis with driver familiarity and traffic patterns...
  ✅ Seeded 12 zone familiarity scores
  ✅ Seeded 20 traffic pattern keys

============================================================
SEEDING COMPLETE — HYDERABAD DEMO DATA READY
============================================================

📋 DRIVERS (4):
  • Ravi Kumar (bike, 15kg) - Hitech City, Madhapur, Kondapur
  • Saleem Mohammed (bike, 15kg) - Secunderabad, Begumpet, Trimulgherry
  • Venkat Reddy (auto, 50kg) - Banjara Hills, Jubilee Hills, Panjagutta
  • Priya Singh (car, 100kg) - LB Nagar, Dilsukhnagar, Kothapet

✅ Demo seeding completed in 4.2 seconds

👉 Next steps:
   1. Ensure API+Dashboard running
   2. Open http://localhost:8501
   3. Navigate to Orders tab
   4. Click Order E3 (Rush Hour Hero)
==============================================================
```

### Runtime

- **Duration**: ~4-5 seconds for full seeding
- **Database Size**: ~50KB (all orders + explanations)
- **Redis Keys**: ~32 total
- **Memory**: Negligible

### Idempotency

- Safe to run multiple times
- Existing drivers/orders not duplicated
- Uses `--reset` flag to force re-create
- Great for demo prep (run 30 min before each demo)

### Troubleshooting

**Database connection error**
```bash
# Check PostgreSQL is running
psql -U postgres -d intellog -c "SELECT 1;"

# Check DATABASE_URL
echo $DATABASE_URL
```

**Redis connection error**
```bash
# Check Redis is running
redis-cli ping  # Should return: PONG

# Script continues without Redis (tolerable for demo)
```

**Migration error**
```bash
# Check current migration
alembic current

# Run migrations
alembic upgrade head
```

### Integration with Other Scripts

Pairs well with:

- `train_model_production.py` — Train the ETA model that provides predictions
- `seed_db.py` — General database seeding (different from demo-specific seeding)
- `debug_backend.py` — Debug API during demo

### Files Modified

- `src/backend/app/db/models.py` — Added vehicle_type and zone_expertise to Driver
- `alembic/versions/2026_03_20_driver_expertise.py` — Database migration

### Documentation

See docs/:
- `HYDERABAD_DEMO_QUICKSTART.md` — 2-minute quick start
- `DEMO_SEEDING_GUIDE.md` — Complete technical reference  
- `DISPATCHER_DEMO_REFERENCE.md` — Demo talking points

### Key Demo Orders

| Order | Focus | ETA | SHAP Factor |
|-------|-------|-----|-------------|
| E3 | Rush Hour | 24 min | Traffic +8 min |
| E1 | Zone Unfamiliarity | 22 min | Wrong driver penalty |
| E2 | Zone Mismatch | 25 min | Expertise gap |
| E4 | Weather | 12 min | Rain impact |
| E5 | Weight Constraint | 14 min | Bike overload |

---

**For more information, see HYDERABAD_DEMO_QUICKSTART.md** 🚀
