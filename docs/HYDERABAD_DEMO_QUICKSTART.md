# 🚀 Hyderabad Demo Data Seeding — Quick Start

## TL;DR — Get Running in 2 Minutes

```bash
# 1. Run database migrations (one-time)
alembic upgrade head

# 2. Seed demo data
python scripts/seed_demo_hyderabad.py --reset --tenant-id demo-tenant-001

# 3. Open dashboard
streamlit run src/dashboard/app.py

# 4. View Orders → Click Order E3 (Rush Hour Hero)
```

That's it! ✅

---

## What Was Created

### Files Added
- `scripts/seed_demo_hyderabad.py` — Main seeding script (800+ lines)
- `scripts/seed-demo.ps1` — PowerShell wrapper for Windows
- `alembic/versions/2026_03_20_driver_expertise.py` — Database migration
- `docs/DEMO_SEEDING_GUIDE.md` — Complete reference guide
- `docs/DISPATCHER_DEMO_REFERENCE.md` — Demo talking points for presentation

### Database Changes
- Added `vehicle_type` field to `drivers` table (bike, auto, car)
- Added `zone_expertise` field to `drivers` table (JSON list of expert zones)

### Data Seeded
- **4 Demo Drivers**: Ravi (IT expert), Saleem (North expert), Venkat (Central expert), Priya (SE expert)
- **20 Realistic Orders**: 
  - Groups A-D: Standard orders assigned to appropriate drivers
  - Group E (5 orders): "Hero" orders designed for SHAP demonstration
- **SHAP Explanations**: Stored for all 20 orders in `delivery_feedback` table
- **Redis Cache**: Driver familiarity scores + traffic patterns

---

## The 5 "Hero" Demo Orders

These orders showcase different SHAP explanation factors:

| Order | Showcase | ETA | Factor |
|-------|----------|-----|--------|
| **E3** 🎬 | Rush Hour Traffic | 24 min | +7-8 min traffic (peak hour) |
| **E1** 🎬 | Zone Unfamiliarity | 22 min | +4-6 min (wrong driver) |
| **E2** 🎬 | Zone Mismatch | 25 min | +3-5 min (wrong expertise) |
| **E4** 🎬 | Weather Impact | 12 min | +2-3 min (rain multiplier) |
| **E5** 🎬 | Vehicle Weight | 14 min | +3-4 min (bike overload) |

**Primary Demo**: Start with **E3** (most realistic, traffic is the main Hyderabad pain point)

---

## Command Reference

```bash
# Basic seeding
python scripts/seed_demo_hyderabad.py --tenant-id demo-tenant-001

# Reset everything and reseed (use before each demo)
python scripts/seed_demo_hyderabad.py --reset --tenant-id demo-tenant-001

# Seed and verify (prints hero order details)
python scripts/seed_demo_hyderabad.py --verify --tenant-id demo-tenant-001

# Windows PowerShell
.\scripts\seed-demo.ps1 -Reset -Verify
```

---

## What Happens When You Run It

```
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
   ... [20 total]

4️⃣  Generating ETA predictions for all 20 orders...
   ✅ Order A1: ETA 10.2min (P10: 8.2, P90: 12.8)
   ✅ Order E3: ETA 24.1min (P10: 19.3, P90: 30.1)
   ... [20 total]

5️⃣  Assigning orders to drivers and creating routes...
   ✅ Ravi Kumar: 4 orders, 12.4km, ~45min
   ✅ Venkat Reddy: 5 orders, 28.3km, ~110min
   ✅ Saleem Mohammed: 3 orders, 18.5km, ~65min
   ✅ Priya Singh: 2 orders, 15.2km, ~52min

6️⃣  Generating SHAP explanations for all 20 orders...
   ✅ Stored SHAP explanations in delivery_feedback table

7️⃣  Seeding Redis...
   ✅ Seeded 12 zone familiarity scores
   ✅ Seeded 20 traffic pattern keys

===========================================
✅ Demo seeding completed in 4.2 seconds
===========================================

👉 Next steps:
   1. Ensure API+Dashboard running
   2. Open http://localhost:8501
   3. Navigate to Orders tab
   4. Click on Order E3, E1, or E5
```

---

## Expected Results in Dashboard

### Order E3 (Road Test - Always First)
- **ETA**: 24 minutes (realistic for rush hour)
- **Top SHAP Factors**:
  1. Traffic: +8 min (dispatcher knows this road!)
  2. Peak hour: +3 min
  3. Distance: +2 min
- **"What would help"**: Driver assignment suggestion if applicable

### Order E1 (Zone Expertise Test)
- **ETA**: 22 minutes (penalty for wrong zone)
- **SHAP Highlight**: Zone unfamiliarity: +4-6 min
- **Suggestion**: "Assign Ravi Kumar instead, saves ~5 min"

### Order E5 (Vehicle Constraints Test)
- **ETA**: 14 minutes (heavier than bike capacity)
- **SHAP Highlight**: Weight penalty: +3-4 min
- **Suggestion**: "Use Venkat's auto for this weight"

---

## Verification Checklist

After seeding, verify:

✅ **Database**:
```bash
# Check orders created
psql -c "SELECT COUNT(*) FROM orders WHERE tenant_id = 'demo-tenant-001';" intellog
# Expected: 20

# Check drivers created
psql -c "SELECT name, vehicle_type, zone_expertise FROM drivers WHERE tenant_id = 'demo-tenant-001';" intellog
# Expected: 4 rows with vehicle_type and zone_expertise populated

# Check SHAP explanations
psql -c "SELECT COUNT(*) FROM delivery_feedback WHERE tenant_id = 'demo-tenant-001';" intellog
# Expected: 20
```

✅ **Redis**:
```bash
redis-cli KEYS "driver:*:familiarity:*" | wc -l
# Expected: 12 keys

redis-cli KEYS "traffic:*" | wc -l
# Expected: 20+ keys
```

✅ **Dashboard**:
- Orders visible in Orders tab
- SHAP explanations shown for E3, E1, E5
- ETA values reasonable (20-25min for demo orders)
- Driver assignments match seeding script

---

## Troubleshooting

### "Migration not found"
```bash
alembic current
alembic upgrade head
```

### "Database connection refused"
```bash
# Check PostgreSQL running
psql -U postgres -d intellog -c "SELECT 1;"

# Check settings
echo $DATABASE_URL
# Should be: postgresql://postgres:postgres@localhost:5433/intellog
```

### "Redis connection failed"
```bash
# Check Redis running
redis-cli ping
# Should return: PONG

# Check settings
echo $REDIS_URL
# Should be: redis://localhost:6379/0
```

### "Order not showing in dashboard"
```bash
# Refresh browser (Ctrl+F5)
# Check database directly:
psql -c "SELECT order_number, delivery_address FROM orders WHERE tenant_id = 'demo-tenant-001' LIMIT 5;" intellog
```

---

## Before Each Demo

**30 minutes before**:
```bash
# Reset and reseed fresh data
python scripts/seed_demo_hyderabad.py --reset --tenant-id demo-tenant-001

# Verify
python scripts/seed_demo_hyderabad.py --verify --tenant-id demo-tenant-001
```

**5 minutes before**:
- Open dashboard
- Click on Orders
- Verify E3, E1, E5 visible
- Click E3 to confirm SHAP explanation loads

---

## Demo Narrative (5 minutes)

1. **Open Order E3** (Rush Hour)
   - "24 minutes for 3.2 km — why?"
   - "System explains: Traffic +8min, Peak hour +3min, Distance +2min"
   - "This matches your experience at 5 PM on this route, right?"

2. **Open Order E1** (Zone Unfamiliarity)
   - "See what happens with wrong driver assignment"
   - "Zone unfamiliarity penalty: +4-6 minutes"
   - "System suggests Ravi Kumar instead, saves ~5 minutes"
   - "Would you reassign? → YES"

3. **Open Order E5** (Vehicle Constraint)
   - "System knows vehicle capacity limits"
   - "18.5 kg on 15 kg bike = +3-4 min penalty"
   - Shows system is realistic, not generic

4. **Ask Dispatcher**:
   - "What other factors should we track?"
   - "Traffic patterns match your experience?" → Usually YES
   - "Would this help your operations?" → Often YES

---

## File Structure

```
scripts/
  └── seed_demo_hyderabad.py          ← Main seeding script
  └── seed-demo.ps1                   ← Windows wrapper

alembic/versions/
  └── 2026_03_20_driver_expertise.py  ← Migration

docs/
  ├── DEMO_SEEDING_GUIDE.md           ← Complete reference
  ├── DISPATCHER_DEMO_REFERENCE.md    ← Talking points
  └── HYDERABAD_DEMO_QUICKSTART.md    ← This file
```

---

## Architecture Overview

```
Seed Script
    ↓
Creates Database Records
    ├── 4 Drivers (with zone_expertise)
    ├── 1 Warehouse
    ├── 20 Orders
    ├── 4 Routes (one per driver)
    └── 20 DeliveryFeedback (with SHAP explanations)
    ↓
Calculates ETAs
    └── Uses traffic multipliers, weather, weight factors
    ↓
Generates SHAP Explanations
    └── Stores JSON with factors, impacts, suggestions
    ↓
Seeds Redis
    ├── 12 driver familiarity scores
    └── 20 traffic patterns
    ↓
Dashboard Displays
    └── Orders with SHAP tabs showing factors
```

---

## Key Features

✅ **Realistic Hyderabad Data**
- Actual verified coordinates
- Real traffic patterns (rush hour 2.1x, old city 1.6x, etc.)
- Driver zone expertise (not generic zones)

✅ **SHAP Explanations**
- Each order has human-readable factors
- Specific time impacts (+8 min, +3 min, etc.)
- Actionable suggestions ("Change to X driver")

✅ **Demo-Ready**
- 5 hero orders showcase different factors
- Idempotent (safe to reseed many times)
- Fast (<5 seconds to seed 20 orders)

✅ **Dispatcher-Friendly**
- Geography immediately recognizable
- Traffic patterns match real experience
- Suggestions are specific and quantified

---

## What Dispatcher Will Think

✨ **"Oh, you know the roads in Hyderabad!"**

✨ **"You explain why the ETA is what it is!"**

✨ **"You suggest specific drivers, not just 'someone else'!"**

✨ **"This could actually help me dispatch better!"**

---

## Support

For detailed information, see:
- `DEMO_SEEDING_GUIDE.md` — Complete technical reference
- `DISPATCHER_DEMO_REFERENCE.md` — Presentation talking points
- `scripts/seed_demo_hyderabad.py` — Well-commented source code

**Ready to demo! 🚀**
